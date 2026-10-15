import { BehaviorSubject } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimationState } from '../types/animation.js';
import type { TweenOptions, ValueInterpolator } from '../types/values.js';
import { Animation } from '../core/Animation.js';
import type { AnimatableItem } from '../types/animation.js';
import { resolveInterpolator } from './interpolate.js';

/**
 * Animates a value without knowing anything about the rendering target.
 * Numbers, compatible CSS-like strings/colors, arrays and plain objects interpolate by default; provide a custom interpolator for other types.
 */
export class Tween<T> implements AnimatableItem, PromiseLike<void> {
  private readonly valueSubject: BehaviorSubject<T>;
  readonly value$: ReadonlyBehaviorObservable<T>;
  readonly progress$: ReadonlyBehaviorObservable<number>;
  readonly state$: ReadonlyBehaviorObservable<AnimationState>;

  private readonly animation: Animation;
  private readonly from: T;
  private readonly to: T;
  private readonly interpolate: ValueInterpolator<T>;

  constructor(options: TweenOptions<T>) {
    this.from = options.from;
    this.to = options.to;
    this.interpolate = resolveInterpolator(options.from, options.to, options.interpolate);
    this.valueSubject = new BehaviorSubject<T>(options.from);
    this.value$ = readonlyBehavior(this.valueSubject);

    const { from: _from, to: _to, interpolate: _interpolate, onUpdate, ...animationOptions } = options;
    this.animation = new Animation({
      ...animationOptions,
      onUpdate: (progress, easedProgress) => {
        const value = this.interpolate(this.from, this.to, easedProgress);
        this.valueSubject.next(value);
        onUpdate?.(value, progress, easedProgress);
      },
    });

    this.progress$ = this.animation.progress$;
    this.state$ = this.animation.state$;
  }

  get duration(): number {
    return this.animation.duration;
  }

  play(): this {
    this.animation.play();
    return this;
  }

  pause(): this {
    this.animation.pause();
    return this;
  }

  /** @internal Lets a parent Timeline pause an actively driven child. */
  pauseFromParent(): void {
    this.animation.pauseFromParent();
  }

  stop(): this {
    this.animation.stop();
    this.valueSubject.next(this.from);
    return this;
  }

  restart(): this {
    this.valueSubject.next(this.from);
    this.animation.restart();
    return this;
  }

  seek(ms: number): this {
    this.animation.seek(ms);
    return this;
  }

  /** @internal Allows Timeline to drive the tween without starting its own frame loop. */
  seekLocal(ms: number, preservePlaybackState = false): void {
    this.animation.seekLocal(ms, preservePlaybackState);
  }

  /** @internal Resets the value and timing state without lifecycle callbacks. */
  resetInternal(): void {
    this.animation.resetInternal();
    this.valueSubject.next(this.from);
  }

  toPromise(): Promise<void> {
    return this.animation.toPromise();
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.animation.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null): Promise<void | TResult> {
    return this.animation.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.animation.finally(onfinally);
  }
}
