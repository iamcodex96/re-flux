import { BehaviorSubject } from 'rxjs';
import { readonlyBehavior, type ReadonlyBehaviorObservable } from '../utils/readOnlyBehavior.js';
import type { AnimatableItem, AnimationState } from '../types/animation.js';
import type { EasingFunction } from '../types/easing.js';
import type { KeyframesOptions, ValueKeyframe, ValueInterpolator } from '../types/values.js';
import { Animation } from '../core/Animation.js';
import { resolveEasing } from '../utils/easings.js';
import { resolveInterpolator } from './interpolate.js';

interface NormalizedKeyframe<T> {
  readonly value: T;
  readonly offset: number;
  readonly easing?: ValueKeyframe<T>['easing'];
}

/**
 * Animates through multiple typed values on one shared timeline.
 * Offsets are normalized to 0..1; omitted offsets are distributed evenly between specified offsets.
 */
export class Keyframes<T> implements AnimatableItem, PromiseLike<void> {
  private readonly valueSubject: BehaviorSubject<T>;
  readonly value$: ReadonlyBehaviorObservable<T>;
  readonly progress$: ReadonlyBehaviorObservable<number>;
  readonly state$: ReadonlyBehaviorObservable<AnimationState>;

  private readonly animation: Animation;
  private readonly frames: readonly NormalizedKeyframe<T>[];
  private readonly interpolators: readonly ValueInterpolator<T>[];
  private readonly defaultEasing: EasingFunction;
  private readonly onValueUpdate: ((value: T, progress: number) => void) | undefined;

  constructor(options: KeyframesOptions<T>) {
    this.frames = normalizeKeyframes(options.keyframes);
     
     
    this.interpolators = this.frames.slice(0, -1).map((frame, index) =>
      resolveInterpolator(frame.value, this.frames[index + 1]!.value, options.interpolate, 'Keyframes'),
    );
    this.defaultEasing = resolveEasing(options.easing);
    this.onValueUpdate = options.onUpdate;
    this.valueSubject = new BehaviorSubject<T>(this.frames[0]!.value);
    this.value$ = readonlyBehavior(this.valueSubject);

    const { keyframes: _keyframes, interpolate: _interpolate, onUpdate, easing: _easing, ...animationOptions } = options;
    this.animation = new Animation({
      ...animationOptions,
       
      easing: 'linear',
      onUpdate: (progress) => this.updateValue(progress),
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
    this.publishValue(this.frames[0]!.value, 0);
    return this;
  }

  restart(): this {
    this.publishValue(this.frames[0]!.value, 0);
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

  /** @internal Restores the first value silently when an owning Timeline moves before this item. */
  resetInternal(): void {
    this.animation.resetInternal();
    this.valueSubject.next(this.frames[0]!.value);
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

  private updateValue(progress: number): void {
    const normalizedProgress = clamp(progress, 0, 1);
    const lastFrame = this.frames[this.frames.length - 1]!;
    if (normalizedProgress >= 1) {
      this.publishValue(lastFrame.value, progress);
      return;
    }

    let start = this.frames[0]!;
    let end = this.frames[1]!;
    let segmentIndex = 0;
    for (let index = 0; index < this.frames.length - 1; index += 1) {
      const candidateStart = this.frames[index]!;
      const candidateEnd = this.frames[index + 1]!;
      if (normalizedProgress <= candidateEnd.offset) {
        start = candidateStart;
        end = candidateEnd;
        segmentIndex = index;
        break;
      }
    }

    const span = end.offset - start.offset;
    const localProgress = span <= 0 ? 1 : clamp((normalizedProgress - start.offset) / span, 0, 1);
    const easing = resolveEasing(start.easing ?? this.defaultEasing);
    const value = this.interpolators[segmentIndex]!(start.value, end.value, easing(localProgress));
    this.publishValue(value, progress);
  }

  private publishValue(value: T, progress: number): void {
    this.valueSubject.next(value);
    this.onValueUpdate?.(value, progress);
  }
}

/** Factory helper for constructing a generic, typed keyframe animation. */
export function keyframes<T>(options: KeyframesOptions<T>): Keyframes<T> {
  return new Keyframes(options);
}

function normalizeKeyframes<T>(input: readonly ValueKeyframe<T>[]): readonly NormalizedKeyframe<T>[] {
  if (input.length === 0) throw new RangeError('Keyframes requires at least one frame.');
  const frames = input.map((frame) => ({ ...frame }));

  if (frames.length === 1) {
    const only = frames[0]!;
    return [
      { value: only.value, offset: 0, ...(only.easing === undefined ? {} : { easing: only.easing }) },
      { value: only.value, offset: 1 },
    ];
  }

  let previousExplicit = -Infinity;
  for (const frame of frames) {
    if (frame.offset === undefined) continue;
    if (!Number.isFinite(frame.offset) || frame.offset < 0 || frame.offset > 1) {
      throw new RangeError('Keyframe offsets must be finite numbers between 0 and 1.');
    }
    if (frame.offset <= previousExplicit) {
      throw new RangeError('Explicit keyframe offsets must be strictly increasing.');
    }
    previousExplicit = frame.offset;
  }

  const offsets: Array<number | undefined> = frames.map((frame) => frame.offset);
  if (offsets[0] === undefined) offsets[0] = 0;
  if (offsets[offsets.length - 1] === undefined) offsets[offsets.length - 1] = 1;

  let index = 0;
  while (index < offsets.length) {
    if (offsets[index] !== undefined) {
      index += 1;
      continue;
    }
    const runStart = index;
    while (index < offsets.length && offsets[index] === undefined) index += 1;
    const left = offsets[runStart - 1]!;
    const right = offsets[index]!;
    const count = index - runStart;
    for (let runOffset = 0; runOffset < count; runOffset += 1) {
      offsets[runStart + runOffset] = left + ((right - left) * (runOffset + 1)) / (count + 1);
    }
  }

  let normalized: NormalizedKeyframe<T>[] = frames.map((frame, frameIndex) => {
    const offset = offsets[frameIndex]!;
    return {
      value: frame.value,
      offset,
      ...(frame.easing === undefined ? {} : { easing: frame.easing }),
    };
  });

  for (let frameIndex = 1; frameIndex < normalized.length; frameIndex += 1) {
    if (normalized[frameIndex]!.offset <= normalized[frameIndex - 1]!.offset) {
      throw new RangeError('Keyframe offsets must be strictly increasing after normalization.');
    }
  }

  if (normalized[0]!.offset > 0) {
    normalized = [{ value: normalized[0]!.value, offset: 0 }, ...normalized];
  }
  if (normalized[normalized.length - 1]!.offset < 1) {
    normalized = [...normalized, { value: normalized[normalized.length - 1]!.value, offset: 1 }];
  }
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
