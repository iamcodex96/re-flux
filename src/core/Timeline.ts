import { BehaviorSubject, type Subscription } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimatableItem, AnimationState, TimelineOffset, TimelineOptions, TimelineSegment } from '../types/animation.js';
import { Completion } from './Completion.js';
import { frameCoordinator } from './FrameCoordinator.js';
import { MotionLifecycleController } from './MotionLifecycleController.js';
import { assertFiniteNonNegative } from '../utils/timing.js';

const STOPPED_ERROR = 'Animation stopped before completion';

interface InternalSegment {
  item: AnimatableItem;
  startTime: number;
  endTime: number;
  duration: number;
  beforeStart: boolean;
}

/** Coordinates entries without calling play(): the global playhead drives each child through seekLocal(). */
export class Timeline implements AnimatableItem, PromiseLike<void> {
  private readonly progressSubject = new BehaviorSubject<number>(0);
  private readonly stateSubject = new BehaviorSubject<AnimationState>('idle');
  readonly progress$: ReadonlyBehaviorObservable<number> = readonlyBehavior(this.progressSubject);
  readonly state$: ReadonlyBehaviorObservable<AnimationState> = readonlyBehavior(this.stateSubject);

  private readonly options: Readonly<TimelineOptions>;
  private readonly entries: InternalSegment[] = [];
  private durationValue = 0;
  private parentOwner: Timeline | null = null;
  private readonly labels = new Map<string, number>();
  private readonly completion = new Completion();
  private clockSubscription: Subscription | null = null;
  private currentTimeValue = 0;
  private hasStarted = false;
  private hasCompleted = false;
  private lastAddedStart = 0;
  private lastAddedEnd = 0;
  private motionLifecycle: MotionLifecycleController | null = null;
  private playbackRate = 1;
  private playbackDirection: 1 | -1 = 1;
  private structureLocked = false;

  constructor(options: TimelineOptions = {}) {
    this.options = Object.freeze({ ...options });
  }

  get duration(): number {
    return this.durationValue;
  }

  /** Current playhead in milliseconds. */
  get currentTime(): number { return this.currentTimeValue; }

  /** Current normalized playhead progress. */
  get progress(): number { return this.duration > 0 ? Math.min(1, Math.max(0, this.currentTimeValue / this.duration)) : this.progress$.value; }

  /** True while the clock advances toward the start. */
  get isReversed(): boolean { return this.playbackDirection === -1; }

  /** Read-only named timeline positions, useful for editors and visual inspectors. */
  get timelineLabels(): Readonly<Record<string, number>> {
    return Object.freeze(Object.fromEntries(this.labels));
  }

  /** Read-only snapshot for rendering a Gantt chart without exposing the internal array. */
  get segments(): readonly TimelineSegment[] {
    return this.entries.map((segment) => Object.freeze({
      item: segment.item,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.duration,
    }));
  }

  add(item: AnimatableItem, offset?: TimelineOffset): this {
    if (!item || typeof item.seekLocal !== 'function' || typeof item.resetInternal !== 'function') {
      throw new TypeError('Timeline item must implement seekLocal() and resetInternal().');
    }
    if (item === this) throw new TypeError('A Timeline cannot contain itself.');
    if (item instanceof Timeline) {
      if (item.containsTimeline(this)) {
        throw new TypeError('Adding this Timeline would create a nested Timeline cycle.');
      }
      if (item.parentOwner) {
        throw new TypeError(item.parentOwner === this
          ? 'A nested Timeline can only be added once to a parent Timeline.'
          : 'A Timeline can only belong to one parent Timeline.');
      }
      if (item.hasActiveClock()) {
        throw new Error('Cannot add a running Timeline as a child. Stop it before adding it to a parent Timeline.');
      }
    }
    this.assertStructureMutable();
    const startTime = this.resolveOffset(offset);
    const duration = item.duration;
    if (typeof duration !== 'number' || Number.isNaN(duration) || duration < 0 || (!Number.isFinite(duration) && duration !== Infinity)) {
      throw new RangeError('Timeline child duration must be a non-negative finite number or Infinity.');
    }
    const endTime = startTime + duration;
    if (duration !== Infinity && !Number.isFinite(endTime)) {
      throw new RangeError('Timeline segment end time must be finite; reduce the offset or child duration.');
    }
    const segment: InternalSegment = { item, startTime, endTime, duration, beforeStart: false };
    if (item instanceof Timeline) item.parentOwner = this;
    this.entries.push(segment);
    this.durationValue = Math.max(this.durationValue, endTime);
    this.lastAddedStart = startTime;
    this.lastAddedEnd = segment.endTime;
     
    return this;
  }

  /** Add or move a named position; offsets may refer to an existing label. */
  addLabel(name: string, offset?: TimelineOffset): this {
    this.assertStructureMutable();
    const label = name.trim();
    if (!label) throw new TypeError('Timeline label must not be empty.');
    if (!/^[\w.-]+$/.test(label)) throw new TypeError('Timeline labels may contain only letters, numbers, underscores, dots and hyphens.');
    if (this.labels.has(label)) throw new RangeError(`Timeline label "${label}" already exists. Use removeLabel() before replacing it.`);
    const time = offset === undefined ? this.duration : this.resolveOffset(offset);
    assertFiniteNonNegative(time, 'Timeline label position');
    this.labels.set(label, time);
    return this;
  }

  /** Remove a label without changing any segment positions. */
  removeLabel(name: string): this { this.assertStructureMutable(); this.labels.delete(name); return this; }

  /** Resolve a label to its absolute time. */
  labelTime(name: string): number | undefined { return this.labels.get(name); }

  /** Add a callback at a timeline position. Seeking across the position triggers it once per pass. */
  call(callback: () => void, offset?: TimelineOffset): this {
    if (typeof callback !== 'function') throw new TypeError('Timeline callback must be a function.');
    let invoked = false;
    let waitingForForwardCrossing = false;
    let lastLocalTime: number | null = null;
    const action: AnimatableItem = {
      duration: 0,
      seekLocal: (localTime) => {
        if (lastLocalTime !== null && localTime < lastLocalTime) {
          // A callback at offset zero can never move to a time before its own segment.
          // Re-arm it when the playhead crosses back to the marker, but don't invoke it
          // while travelling backward; the next forward crossing starts the next pass.
          if (lastLocalTime > 0 && localTime <= 0) {
            invoked = false;
            waitingForForwardCrossing = true;
          }
          lastLocalTime = localTime;
          return;
        }

        const movedForward = lastLocalTime !== null && localTime > lastLocalTime;
        lastLocalTime = localTime;
        if (waitingForForwardCrossing) {
          if (!movedForward) return;
          waitingForForwardCrossing = false;
        }
        if (!invoked) {
          invoked = true;
          callback();
        }
      },
      resetInternal: () => {
        invoked = false;
        waitingForForwardCrossing = false;
        lastLocalTime = null;
      },
    };
    const previousStart = this.lastAddedStart;
    const previousEnd = this.lastAddedEnd;
    this.add(action, offset);
     
    this.lastAddedStart = previousStart;
    this.lastAddedEnd = previousEnd;
    return this;
  }

  /** Read or set playback speed. Values must be finite and greater than zero. */
  timeScale(): number;
  timeScale(value: number): this;
  timeScale(value?: number): number | this {
    if (value === undefined) return this.playbackRate;
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Timeline timeScale must be a finite number greater than zero.');
    this.playbackRate = value;
    return this;
  }

  /** Seek by normalized progress, clamped to the inclusive range [0, 1]. */
  seekProgress(progress: number): this {
    const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
    return this.seek(this.duration * normalized);
  }

  /** Play backward from the current position; when at the start, begin at the timeline end. */
  reverse(): this {
    this.assertNotParentOwned('reverse');
    this.playbackDirection = -1;
    if (this.currentTimeValue <= 0) this.currentTimeValue = this.duration;
    if (this.state$.value === 'completed' || this.completion.isSettled) this.completion.ensurePending();
    if (this.clockSubscription) return this;
    if (!this.ensureMotionLifecycle().requestPlay()) return this;
    this.lockStructure();
    this.startClock();
    return this;
  }

  play(): this {
    this.assertNotParentOwned('play');
    if (this.state$.value === 'completed') { this.resetInternal(); this.playbackDirection = 1; }
    this.completion.ensurePending();
    if (this.clockSubscription) return this;
    if (!this.ensureMotionLifecycle().requestPlay()) return this;
    this.lockStructure();
    this.startClock();
    return this;
  }

  private startClock(callResume?: boolean): void {
    if (this.clockSubscription) return;
    const wasPaused = this.state$.value === 'paused';
    this.setState('running');
    if (wasPaused && (callResume ?? true)) this.options.onResume?.();
    let firstFrame = true;
    const subscription = frameCoordinator.frames$.subscribe({
      next: (frame) => {
         
        if (firstFrame) {
          firstFrame = false;
           
           
           
          this.updateAt(this.currentTimeValue, this.duration === 0 ? 'forward' : 'none');
          return;
        }
        const nextTime = this.currentTimeValue + frame.delta * this.playbackRate * this.playbackDirection;
        if (this.playbackDirection < 0) this.updateAt(Math.max(0, nextTime), 'reverse');
        else this.updateAt(nextTime, 'forward');
      },
      error: (error: unknown) => {
        this.clockSubscription = null;
        this.clearMotionLifecycle();
        this.setState('idle');
        this.completion.reject(error);
      },
    });
     
    this.clockSubscription = subscription.closed ? null : subscription;
  }

  /** @internal Lets a parent Timeline pause this nested timeline and its active children. */
  pauseFromParent(): void {
    if (this.state$.value === 'running') {
      this.setState('paused');
      for (const segment of this.entries) segment.item.pauseFromParent?.();
      this.options.onPause?.();
    }
  }

  pause(): this {
    this.assertNotParentOwned('pause');
    if (!this.clockSubscription) {
      this.motionLifecycle?.cancelAutomaticResume();
      return this;
    }
    this.clockSubscription.unsubscribe();
    this.clockSubscription = null;
    this.setState('paused');
    for (const segment of this.entries) segment.item.pauseFromParent?.();
    this.options.onPause?.();
    return this;
  }

  stop(): this {
    this.assertNotParentOwned('stop');
    const wasPending = !this.completion.isSettled;
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.options.onStop?.();
    this.clearMotionLifecycle();
    this.currentTimeValue = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.structureLocked = false;
    for (const segment of this.entries) {
      segment.item.resetInternal();
      segment.beforeStart = true;
    }
    this.progressSubject.next(0);
    this.setState('idle');
    if (wasPending) this.completion.reject(new Error(STOPPED_ERROR));
    return this;
  }

  restart(): this {
    this.assertNotParentOwned('restart');
    this.playbackDirection = 1;
    this.clearMotionLifecycle();
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.completion.restart(new Error(STOPPED_ERROR));
    this.currentTimeValue = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.structureLocked = false;
    for (const segment of this.entries) {
      segment.item.resetInternal();
      segment.beforeStart = true;
    }
    this.progressSubject.next(0);
    this.setState('idle');
    return this.play();
  }

  /** Scrubs the playhead without starting a frame clock. */
  seek(ms: number): this {
    this.assertNotParentOwned('seek');
    const target = Number.isFinite(ms) ? Math.max(0, ms) : 0;
    if (target > 0) this.lockStructure();
    this.seekLocal(target, !this.hasActiveClock());
    return this;
  }

  /** @internal The parent provides local time; a nested Timeline never starts another RAF loop. */
  seekLocal(ms: number, preservePlaybackState = false): void {
    if (ms > 0) this.lockStructure();
    if (!Number.isFinite(ms) && ms !== Infinity) ms = 0;
    if (ms < 0) {
      this.resetInternal();
      return;
    }
    this.updateAt(ms, 'forward', preservePlaybackState);
  }

  private updateAt(ms: number, completionMode: 'forward' | 'reverse' | 'none', preservePlaybackState = false): void {
    if (!Number.isFinite(ms) && ms !== Infinity) ms = 0;
    const total = this.duration;
    const bounded = completionMode === 'reverse'
      ? Math.max(0, ms)
      : (Number.isFinite(total) ? Math.min(Math.max(0, ms), total) : Math.max(0, ms));
    const completeNow = Number.isFinite(total) && (
      (completionMode === 'forward' && bounded >= total) ||
      (completionMode === 'reverse' && bounded <= 0)
    );
    if (completeNow && this.hasCompleted) return;
    if (!completeNow) this.hasCompleted = false;
    this.currentTimeValue = bounded;
     
    const previousState = this.state$.value;
    if (!preservePlaybackState) {
      this.setState('running');
      if (previousState === 'paused') this.options.onResume?.();
    } else if (previousState === 'completed' && !completeNow) this.setState('idle');
    if (!this.hasStarted) {
      this.hasStarted = true;
      this.options.onStart?.();
    }

     
    for (const segment of this.entries) {
      if (bounded < segment.startTime) {
        if (!segment.beforeStart) {
          segment.item.resetInternal();
          segment.beforeStart = true;
        }
      } else {
        segment.beforeStart = false;
        segment.item.seekLocal(bounded - segment.startTime, preservePlaybackState);
      }
    }

    const progress = total > 0 && Number.isFinite(total) ? Math.min(1, bounded / total) : (completionMode === 'reverse' ? 0 : (bounded >= total ? 1 : 0));
    this.progressSubject.next(progress);
    this.options.onUpdate?.(progress, progress);

    if (completeNow && !this.hasCompleted) {
      this.hasCompleted = true;
      this.clearMotionLifecycle();
      this.setState('completed');
      this.clockSubscription?.unsubscribe();
      this.clockSubscription = null;
      this.options.onComplete?.();
      this.completion.resolve();
    }
  }

  /** Reset without callbacks so a parent Timeline can control this item. */
  resetInternal(): void {
    this.clearMotionLifecycle();
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.currentTimeValue = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.structureLocked = false;
    for (const segment of this.entries) {
      segment.item.resetInternal();
      segment.beforeStart = true;
    }
    this.progressSubject.next(0);
    this.setState('idle');
    this.completion.ensurePending();
  }

  toPromise(): Promise<void> {
    return this.completion.promise;
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.completion.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<void | TResult> {
    return this.completion.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.completion.promise.finally(onfinally);
  }

  private ensureMotionLifecycle(): MotionLifecycleController {
    if (!this.motionLifecycle) {
      this.motionLifecycle = new MotionLifecycleController(this.options.motion, {
        isRunning: () => Boolean(this.clockSubscription && !this.clockSubscription.closed),
        holdBeforeVisible: () => this.setState('paused'),
        pauseForLifecycle: () => {
          if (this.clockSubscription) this.pause();
          else this.setState('paused');
        },
        resumeFromLifecycle: (wasPaused) => this.startClock(wasPaused),
        finishForReducedMotion: () => {
          if (!Number.isFinite(this.duration)) return false;
          this.clockSubscription?.unsubscribe();
          this.clockSubscription = null;
          this.seekLocal(this.duration);
          return true;
        },
      });
    }
    return this.motionLifecycle;
  }

  private clearMotionLifecycle(): void {
    const lifecycle = this.motionLifecycle;
    this.motionLifecycle = null;
    lifecycle?.stop();
  }

  private resolveOffset(offset?: TimelineOffset): number {
    if (offset === undefined) {
      assertFiniteNonNegative(this.lastAddedEnd, 'Timeline offset');
      return this.lastAddedEnd;
    }
    if (typeof offset === 'number') {
      assertFiniteNonNegative(offset, 'Timeline offset');
      return offset;
    }
    const trimmed = offset.trim();
    if (trimmed === '<') return this.lastAddedStart;
    const relative = /^([+-])=(\d+(?:\.\d+)?)$/.exec(trimmed);
    if (relative) {
      const amount = Number(relative[2]);
      const resolved = relative[1] === '+' ? this.lastAddedEnd + amount : Math.max(0, this.lastAddedEnd - amount);
      assertFiniteNonNegative(resolved, 'Resolved timeline offset');
      return resolved;
    }
    const labelRelative = /^([\w.-]+)(?:([+-])=(\d+(?:\.\d+)?))?$/.exec(trimmed);
    if (labelRelative) {
      const labelTime = this.labels.get(labelRelative[1]!);
      if (labelTime !== undefined) {
        if (!labelRelative[2]) return labelTime;
        const amount = Number(labelRelative[3]);
        const resolved = Math.max(0, labelTime + (labelRelative[2] === '+' ? amount : -amount));
        assertFiniteNonNegative(resolved, 'Resolved timeline offset');
        return resolved;
      }
    }
     
    throw new RangeError(`Unknown timeline offset or label: "${trimmed}".`);
  }

  private hasActiveClock(): boolean {
    return Boolean(this.clockSubscription && !this.clockSubscription.closed);
  }

  private lockStructureFromParent(): void {
    this.lockStructure();
  }

  private lockStructure(): void {
    this.structureLocked = true;
    for (const segment of this.entries) {
      if (segment.item instanceof Timeline) segment.item.lockStructureFromParent();
    }
  }

  private containsTimeline(target: Timeline, visited = new Set<Timeline>()): boolean {
    if (this === target) return true;
    if (visited.has(this)) return false;
    visited.add(this);
    return this.entries.some((segment) => segment.item instanceof Timeline && segment.item.containsTimeline(target, visited));
  }

  private assertStructureMutable(): void {
    if (this.parentOwner) {
      throw new Error('Cannot modify a nested Timeline after adding it to a parent Timeline. Modify the child before adding it to its parent.');
    }
    if (this.structureLocked) {
      throw new Error('Cannot modify a Timeline after playback or non-zero seeking begins. Call stop() before editing its structure.');
    }
  }


  private assertNotParentOwned(operation: string): void {
    if (this.parentOwner) {
      throw new Error(`Cannot call ${operation}() on a nested Timeline controlled by its parent Timeline.`);
    }
  }

  private setState(state: AnimationState): void {
    if (this.state$.value !== state) this.stateSubject.next(state);
  }
}
