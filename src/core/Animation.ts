import { BehaviorSubject, type Subscription } from 'rxjs';
import type { AnimatableItem, AnimationOptions, AnimationState, EasingFunction } from '../types.js';
import { Completion } from './Completion.js';
import { frameCoordinator } from './FrameCoordinator.js';
import { MotionLifecycleController } from './MotionLifecycleController.js';
import { resolveEasing } from '../utils/easings.js';
import { assertFiniteNonNegative, assertRepeatCount } from '../utils/timing.js';

const STOPPED_ERROR = 'Animation stopped before completion';

/** Controls a timed animation and lets a Timeline move it with seekLocal(). */
export class Animation implements AnimatableItem, PromiseLike<void> {
  readonly progress$ = new BehaviorSubject<number>(0);
  readonly state$ = new BehaviorSubject<AnimationState>('idle');

  private readonly options: Readonly<AnimationOptions>;
  private readonly easing: EasingFunction;
  private readonly cycleDuration: number;
  private readonly delay: number;
  private readonly repeats: number;
  private readonly yoyo: boolean;
  private readonly completion = new Completion();
  private clockSubscription: Subscription | null = null;
  private currentTime = 0;
  private hasStarted = false;
  private hasCompleted = false;
  private motionLifecycle: MotionLifecycleController | null = null;

  constructor(options: AnimationOptions) {
    assertFiniteNonNegative(options.duration, 'Animation duration');
    const delay = options.delay ?? 0;
    assertFiniteNonNegative(delay, 'Animation delay');
    const repeatOption = options.repeat ?? 0;
    assertRepeatCount(repeatOption);

    this.cycleDuration = options.duration;
    this.delay = delay;
    this.repeats = repeatOption;
    const computedDuration = this.cycleDuration === 0
      ? this.delay
      : this.delay + this.cycleDuration * (this.repeats === Infinity ? Infinity : this.repeats + 1);
    if (this.repeats !== Infinity && !Number.isFinite(computedDuration)) {
      throw new RangeError('Animation total duration must be finite; reduce the duration or repeat count.');
    }
    this.yoyo = options.yoyo ?? false;
    this.easing = resolveEasing(options.easing);
    this.options = Object.freeze({ ...options, duration: this.cycleDuration, delay: this.delay, repeat: this.repeats, yoyo: this.yoyo });
  }

  /** Total duration in milliseconds, including delay and every repeat. */
  get duration(): number {
    if (this.cycleDuration === 0) return this.delay;
    return this.repeats === Infinity ? Infinity : this.delay + this.cycleDuration * (this.repeats + 1);
  }

  play(): this {
    if (this.state$.value === 'completed') this.resetInternal();
    this.completion.ensurePending();
    if (this.clockSubscription) return this;
    if (!this.ensureMotionLifecycle().requestPlay()) return this;
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
        // Every play/resume begins from a fresh frame boundary, not the previous frame's delta.
        if (firstFrame) {
          firstFrame = false;
          this.seekLocal(this.currentTime);
          return;
        }
        this.seekLocal(this.currentTime + frame.delta);
      },
      error: (error: unknown) => {
        this.clockSubscription = null;
        this.clearMotionLifecycle();
        this.setState('idle');
        this.completion.reject(error);
      },
    });
    // The source may fail synchronously when RAF is unavailable (e.g. during SSR).
    this.clockSubscription = subscription.closed ? null : subscription;
  }

  /** @internal Lets a parent Timeline pause an actively driven child. */
  pauseFromParent(): void {
    if (this.state$.value === 'running') {
      this.setState('paused');
      this.options.onPause?.();
    }
  }

  pause(): this {
    if (!this.clockSubscription) {
      this.motionLifecycle?.cancelAutomaticResume();
      return this;
    }
    this.clockSubscription.unsubscribe();
    this.clockSubscription = null;
    this.setState('paused');
    this.options.onPause?.();
    return this;
  }

  stop(): this {
    const wasPending = !this.completion.isSettled;
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.options.onStop?.();
    this.clearMotionLifecycle();
    this.currentTime = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.progress$.next(0);
    this.setState('idle');
    if (wasPending) this.completion.reject(new Error(STOPPED_ERROR));
    return this;
  }

  restart(): this {
    this.clearMotionLifecycle();
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.completion.restart(new Error(STOPPED_ERROR));
    this.currentTime = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.progress$.next(0);
    this.setState('idle');
    return this.play();
  }

  /** Scrubs the playhead without starting a frame clock; callbacks still follow crossed playhead positions. */
  seek(ms: number): this {
    this.applyLocalTime(Number.isFinite(ms) ? Math.max(0, ms) : 0, !this.hasActiveClock());
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
    // A manual scrub updates values and callbacks but does not claim a clock is running.
    if (!preservePlaybackState) {
      this.setState('running');
      if (previousState === 'paused') this.options.onResume?.();
    } else if (previousState === 'completed' && !completeNow) this.setState('idle');
    if (startedNow && !this.hasStarted) {
      this.hasStarted = true;
      this.options.onStart?.();
    }

    const progress = this.calculateProgress(target, completeNow);
    const easedProgress = this.easing(progress);
    this.progress$.next(progress);
    this.options.onUpdate?.(progress, easedProgress);

    if (completeNow && !this.hasCompleted) {
      if (!this.hasStarted) {
        this.hasStarted = true;
        this.options.onStart?.();
      }
      this.hasCompleted = true;
      this.clearMotionLifecycle();
      this.setState('completed');
      this.clockSubscription?.unsubscribe();
      this.clockSubscription = null;
      this.options.onComplete?.();
      this.completion.resolve();
    } else if (target < this.delay && !completeNow) {
      // Moving back before the delay enables onStart on the next entry into the active range.
      this.hasStarted = false;
    }
  }

  /** Silent reset so a Timeline can control the playhead deterministically. */
  resetInternal(): void {
    this.clearMotionLifecycle();
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
    this.currentTime = 0;
    this.hasStarted = false;
    this.hasCompleted = false;
    this.progress$.next(0);
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

  private hasActiveClock(): boolean {
    return Boolean(this.clockSubscription && !this.clockSubscription.closed);
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

  private setState(state: AnimationState): void {
    if (this.state$.value !== state) this.state$.next(state);
  }
}
