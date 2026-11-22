import { BehaviorSubject, type Subscription } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimationMotionOptions, AnimationState } from '../types/animation.js';
import type { Completion } from './Completion.js';
import { frameCoordinator } from './FrameCoordinator.js';
import { MotionLifecycleController } from './MotionLifecycleController.js';

/** Message of the rejection a pending `Animation` / `Timeline` promise gets when it is stopped or restarted. */
export const STOPPED_ERROR = 'Animation stopped before completion';

/** What the controller needs from the `Animation` or `Timeline` it drives. */
export interface PlaybackHost {
  readonly duration: number;
  /** Used to jump to the end for reduced motion. */
  seekLocal(ms: number, preservePlaybackState?: boolean): void;
  pause(): unknown;
}

/** The part of the host's options the controller reads. */
export interface PlaybackOptions {
  readonly motion?: AnimationMotionOptions | undefined;
  readonly onResume?: (() => void) | undefined;
}

/** Per-class behaviour, supplied as one shared object per class so an instance pays for no closures. */
export interface PlaybackHooks<Host> {
  /** Moves the host along one frame of the shared clock; `first` is true for the frame that starts the clock. */
  frame(host: Host, delta: number, first: boolean): void;
}

/**
 * @internal The playback bookkeeping `Animation` and `Timeline` share: the public state, the frame-clock
 * subscription (start, error, drop, pause), and the lazily created motion-preference lifecycle. Seeking, progress and
 * completion stay in the host classes. Not exported from the package entry points.
 */
export class PlaybackController<Host extends PlaybackHost> {
  private readonly stateSubject = new BehaviorSubject<AnimationState>('idle');
  readonly state$: ReadonlyBehaviorObservable<AnimationState> = readonlyBehavior(this.stateSubject);
  private clockSubscription: Subscription | null = null;
  private motionLifecycle: MotionLifecycleController | null = null;

  constructor(
    private readonly host: Host,
    private readonly options: PlaybackOptions,
    private readonly hooks: PlaybackHooks<Host>,
    private readonly completion: Completion,
  ) {}

  setState(state: AnimationState): void {
    if (this.stateSubject.value !== state) this.stateSubject.next(state);
  }

  /** True once a clock subscription exists, even one that already closed itself. */
  get hasClock(): boolean {
    return this.clockSubscription !== null;
  }

  /** True while the clock subscription is open. */
  hasActiveClock(): boolean {
    return Boolean(this.clockSubscription && !this.clockSubscription.closed);
  }

  /** Asks the motion policy whether a clock may start now; false means "not yet" (hidden page, reduced motion). */
  requestPlay(): boolean {
    return this.ensureMotionLifecycle().requestPlay();
  }

  /** Subscribes to the shared frame clock and marks the host running. No-op while a clock exists. */
  startClock(callResume?: boolean): void {
    if (this.clockSubscription) return;
    const wasPaused = this.stateSubject.value === 'paused';
    this.setState('running');
    if (wasPaused && (callResume ?? true)) this.options.onResume?.();
    let firstFrame = true;
    const subscription = frameCoordinator.frames$.subscribe({
      next: (frame) => {
        const first = firstFrame;
        firstFrame = false;
        this.hooks.frame(this.host, frame.delta, first);
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

  /** Unsubscribes from the frame clock, if any. */
  dropClock(): void {
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
  }

  /**
   * Pauses the clock: returns false (and forgets a deferred automatic resume) when no clock exists, otherwise drops
   * it, marks the host paused and returns true so the caller can run its own pause callbacks.
   */
  pauseClock(): boolean {
    if (!this.clockSubscription) {
      this.motionLifecycle?.cancelAutomaticResume();
      return false;
    }
    this.dropClock();
    this.setState('paused');
    return true;
  }

  clearMotionLifecycle(): void {
    const lifecycle = this.motionLifecycle;
    this.motionLifecycle = null;
    lifecycle?.stop();
  }

  private ensureMotionLifecycle(): MotionLifecycleController {
    if (!this.motionLifecycle) {
      this.motionLifecycle = new MotionLifecycleController(this.options.motion, {
        isRunning: () => this.hasActiveClock(),
        holdBeforeVisible: () => this.setState('paused'),
        pauseForLifecycle: () => {
          if (this.clockSubscription) this.host.pause();
          else this.setState('paused');
        },
        resumeFromLifecycle: (wasPaused) => this.startClock(wasPaused),
        finishForReducedMotion: () => {
          if (!Number.isFinite(this.host.duration)) return false;
          this.dropClock();
          this.host.seekLocal(this.host.duration);
          return true;
        },
      });
    }
    return this.motionLifecycle;
  }
}
