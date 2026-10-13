import type { Subscription } from 'rxjs';
import type { AnimationMotionOptions } from '../types.js';
import type { MotionPreferencesSnapshot } from './MotionPreferences.js';

interface MotionLifecycleDriver {
  isRunning(): boolean;
  holdBeforeVisible(): void;
  pauseForLifecycle(): void;
  resumeFromLifecycle(wasPaused: boolean): void;
  /** Returns false for unbounded playback, which should pause rather than be completed. */
  finishForReducedMotion(): boolean;
}

/** Internal per-instance policy bridge. It never changes unrelated streams or animations. */
export class MotionLifecycleController {
  private subscription: Subscription | null = null;
  private hasSkippedInitial = false;
  private waitingForVisible = false;
  private pausedForVisibility = false;
  private pausedForReducedMotion = false;
  private reducedMotionWasRunning = false;
  private stopped = false;

  constructor(
    private readonly options: AnimationMotionOptions | undefined,
    private readonly driver: MotionLifecycleDriver,
  ) {}

  /** Returns false when the caller must not start a new clock yet. */
  requestPlay(): boolean {
    if (!this.options || this.stopped) return true;
    this.observe();
    return this.applySnapshot(this.options.preferences.snapshot, true);
  }

  /** Cancels a deferred automatic resume when the caller explicitly pauses. */
  cancelAutomaticResume(): void {
    this.waitingForVisible = false;
    this.pausedForVisibility = false;
    this.pausedForReducedMotion = false;
    this.reducedMotionWasRunning = false;
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.waitingForVisible = false;
    this.pausedForVisibility = false;
    this.pausedForReducedMotion = false;
    this.reducedMotionWasRunning = false;
  }

  private observe(): void {
    if (!this.options || (this.subscription && !this.subscription.closed)) return;
    this.hasSkippedInitial = false;
    this.subscription = this.options.preferences.state$.subscribe({
      next: (snapshot) => {
        if (!this.hasSkippedInitial) {
          this.hasSkippedInitial = true;
          return;
        }
        this.applySnapshot(snapshot, false);
      },
      error: () => this.stop(),
      complete: () => this.stop(),
    });
  }

  private applySnapshot(snapshot: MotionPreferencesSnapshot, fromPlay: boolean): boolean {
    const options = this.options;
    if (!options || this.stopped) return true;

    if (snapshot.reducedMotion && (options.reducedMotion ?? 'finish') === 'finish') {
      const active = fromPlay || this.driver.isRunning() || this.waitingForVisible
        || this.pausedForVisibility || this.pausedForReducedMotion;
      if (active) {
        if (this.driver.finishForReducedMotion()) {
          this.stop();
          return false;
        }
        // Infinite/repeating playback has no final state; suspend it until motion is allowed again.
        this.reducedMotionWasRunning = this.driver.isRunning() || this.pausedForVisibility || this.pausedForReducedMotion;
        this.pausedForReducedMotion = true;
        this.waitingForVisible = false;
        this.pausedForVisibility = false;
        if (this.reducedMotionWasRunning) this.driver.pauseForLifecycle();
        else this.driver.holdBeforeVisible();
        return false;
      }
    }

    if (options.pauseWhenHidden && !snapshot.visible) {
      if (this.driver.isRunning()) {
        this.pausedForVisibility = true;
        this.driver.pauseForLifecycle();
      } else if (fromPlay) {
        this.waitingForVisible = true;
        this.driver.holdBeforeVisible();
      }
      return false;
    }

    if (snapshot.visible && !snapshot.reducedMotion && this.pausedForReducedMotion) {
      const wasRunning = this.reducedMotionWasRunning;
      this.pausedForReducedMotion = false;
      this.reducedMotionWasRunning = false;
      this.driver.resumeFromLifecycle(wasRunning);
      return false;
    }

    if (snapshot.visible && (this.pausedForVisibility || this.waitingForVisible)) {
      const wasPaused = this.pausedForVisibility;
      this.pausedForVisibility = false;
      this.waitingForVisible = false;
      this.driver.resumeFromLifecycle(wasPaused);
      return false;
    }

    return true;
  }
}
