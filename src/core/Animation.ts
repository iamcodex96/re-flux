import { BehaviorSubject } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimatableItem, AnimationOptions, AnimationState } from '../types/animation.js';
import type { EasingFunction } from '../types/easing.js';
import { Completion } from './Completion.js';
import { PlaybackController, STOPPED_ERROR, type PlaybackHooks } from './PlaybackController.js';
import { SETTLE_PROBE } from './settle.js';
import { resolveEasing } from '../utils/easings.js';
import { assertFiniteNonNegative, assertRepeatCount } from '../utils/timing.js';

/** Controls a timed animation and lets a Timeline move it with seekLocal(). */
export class Animation implements AnimatableItem, PromiseLike<void> {
  private readonly progressSubject = new BehaviorSubject<number>(0);
  readonly progress$: ReadonlyBehaviorObservable<number> = readonlyBehavior(this.progressSubject);
  readonly state$: ReadonlyBehaviorObservable<AnimationState>;

  private readonly options: Readonly<AnimationOptions>;
  private readonly easing: EasingFunction;
  private readonly cycleDuration: number;
  private readonly delay: number;
  private readonly repeats: number;
  private readonly yoyo: boolean;
  private readonly completion = new Completion();
  private readonly playback: PlaybackController<Animation>;
  private currentTime = 0;
  private hasStarted = false;
  private hasCompleted = false;

  constructor(options: AnimationOptions) {
    assertFiniteNonNegative(options.duration, 'Animation duration');
    const delay = options.delay ?? 0;
    assertFiniteNonNegative(delay, 'Animation delay');
    const repeatOption = options.repeat ?? 0;
    assertRepeatCount(repeatOption);

    this.cycleDuration = options.duration;
    this.delay = delay;
    this.repeats = repeatOption;
    const computedDuration =
      this.cycleDuration === 0
        ? this.delay
        : this.delay + this.cycleDuration * (this.repeats === Infinity ? Infinity : this.repeats + 1);
    if (this.repeats !== Infinity && !Number.isFinite(computedDuration)) {
      throw new RangeError('Animation total duration must be finite; reduce the duration or repeat count.');
    }
    this.yoyo = options.yoyo ?? false;
    this.easing = resolveEasing(options.easing);
    this.options = Object.freeze({
      ...options,
      duration: this.cycleDuration,
      delay: this.delay,
      repeat: this.repeats,
      yoyo: this.yoyo,
    });
    this.playback = new PlaybackController(this, this.options, ANIMATION_PLAYBACK, this.completion);
    this.state$ = this.playback.state$;
  }

  /** Total duration in milliseconds, including delay and every repeat. */
  get duration(): number {
    if (this.cycleDuration === 0) return this.delay;
    return this.repeats === Infinity ? Infinity : this.delay + this.cycleDuration * (this.repeats + 1);
  }

  play(): this {
    if (this.state$.value === 'completed') this.resetInternal();
    this.completion.ensurePending();
    if (this.playback.hasClock) return this;
    if (!this.playback.requestPlay()) return this;
    this.playback.startClock();
    return this;
  }

  /** @internal Lets a parent Timeline pause an actively driven child. */
  pauseFromParent(): void {
    if (this.state$.value === 'running') {
      this.playback.setState('paused');
      this.options.onPause?.();
    }
  }

  pause(): this {
    if (!this.playback.pauseClock()) return this;
    this.options.onPause?.();
    return this;
  }

  stop(): this {
    const wasPending = !this.completion.isSettled;
    this.playback.dropClock();
    this.options.onStop?.();
    this.playback.clearMotionLifecycle();
    this.currentTime = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.progressSubject.next(0);
    this.playback.setState('idle');
    if (wasPending) this.completion.reject(new Error(STOPPED_ERROR));
    return this;
  }

  restart(): this {
    this.playback.clearMotionLifecycle();
    this.playback.dropClock();
    this.completion.restart(new Error(STOPPED_ERROR));
    this.currentTime = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.progressSubject.next(0);
    this.playback.setState('idle');
    return this.play();
  }

  /** Scrubs the playhead without starting a frame clock; callbacks still follow crossed playhead positions. */
  seek(ms: number): this {
    this.applyLocalTime(Number.isFinite(ms) ? Math.max(0, ms) : 0, !this.playback.hasActiveClock());
    return this;
  }

  /** @internal Used by Timeline; does not create or subscribe to an independent RAF loop. */
  seekLocal(ms: number, preservePlaybackState = false): void {
    this.applyLocalTime(ms, preservePlaybackState);
  }

  private applyLocalTime(ms: number, preservePlaybackState: boolean): void {
    if (!Number.isFinite(ms) && ms !== Infinity) ms = 0;
    if (ms < 0) {
      this.resetInternal();
      return;
    }

    const previousState = this.state$.value;
    const total = this.duration;
    const target = Number.isFinite(total) ? Math.min(ms, total) : ms;
    this.currentTime = target;
    const completeNow = Number.isFinite(total) && target >= total;
    const startedNow = target >= this.delay;

    if (completeNow && this.hasCompleted) return;
    if (!completeNow) this.hasCompleted = false;

    if (!preservePlaybackState) {
      this.playback.setState('running');
      if (previousState === 'paused') this.options.onResume?.();
    } else if (previousState === 'completed' && !completeNow) this.playback.setState('idle');
    if (startedNow && !this.hasStarted) {
      this.hasStarted = true;
      this.options.onStart?.();
    }

    const progress = this.calculateProgress(target, completeNow);
    const easedProgress = this.easing(progress);
    this.progressSubject.next(progress);
    this.options.onUpdate?.(progress, easedProgress);

    if (completeNow && !this.hasCompleted) {
      if (!this.hasStarted) {
        this.hasStarted = true;
        this.options.onStart?.();
      }
      this.hasCompleted = true;
      this.playback.clearMotionLifecycle();
      this.playback.setState('completed');
      this.playback.dropClock();
      this.options.onComplete?.();
      this.completion.resolve();
    } else if (target < this.delay && !completeNow) {
      this.hasStarted = false;
    }
  }

  /** Silent reset so a Timeline can control the playhead deterministically. */
  resetInternal(): void {
    this.playback.clearMotionLifecycle();
    this.playback.dropClock();
    this.currentTime = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.progressSubject.next(0);
    this.playback.setState('idle');
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

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ): Promise<void | TResult> {
    return this.completion.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.completion.promise.finally(onfinally);
  }

  private calculateProgress(target: number, complete: boolean): number {
    if (this.cycleDuration === 0) return complete ? this.finalDirectionProgress() : 0;
    if (target <= this.delay) return 0;

    const activeTime = target - this.delay;
    let iteration: number;
    let withinCycle: number;
    if (complete && this.repeats !== Infinity) {
      iteration = this.repeats;
      withinCycle = 1;
    } else {
      iteration = Math.floor(activeTime / this.cycleDuration);
      withinCycle = (activeTime % this.cycleDuration) / this.cycleDuration;
    }
    return this.yoyo && iteration % 2 === 1 ? 1 - withinCycle : withinCycle;
  }

  private finalDirectionProgress(): number {
    return this.yoyo && this.repeats !== Infinity && this.repeats % 2 === 1 ? 0 : 1;
  }
}

// A completed Animation ignores every further seekLocal(); see `settle.ts`. Installed here, not as a member, so the
// public declaration is unchanged.
Object.defineProperty(Animation.prototype, SETTLE_PROBE, {
  value(this: Animation): boolean {
    return this['hasCompleted'];
  },
});

/** Frame handling of a directly played Animation: advance its own playhead by the frame delta. */
const ANIMATION_PLAYBACK: PlaybackHooks<Animation> = {
  frame(animation, delta, first) {
    animation.seekLocal(first ? animation['currentTime'] : animation['currentTime'] + delta);
  },
};
