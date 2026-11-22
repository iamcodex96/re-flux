import { Observable, Subject, Subscription, type Subscriber } from 'rxjs';
import type { AnimationFrameTick } from '../types/frames.js';
import { animationFrame$ } from '../utils/animationFrame.js';

/** Callback run during a frame coordinator phase. */
export type FrameTask = (frame: AnimationFrameTick) => void;

/** Runtime counters for scheduler observability and leak assertions. */
export interface FrameCoordinatorMetrics {
  readonly totalFrames: number;
  readonly lastFrameWorkMs: number;
  readonly averageFrameWorkMs: number;
  readonly maxFrameWorkMs: number;
  readonly activeFrameSubscribers: number;
  readonly pendingReadTasks: number;
  readonly pendingWriteTasks: number;
  readonly clockActive: boolean;
}

export interface FrameCoordinatorDiagnostics extends FrameCoordinatorMetrics {
  readonly isIdle: boolean;
}

/**
 * Coordinates work around one shared requestAnimationFrame source.
 * Reads run before frame consumers; writes run after frame consumers.
 */
interface ScheduledFrameTask {
  readonly callback: FrameTask;
  /** `null` for a persistent write channel, which has no per-request Subscription. */
  readonly subscription: Subscription | null;
  /** The phase queue this task belongs to; it keeps the pending count for it. */
  readonly queue: PhaseQueue;
  active: boolean;
  running: boolean;
  /** True from the moment the entry is queued until it runs or is cancelled. */
  queued: boolean;
  /** The `PhaseQueue` generation the entry was pushed in; see `PhaseQueue.cancel`. */
  generation: number;
}

/** Cancelled entries are only compacted away once at least this many have piled up and they outnumber the live ones. */
const MIN_TOMBSTONES_TO_COMPACT = 32;

/**
 * The tasks of one frame phase (all reads, or all writes) in scheduling order.
 *
 * Cancelling a queued task is O(1): the entry stays in the array as a tombstone (`queued === false`) and is skipped when
 * the batch runs, instead of being found with `indexOf` and spliced out. `live` counts the entries that will still run,
 * so diagnostics and the idle check never see tombstones. A frame detaches the whole batch with `take()` and hands the
 * emptied array back with `release()`, so two arrays are reused forever instead of one being allocated per frame.
 */
class PhaseQueue {
  private items: ScheduledFrameTask[] = [];
  private spare: ScheduledFrameTask[] | null = [];
  /** Entries in `items` that have not been cancelled. */
  live = 0;
  private dead = 0;
  /** Bumped by every `take()`, so an entry can tell whether it is still in `items` or already in a running batch. */
  private generation = 0;

  push(entry: ScheduledFrameTask): void {
    entry.queued = true;
    entry.generation = this.generation;
    this.items.push(entry);
    this.live += 1;
  }

  /** Cancels a pending entry without searching for it. Entries that already left for a running batch are only flagged. */
  cancel(entry: ScheduledFrameTask): void {
    if (!entry.queued) return;
    entry.queued = false;
    if (entry.generation !== this.generation) return;
    this.live -= 1;
    this.dead += 1;
    if (this.live === 0) {
      this.items.length = 0;
      this.dead = 0;
    } else if (this.dead >= MIN_TOMBSTONES_TO_COMPACT && this.dead > this.live) {
      this.compact();
    }
  }

  /** Detaches everything queued so far (including tombstones, which the caller skips) and starts an empty batch. */
  take(): ScheduledFrameTask[] {
    const batch = this.items;
    this.items = this.spare ?? [];
    this.spare = null;
    this.generation += 1;
    this.live = 0;
    this.dead = 0;
    return batch;
  }

  /** Returns a batch from `take()` once it has run, so its array can be reused. */
  release(batch: ScheduledFrameTask[]): void {
    batch.length = 0;
    this.spare = batch;
  }

  private compact(): void {
    const items = this.items;
    let kept = 0;
    for (let index = 0; index < items.length; index += 1) {
      const entry = items[index]!;
      if (entry.queued) items[kept++] = entry;
    }
    items.length = kept;
    this.dead = 0;
  }
}

/**
 * A reusable write-phase slot for code that wants "run this callback in the next write phase, at
 * most once per frame" without allocating a task and a Subscription per request.
 * @internal Used by `bindCanvas`; not part of the public API.
 */
export interface WriteChannel {
  /** Queue the callback for this frame's write phase if it is not queued already. */
  request(): void;
  /** Drop any queued run and make later `request()` calls no-ops. Idempotent. */
  dispose(): void;
}

export class FrameCoordinator {
  private readonly frameSubscribers = new Set<Subscriber<AnimationFrameTick>>();
  /** Array copy of `frameSubscribers` for the consumer phase; never mutated, replaced (`null` until rebuilt) after a membership change. */
  private frameSubscriberSnapshot: Subscriber<AnimationFrameTick>[] | null = null;
  private readonly readQueue = new PhaseQueue();
  private readonly writeQueue = new PhaseQueue();
  private clockSubscription: Subscription | null = null;
  private lastTimestamp: number | null = null;
  private frameNumber = 0;
  private lastClockError: unknown = null;
  private totalFrames = 0;
  private measuredFrameCount = 0;
  private totalFrameWorkMs = 0;
  private lastFrameWorkMs = 0;
  private maxFrameWorkMs = 0;
  private readonly metricsSubject = new Subject<FrameCoordinatorMetrics>();
  private metricsObserverCount = 0;

  /**
   * Emits shared-scheduler metrics while observed; timing measurements are skipped without subscribers.
   * Subscribing does not start the RAF clock.
   */
  readonly metrics$ = new Observable<FrameCoordinatorMetrics>((subscriber) => {
    this.metricsObserverCount += 1;
    const subscription = this.metricsSubject.subscribe(subscriber);
    subscriber.next(this.makeMetrics());
    return () => {
      subscription.unsubscribe();
      this.metricsObserverCount = Math.max(0, this.metricsObserverCount - 1);
    };
  });

  /** Immutable current metrics snapshot, including queued work. */
  get metrics(): FrameCoordinatorMetrics {
    return this.makeMetrics();
  }

  /** Cheap diagnostic snapshot suitable for asserting that an instance has no leaked work. */
  getDiagnostics(): FrameCoordinatorDiagnostics {
    const metrics = this.makeMetrics();
    return Object.freeze({
      ...metrics,
      isIdle: !metrics.clockActive && metrics.activeFrameSubscribers === 0
        && metrics.pendingReadTasks === 0 && metrics.pendingWriteTasks === 0,
    });
  }

  /** Throws a useful error when consumers or scheduled tasks remain attached. */
  assertIdle(): void {
    const diagnostics = this.getDiagnostics();
    if (!diagnostics.isIdle) {
      throw new Error(`FrameCoordinator is not idle: ${diagnostics.activeFrameSubscribers} frame subscriber(s), ${diagnostics.pendingReadTasks} read task(s), ${diagnostics.pendingWriteTasks} write task(s), clockActive=${diagnostics.clockActive}.`);
    }
  }

  readonly frames$: Observable<AnimationFrameTick> = new Observable<AnimationFrameTick>((subscriber) => {
    this.frameSubscribers.add(subscriber);
    this.frameSubscriberSnapshot = null;
    const error = this.ensureClock();

    if (error) {
      this.frameSubscribers.delete(subscriber);
      this.frameSubscriberSnapshot = null;
      subscriber.error(error);
      return undefined;
    }

    return () => {
      this.frameSubscribers.delete(subscriber);
      this.frameSubscriberSnapshot = null;
      this.stopIfIdle();
    };
  });

  /** Queues a one-shot read task. Unsubscribe the returned Subscription to cancel it. */
  scheduleRead(task: FrameTask): Subscription {
    return this.schedule(task, this.readQueue);
  }

  /** Queues a one-shot write task. Unsubscribe the returned Subscription to cancel it. */
  scheduleWrite(task: FrameTask): Subscription {
    return this.schedule(task, this.writeQueue);
  }

  /** @internal Open a reusable write channel; see {@link openWriteChannel}. */
  private createWriteChannel(callback: FrameTask): WriteChannel {
    const entry: ScheduledFrameTask = { callback, subscription: null, queue: this.writeQueue, active: true, running: false, queued: false, generation: 0 };
    return {
      request: () => {
        if (!entry.active || entry.queued) return;
        this.writeQueue.push(entry);
        const error = this.ensureClock();
        if (error) {
          this.writeQueue.cancel(entry);
          throw error;
        }
      },
      dispose: () => {
        if (!entry.active) return;
        entry.active = false;
        if (entry.running) return;
        if (entry.queued) {
          this.writeQueue.cancel(entry);
          this.stopIfIdle();
        }
      },
    };
  }

  private schedule(task: FrameTask, queue: PhaseQueue): Subscription {
    const subscription = new Subscription();
    const entry: ScheduledFrameTask = {
      callback: task,
      subscription,
      queue,
      active: true,
      running: false,
      queued: false,
      generation: 0,
    };
    subscription.add(() => {
      entry.active = false;
      if (entry.running) return;
      queue.cancel(entry);
      this.stopIfIdle();
    });
    queue.push(entry);

    const error = this.ensureClock();
    if (error) {
      subscription.unsubscribe();
      throw error;
    }
    return subscription;
  }

  private ensureClock(): Error | null {
    if (this.clockSubscription && !this.clockSubscription.closed) return null;

    this.lastClockError = null;
    const subscription = animationFrame$.subscribe({
      next: (timestamp) => this.handleFrame(timestamp),
      error: (error: unknown) => {
        this.lastClockError = error;
        this.clockSubscription = null;
        this.lastTimestamp = null;
        this.frameNumber = 0;
        for (const queue of [this.readQueue, this.writeQueue]) {
          const queuedTasks = queue.take();
          for (const task of queuedTasks) {
            if (task.subscription) task.subscription.unsubscribe();
            else task.queued = false;
          }
          queue.release(queuedTasks);
        }

        const subscribers = Array.from(this.frameSubscribers);
        this.frameSubscriberSnapshot = null;
        for (const subscriber of subscribers) subscriber.error(error);
        this.frameSubscribers.clear();
        this.frameSubscriberSnapshot = null;
      },
    });

     
    if (subscription.closed) {
      this.clockSubscription = null;
      return this.lastClockError instanceof Error
        ? this.lastClockError
        : new Error('FrameCoordinator requires requestAnimationFrame and cancelAnimationFrame.');
    }

    this.clockSubscription = subscription;
    return null;
  }

  private handleFrame(timestamp: number): void {
    const measureWork = this.metricsObserverCount > 0;
    const workStartedAt = measureWork ? monotonicNow() : 0;
    const delta = this.lastTimestamp === null ? 0 : Math.max(0, timestamp - this.lastTimestamp);
    this.lastTimestamp = timestamp;
    this.frameNumber += 1;
    const frame: AnimationFrameTick = Object.freeze({ timestamp, delta, frame: this.frameNumber });

     
    if (this.readQueue.live > 0) this.runTasks(this.readQueue, frame);

    // The snapshot is taken here, after the read phase: a subscriber added by a read task is in it, one added from now
    // on is not (it is a different array by then). It is rebuilt only after a membership change, not every frame.
    const subscribers = this.frameSubscriberSnapshot ?? (this.frameSubscriberSnapshot = Array.from(this.frameSubscribers));
    for (let index = 0; index < subscribers.length; index += 1) {
      const subscriber = subscribers[index]!;
      if (!subscriber.closed) subscriber.next(frame);
    }

     
     
    if (this.writeQueue.live > 0) this.runTasks(this.writeQueue, frame);
    this.stopIfIdle();

    this.totalFrames += 1;
    if (measureWork && this.metricsObserverCount > 0) {
      const workMs = Math.max(0, monotonicNow() - workStartedAt);
      this.measuredFrameCount += 1;
      this.totalFrameWorkMs += workMs;
      this.lastFrameWorkMs = workMs;
      this.maxFrameWorkMs = Math.max(this.maxFrameWorkMs, workMs);
      this.metricsSubject.next(this.makeMetrics());
    }
  }

  private runTasks(queue: PhaseQueue, frame: AnimationFrameTick): void {
    // Tasks queued while this batch runs go into the queue's next batch, which belongs to the next frame.
    const tasks = queue.take();
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index]!;
      if (!task.active) continue;
      task.queued = false;
      task.running = true;
      try {
        task.callback(frame);
      } catch (error: unknown) {
         
        queueMicrotask(() => { throw error; });
      } finally {
         
        if (task.subscription) task.subscription.unsubscribe();
        task.running = false;
      }
    }
    queue.release(tasks);
  }

  private makeMetrics(): FrameCoordinatorMetrics {
    return Object.freeze({
      totalFrames: this.totalFrames,
      lastFrameWorkMs: this.lastFrameWorkMs,
      averageFrameWorkMs: this.measuredFrameCount > 0 ? this.totalFrameWorkMs / this.measuredFrameCount : 0,
      maxFrameWorkMs: this.maxFrameWorkMs,
      activeFrameSubscribers: this.frameSubscribers.size,
      pendingReadTasks: this.readQueue.live,
      pendingWriteTasks: this.writeQueue.live,
      clockActive: Boolean(this.clockSubscription && !this.clockSubscription.closed),
    });
  }

  private stopIfIdle(): void {
    if (this.frameSubscribers.size > 0 || this.readQueue.live > 0 || this.writeQueue.live > 0) return;

    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.lastTimestamp = null;
    this.frameNumber = 0;
  }
}

function monotonicNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
  return Date.now();
}

/**
 * Open a reusable write-phase channel on `coordinator` (default: the shared one).
 * @internal Not re-exported from the package entry points.
 */
export function openWriteChannel(callback: FrameTask, coordinator: FrameCoordinator = frameCoordinator): WriteChannel {
  // Bracket access is the TypeScript-sanctioned way to reach a private member from the same module.
  return coordinator['createWriteChannel'](callback);
}

/** Default coordinator used by Animation, Timeline and value streams. */
export const frameCoordinator = new FrameCoordinator();
