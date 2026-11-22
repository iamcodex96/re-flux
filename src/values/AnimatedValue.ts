import { BehaviorSubject } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimatableItem, AnimationOptions, AnimationState } from '../types/animation.js';
import { Animation } from '../core/Animation.js';
import { SETTLE_PROBE, type SettleProbed } from '../core/settle.js';

/**
 * @internal Shared shell of `Tween` and `Keyframes`: an `Animation` that publishes a typed value.
 * It owns the playback delegation; subclasses only decide which value a progress maps to.
 * Not exported from the package entry points.
 */
export abstract class AnimatedValue<T> implements AnimatableItem, PromiseLike<void> {
  protected readonly valueSubject: BehaviorSubject<T>;
  readonly value$: ReadonlyBehaviorObservable<T>;
  readonly progress$: ReadonlyBehaviorObservable<number>;
  readonly state$: ReadonlyBehaviorObservable<AnimationState>;

  private readonly animation: Animation;
  /** Value published before the first update and after `stop()`, `restart()` and `resetInternal()`. */
  protected readonly initialValue: T;

  /** `animationOptions.onUpdate` is ignored: the subclass receives each update through `updateValue`. */
  protected constructor(initialValue: T, animationOptions: AnimationOptions) {
    this.initialValue = initialValue;
    this.valueSubject = new BehaviorSubject<T>(initialValue);
    this.value$ = readonlyBehavior(this.valueSubject);
    this.animation = new Animation({
      ...animationOptions,
      onUpdate: (progress, easedProgress) => this.updateValue(progress, easedProgress),
    });
    this.progress$ = this.animation.progress$;
    this.state$ = this.animation.state$;
  }

  /** Maps one animation update to the published value. */
  protected abstract updateValue(progress: number, easedProgress: number): void;

  /** Publishes the initial value for `stop()` and `restart()`; `Keyframes` also notifies its `onUpdate` callback. */
  protected publishInitialValue(): void {
    this.valueSubject.next(this.initialValue);
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
    this.publishInitialValue();
    return this;
  }

  restart(): this {
    this.publishInitialValue();
    this.animation.restart();
    return this;
  }

  seek(ms: number): this {
    this.animation.seek(ms);
    return this;
  }

  /** @internal Lets Timeline drive the playhead without creating another frame loop. */
  seekLocal(ms: number, preservePlaybackState = false): void {
    this.animation.seekLocal(ms, preservePlaybackState);
  }

  /** @internal Restores the initial value silently, without lifecycle callbacks, when an owning Timeline moves before this item. */
  resetInternal(): void {
    this.animation.resetInternal();
    this.valueSubject.next(this.initialValue);
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

// Tween and Keyframes are settled exactly when their Animation is; see `core/settle.ts`.
Object.defineProperty(AnimatedValue.prototype, SETTLE_PROBE, {
  value(this: AnimatedValue<unknown>): boolean {
    return (this['animation'] as SettleProbed)[SETTLE_PROBE]?.() ?? false;
  },
});
