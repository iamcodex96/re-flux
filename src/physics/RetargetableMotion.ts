import { BehaviorSubject, type Subscription } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimationState } from '../types/animation.js';
import type { MotionSample, RetargetableMotionOptions, SpringOptions } from '../types/physics.js';
import { frameCoordinator } from '../core/FrameCoordinator.js';
import { DEFAULT_SPRING_OPTIONS, stepSpring } from './spring.js';

/**
 * A headless spring-driven number that can change target without resetting its current value or velocity.
 * Every active instance consumes the shared FrameCoordinator rather than creating its own RAF loop.
 */
export class RetargetableMotion {
  private readonly sampleSubject: BehaviorSubject<MotionSample>;
  private readonly valueSubject: BehaviorSubject<number>;
  private readonly velocitySubject: BehaviorSubject<number>;
  private readonly targetSubject: BehaviorSubject<number>;
  private readonly stateSubject = new BehaviorSubject<AnimationState>('idle');
  readonly sample$: ReadonlyBehaviorObservable<MotionSample>;
  readonly value$: ReadonlyBehaviorObservable<number>;
  readonly velocity$: ReadonlyBehaviorObservable<number>;
  readonly target$: ReadonlyBehaviorObservable<number>;
  readonly state$: ReadonlyBehaviorObservable<AnimationState> = readonlyBehavior(this.stateSubject);

  private readonly options: Required<SpringOptions>;
  private readonly onUpdate: ((sample: MotionSample) => void) | undefined;
  private readonly onComplete: ((sample: MotionSample) => void) | undefined;
  private activeOptions: Required<SpringOptions>;
  private clockSubscription: Subscription | null = null;
  private disposed = false;

  constructor(options: RetargetableMotionOptions = {}) {
    const initialValue = options.initialValue ?? 0;
    if (!Number.isFinite(initialValue)) throw new RangeError('The initial motion value must be finite.');

    this.options = normalizeOptions(options);
    this.activeOptions = this.options;
    this.onUpdate = options.onUpdate;
    this.onComplete = options.onComplete;
    const initialSample = Object.freeze({ value: initialValue, velocity: 0, timestamp: 0 });
    this.sampleSubject = new BehaviorSubject<MotionSample>(initialSample);
    this.valueSubject = new BehaviorSubject(initialValue);
    this.velocitySubject = new BehaviorSubject(0);
    this.targetSubject = new BehaviorSubject(initialValue);
    this.sample$ = readonlyBehavior(this.sampleSubject);
    this.value$ = readonlyBehavior(this.valueSubject);
    this.velocity$ = readonlyBehavior(this.velocitySubject);
    this.target$ = readonlyBehavior(this.targetSubject);
  }

  get currentSample(): MotionSample {
    return this.sample$.value;
  }

  /** Retargets the active spring while preserving its current value and velocity. */
  to(target: number, options: SpringOptions = {}): this {
    this.assertNotDisposed();
    if (!Number.isFinite(target)) throw new RangeError('The motion target must be a finite number.');

    this.activeOptions = normalizeOptions({ ...this.activeOptions, ...options });
    this.targetSubject.next(target);

    const current = this.currentSample;
    if (Math.abs(target - current.value) <= this.activeOptions.restDelta
      && Math.abs(current.velocity) <= this.activeOptions.restSpeed) {
      this.stopClock();
      const sample = this.publish({ value: target, velocity: 0, timestamp: current.timestamp });
      this.setState('completed');
      this.onComplete?.(sample);
      return this;
    }

    this.setState('running');
    this.ensureClock();
    return this;
  }

  /** Pauses integration without discarding position, velocity, or target. */
  pause(): this {
    if (this.state$.value !== 'running') return this;
    this.stopClock();
    this.setState('paused');
    return this;
  }

  /** Resumes toward the last target with the most recently sampled velocity. */
  resume(): this {
    this.assertNotDisposed();
    if (this.state$.value !== 'paused') return this;
    this.setState('running');
    this.ensureClock();
    return this;
  }

  /** Stops motion at its current position and clears velocity. */
  stop(): this {
    if (this.disposed) return this;
    this.stopClock();
    const current = this.currentSample;
    this.publish({ value: current.value, velocity: 0, timestamp: current.timestamp });
    this.targetSubject.next(current.value);
    this.setState('idle');
    return this;
  }

  /** Releases the shared-clock subscription and completes all public streams. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.sampleSubject.complete();
    this.valueSubject.complete();
    this.velocitySubject.complete();
    this.targetSubject.complete();
    this.stateSubject.complete();
  }

  private ensureClock(): void {
    if (this.clockSubscription && !this.clockSubscription.closed) return;

    let synchronousError: unknown;
    let skipFirstFrame = true;
    const subscription = frameCoordinator.frames$.subscribe({
      next: (frame) => {
        // Avoid integrating an old delta when subscribing while the shared clock is already active.
        if (skipFirstFrame) {
          skipFirstFrame = false;
          return;
        }
        if (this.state$.value !== 'running') return;

        const result = stepSpring(
          { value: this.value$.value, velocity: this.velocity$.value },
          this.target$.value,
          frame.delta,
          this.activeOptions,
        );
        const sample = this.publish({ value: result.value, velocity: result.velocity, timestamp: frame.timestamp });
        this.onUpdate?.(sample);

        if (result.settled) {
          this.stopClock();
          this.setState('completed');
          this.onComplete?.(sample);
        }
      },
      error: (error: unknown) => {
        synchronousError = error;
        this.clockSubscription = null;
        this.setState('idle');
      },
    });

    if (subscription.closed) {
      this.clockSubscription = null;
      throw synchronousError instanceof Error
        ? synchronousError
        : new Error('RetargetableMotion requires requestAnimationFrame and cancelAnimationFrame.');
    }
    this.clockSubscription = subscription;
  }

  private stopClock(): void {
    this.clockSubscription?.unsubscribe();
    this.clockSubscription = null;
  }

  private publish(sample: MotionSample): MotionSample {
    const frozen = Object.freeze(sample);
    this.sampleSubject.next(frozen);
    this.valueSubject.next(frozen.value);
    this.velocitySubject.next(frozen.velocity);
    return frozen;
  }

  private setState(state: AnimationState): void {
    if (this.state$.value !== state) this.stateSubject.next(state);
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('RetargetableMotion has been disposed.');
  }
}

function normalizeOptions(options: RetargetableMotionOptions | SpringOptions): Required<SpringOptions> {
  const positive = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
  const nonNegative = (value: number | undefined, fallback: number): number =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;

  return {
    stiffness: positive(options.stiffness, DEFAULT_SPRING_OPTIONS.stiffness),
    damping: nonNegative(options.damping, DEFAULT_SPRING_OPTIONS.damping),
    mass: positive(options.mass, DEFAULT_SPRING_OPTIONS.mass),
    restDelta: nonNegative(options.restDelta, DEFAULT_SPRING_OPTIONS.restDelta),
    restSpeed: nonNegative(options.restSpeed, DEFAULT_SPRING_OPTIONS.restSpeed),
    maxSubstepMs: positive(options.maxSubstepMs, DEFAULT_SPRING_OPTIONS.maxSubstepMs),
    maxDeltaMs: positive(options.maxDeltaMs, DEFAULT_SPRING_OPTIONS.maxDeltaMs),
  };
}
