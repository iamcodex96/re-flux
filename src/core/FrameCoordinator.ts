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
  active: boolean;
  running: boolean;
  /** Persistent channel only: true while the entry sits in the write queue. */
  queued: boolean;
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
  private readonly readQueue: ScheduledFrameTask[] = [];
  private readonly writeQueue: ScheduledFrameTask[] = [];
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
    const error = this.ensureClock();

    if (error) {
      this.frameSubscribers.delete(subscriber);
      subscriber.error(error);
      return undefined;
    }

    return () => {
      this.frameSubscribers.delete(subscriber);
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
    const entry: ScheduledFrameTask = { callback, subscription: null, active: true, running: false, queued: false };
    return {
      request: () => {
        if (!entry.active || entry.queued) return;
        entry.queued = true;
        this.writeQueue.push(entry);
        const error = this.ensureClock();
        if (error) {
          entry.queued = false;
          this.removeTask(entry);
          throw error;
        }
      },
      dispose: () => {
        if (!entry.active) return;
        entry.active = false;
        if (entry.running) return;
        if (entry.queued) {
          entry.queued = false;
          this.removeTask(entry);
          this.stopIfIdle();
        }
      },
    };
  }

  private schedule(task: FrameTask, queue: ScheduledFrameTask[]): Subscription {
    const subscription = new Subscription();
    const entry: ScheduledFrameTask = {
      callback: task,
      subscription,
      active: true,
      running: false,
      queued: true,
    };
    subscription.add(() => {
      entry.active = false;
      if (entry.running) return;
      this.removeTask(entry);
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

  private removeTask(task: ScheduledFrameTask): void {
    const readIndex = this.readQueue.indexOf(task);
    if (readIndex >= 0) this.readQueue.splice(readIndex, 1);
    const writeIndex = this.writeQueue.indexOf(task);
    if (writeIndex >= 0) this.writeQueue.splice(writeIndex, 1);
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
        const queuedTasks = [...this.readQueue, ...this.writeQueue];
        this.readQueue.length = 0;
        this.writeQueue.length = 0;
        for (const task of queuedTasks) {
          if (task.subscription) task.subscription.unsubscribe();
          else task.queued = false;
        }

        for (const subscriber of [...this.frameSubscribers]) subscriber.error(error);
        this.frameSubscribers.clear();
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

     
    if (this.readQueue.length > 0) this.runTasks(this.readQueue.splice(0), frame);

    for (const subscriber of [...this.frameSubscribers]) {
      if (!subscriber.closed) subscriber.next(frame);
    }

     
     
    if (this.writeQueue.length > 0) this.runTasks(this.writeQueue.splice(0), frame);
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

  private runTasks(tasks: ScheduledFrameTask[], frame: AnimationFrameTick): void {
    for (const task of tasks) {
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
  }

  private makeMetrics(): FrameCoordinatorMetrics {
    return Object.freeze({
      totalFrames: this.totalFrames,
      lastFrameWorkMs: this.lastFrameWorkMs,
      averageFrameWorkMs: this.measuredFrameCount > 0 ? this.totalFrameWorkMs / this.measuredFrameCount : 0,
      maxFrameWorkMs: this.maxFrameWorkMs,
      activeFrameSubscribers: this.frameSubscribers.size,
      pendingReadTasks: this.readQueue.length,
      pendingWriteTasks: this.writeQueue.length,
      clockActive: Boolean(this.clockSubscription && !this.clockSubscription.closed),
    });
  }

  private stopIfIdle(): void {
    if (this.frameSubscribers.size > 0 || this.readQueue.length > 0 || this.writeQueue.length > 0) return;

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
