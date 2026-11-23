import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BehaviorSubject } from 'rxjs';
import { Animation } from '../../src/core/Animation.js';
import { Keyframes } from '../../src/values/Keyframes.js';
import { getInterpolatorCompiler } from '../../src/values/compiledInterpolators.js';
import { resolveInterpolator } from '../../src/values/interpolate.js';
import { resolveEasing } from '../../src/utils/easings.js';
import type { EasingFunction } from '../../src/types/easing.js';
import type { KeyframesOptions, ValueInterpolator, ValueKeyframe } from '../../src/types/values.js';
import { RafController } from '../helpers/RafController.js';

/**
 * PERF-005 safety net. `PinnedKeyframes` is a verbatim copy of `Keyframes` as it was before the segment cursor
 * (linear scan from frame 0 on every update). The real class must publish exactly the same values and progress, in
 * the same order, for every driving pattern below. Keep this copy frozen: it is the oracle, not code under test.
 */
interface PinnedFrame<T> {
  readonly value: T;
  readonly offset: number;
  readonly easing?: ValueKeyframe<T>['easing'];
}

class PinnedKeyframes<T> {
  readonly value$: BehaviorSubject<T>;
  private readonly animation: Animation;
  private readonly frames: readonly PinnedFrame<T>[];
  private readonly interpolators: readonly ValueInterpolator<T>[];
  private readonly segmentEasings: readonly EasingFunction[];
  private readonly onValueUpdate: ((value: T, progress: number) => void) | undefined;

  constructor(options: KeyframesOptions<T>) {
    this.frames = pinnedNormalize(options.keyframes);
    const compile = getInterpolatorCompiler(options.interpolate);
    this.interpolators = this.frames
      .slice(0, -1)
      .map((frame, index) =>
        compile
          ? compile(frame.value, this.frames[index + 1]!.value)
          : resolveInterpolator(frame.value, this.frames[index + 1]!.value, options.interpolate, 'Keyframes'),
      );
    const defaultEasing = resolveEasing(options.easing);
    this.segmentEasings = this.frames
      .slice(0, -1)
      .map((frame) => (frame.easing === undefined ? defaultEasing : resolveEasing(frame.easing)));
    this.onValueUpdate = options.onUpdate;
    this.value$ = new BehaviorSubject<T>(this.frames[0]!.value);

    const {
      keyframes: _keyframes,
      interpolate: _interpolate,
      onUpdate,
      easing: _easing,
      ...animationOptions
    } = options;
    this.animation = new Animation({
      ...animationOptions,
      easing: 'linear',
      onUpdate: (progress) => this.updateValue(progress),
    });
  }

  play(): void {
    this.animation.play();
  }
  stop(): void {
    this.animation.stop();
    this.publishValue(this.frames[0]!.value, 0);
  }
  seek(ms: number): void {
    this.animation.seek(ms);
  }

  private updateValue(progress: number): void {
    const normalizedProgress = Math.min(1, Math.max(0, progress));
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
    const localProgress = span <= 0 ? 1 : Math.min(1, Math.max(0, (normalizedProgress - start.offset) / span));
    const value = this.interpolators[segmentIndex]!(
      start.value,
      end.value,
      this.segmentEasings[segmentIndex]!(localProgress),
    );
    this.publishValue(value, progress);
  }

  private publishValue(value: T, progress: number): void {
    this.value$.next(value);
    this.onValueUpdate?.(value, progress);
  }
}

function pinnedNormalize<T>(input: readonly ValueKeyframe<T>[]): readonly PinnedFrame<T>[] {
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

  let normalized: PinnedFrame<T>[] = frames.map((frame, frameIndex) => ({
    value: frame.value,
    offset: offsets[frameIndex]!,
    ...(frame.easing === undefined ? {} : { easing: frame.easing }),
  }));

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

// ---------------------------------------------------------------------------------------------------------------
// Scenario builders

type Emission = readonly [value: unknown, progress: number];
type OptionsFactory = (onUpdate: (value: unknown, progress: number) => void) => KeyframesOptions<unknown>;

const DURATION = 1024; // power of two: ms === k / 1024 of the duration, so offsets k/1024 are hit bit-exactly.

/** Deterministic PRNG (mulberry32) so every run replays the same sequences. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A custom interpolator whose output names the segment endpoints, so any segment mix-up changes the value. */
const tagged = (from: unknown, to: unknown, progress: number): unknown => `${String(from)}>${String(to)}@${progress}`;

type OffsetStyle = 'implicit' | 'dyadic' | 'uneven' | 'partial' | 'inset';
type EasingStyle = 'linear' | 'named' | 'function' | 'per-keyframe';

function buildKeyframes(count: number, offsets: OffsetStyle, easing: EasingStyle): ValueKeyframe<unknown>[] {
  const frames: ValueKeyframe<unknown>[] = [];
  const names = ['easeInQuad', 'easeOutCubic', 'easeInOutSine', (t: number) => t * t * t];
  for (let index = 0; index < count; index += 1) {
    const frame: { value: unknown; offset?: number; easing?: ValueKeyframe<unknown>['easing'] } = { value: index * 10 };
    if (count > 1) {
      if (offsets === 'dyadic') frame.offset = Math.round((index / (count - 1)) * 1024) / 1024;
      // Quadratic spacing: clearly uneven, strictly increasing for every count used here.
      if (offsets === 'uneven') frame.offset = (index / (count - 1)) ** 2;
      // Only some frames carry an explicit offset; the rest are interpolated between them.
      if (offsets === 'partial' && (index === 0 || index === count - 1 || index % 3 === 1))
        frame.offset = index / (count - 1);
      // First offset > 0 and last offset < 1: normalization adds synthetic boundary frames.
      if (offsets === 'inset') frame.offset = 0.125 + (0.75 * index) / (count - 1);
    }
    if (easing === 'per-keyframe') frame.easing = names[index % names.length] as ValueKeyframe<unknown>['easing'];
    frames.push(frame as ValueKeyframe<unknown>);
  }
  return frames;
}

function factoryFor(
  count: number,
  offsets: OffsetStyle,
  easing: EasingStyle,
  mode: 'numeric' | 'tagged',
  extra: Partial<KeyframesOptions<unknown>> = {},
): OptionsFactory {
  return (onUpdate) =>
    ({
      duration: DURATION,
      keyframes: buildKeyframes(count, offsets, easing),
      ...(easing === 'named' ? { easing: 'easeInOutQuad' } : {}),
      ...(easing === 'function' ? { easing: (t: number) => t * t } : {}),
      ...(mode === 'tagged' ? { interpolate: tagged } : {}),
      ...extra,
      onUpdate,
    }) as KeyframesOptions<unknown>;
}

/** Exact offset positions (in ms) of the normalized frames, plus their float neighbours. */
function boundaryPositions(count: number, offsets: OffsetStyle): number[] {
  const positions = new Set<number>([0, DURATION]);
  for (const frame of buildKeyframes(count, offsets, 'linear')) {
    if (frame.offset === undefined) continue;
    const ms = frame.offset * DURATION;
    positions.add(ms);
    positions.add(ms - 1e-9);
    positions.add(ms + 1e-9);
    positions.add(ms - 1);
    positions.add(ms + 1);
  }
  for (let index = 0; index <= count; index += 1) {
    const ms = (index / Math.max(1, count - 1)) * DURATION;
    positions.add(ms);
    positions.add(Math.fround(ms)); // different bit pattern, near the same boundary
  }
  return [...positions].filter((ms) => ms >= 0 && ms <= DURATION);
}

/** Runs `positions` through `seek()` on both implementations and asserts every emission is identical. */
function expectSameSeeks(factory: OptionsFactory, positions: readonly number[]): void {
  const actual: Emission[] = [];
  const expected: Emission[] = [];
  const real = new Keyframes(
    factory((value, progress) => {
      actual.push([value, progress]);
    }),
  );
  const pinned = new PinnedKeyframes(
    factory((value, progress) => {
      expected.push([value, progress]);
    }),
  );
  const actualValues: unknown[] = [];
  const expectedValues: unknown[] = [];
  try {
    for (const ms of positions) {
      real.seek(ms);
      pinned.seek(ms);
      actualValues.push(real.value$.value);
      expectedValues.push(pinned.value$.value);
    }
    expect(actual).toEqual(expected);
    expect(actualValues).toEqual(expectedValues);
  } finally {
    real.stop();
    pinned.stop();
  }
}

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

// 49 frames = 48 segments (last size that keeps the plain scan), 50 = 49 segments (first with the segment cursor).
const FRAME_COUNTS = [1, 2, 5, 20, 49, 50, 100] as const;
const OFFSET_STYLES: readonly OffsetStyle[] = ['implicit', 'dyadic', 'uneven', 'partial', 'inset'];
const EASING_STYLES: readonly EasingStyle[] = ['linear', 'named', 'function', 'per-keyframe'];

describe('Given the segment lookup of Keyframes<T> (PERF-005 golden table)', () => {
  describe('When the playhead is scrubbed forward, backward and to every offset boundary', () => {
    for (const count of FRAME_COUNTS) {
      for (const offsets of OFFSET_STYLES) {
        for (const easing of EASING_STYLES) {
          for (const mode of ['numeric', 'tagged'] as const) {
            it(`Then ${count} frame(s), ${offsets} offsets, ${easing} easing, ${mode} values match the pre-cursor implementation`, () => {
              const forward = Array.from({ length: 129 }, (_, step) => (step / 128) * DURATION);
              const backward = [...forward].reverse();
              const boundaries = boundaryPositions(count, offsets);
              const ascending = [...boundaries].sort((a, b) => a - b);
              const descending = [...ascending].reverse();
              // Boundary hops in a fixed zig-zag so each boundary is reached from above and from below.
              const zigzag = ascending.flatMap((ms, index) => [ms, descending[index]!]);
              expectSameSeeks(factoryFor(count, offsets, easing, mode), [
                ...forward,
                ...backward,
                ...ascending,
                ...descending,
                ...zigzag,
                0,
                DURATION,
                0,
                DURATION,
                0,
              ]);
            });
          }
        }
      }
    }
  });

  describe('When seeks are seeded random mixes of forward and backward moves', () => {
    it('Then 1,200 sequences across frame counts, offset styles and easings match the pre-cursor implementation', () => {
      const random = createRandom(0x5eed0005);
      let sequences = 0;
      for (let round = 0; round < 60; round += 1) {
        for (const count of FRAME_COUNTS) {
          for (const offsets of OFFSET_STYLES) {
            if (count === 1 && offsets !== 'implicit') continue;
            const easing = EASING_STYLES[Math.floor(random() * EASING_STYLES.length)]!;
            const mode = random() < 0.5 ? 'numeric' : 'tagged';
            const boundaries = boundaryPositions(count, offsets);
            const length = 8 + Math.floor(random() * 40);
            const positions: number[] = [];
            let current = random() * DURATION;
            for (let step = 0; step < length; step += 1) {
              const move = random();
              if (move < 0.35)
                current = Math.min(DURATION, current + random() * 12); // small forward drift (playback-like)
              else if (move < 0.55)
                current = Math.max(0, current - random() * 12); // small backward drift
              else if (move < 0.75)
                current = random() * DURATION; // arbitrary jump
              else if (move < 0.9)
                current = boundaries[Math.floor(random() * boundaries.length)]!; // exact boundary
              else current = random() < 0.5 ? 0 : DURATION;
              positions.push(current);
            }
            expectSameSeeks(factoryFor(count, offsets, easing, mode), positions);
            sequences += 1;
          }
        }
      }
      expect(sequences).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('When the Animation carries a delay, repeat and yoyo', () => {
    for (const count of [2, 5, 20, 50, 100] as const) {
      for (const yoyo of [false, true]) {
        it(`Then ${count} frames with delay and repeat (yoyo ${yoyo}) match across seeks that cross cycle boundaries`, () => {
          const extra = { delay: 100, repeat: 2, yoyo };
          const total = 100 + DURATION * 3;
          const positions: number[] = [];
          for (let ms = 0; ms <= total; ms += 37) positions.push(ms); // forward through delay + three cycles
          for (let ms = total; ms >= 0; ms -= 53) positions.push(ms); // and back again
          for (const cycleEdge of [
            100,
            100 + DURATION - 1,
            100 + DURATION,
            100 + DURATION + 1,
            100 + 2 * DURATION,
            total,
          ])
            positions.push(cycleEdge);
          expectSameSeeks(factoryFor(count, 'dyadic', 'per-keyframe', 'tagged', extra), positions);
          expectSameSeeks(factoryFor(count, 'implicit', 'named', 'numeric', extra), positions);
        });
      }
    }
  });

  describe('When the animation is played by the frame clock', () => {
    for (const yoyo of [false, true]) {
      it(`Then forward playback with delay, repeat and yoyo ${yoyo} emits the same sequence as the pre-cursor implementation`, () => {
        const actual: Emission[] = [];
        const expected: Emission[] = [];
        const extra = { delay: 48, repeat: 2, yoyo };
        const real = new Keyframes(
          factoryFor(
            20,
            'uneven',
            'per-keyframe',
            'tagged',
            extra,
          )((value, progress) => {
            actual.push([value, progress]);
          }),
        );
        const pinned = new PinnedKeyframes(
          factoryFor(
            20,
            'uneven',
            'per-keyframe',
            'tagged',
            extra,
          )((value, progress) => {
            expected.push([value, progress]);
          }),
        );
        try {
          real.play();
          pinned.play();
          // 16 ms frames across delay + three 1,024 ms cycles, with an irregular hiccup now and then.
          let time = 0;
          for (let frame = 0; frame < 230; frame += 1) {
            raf.advance(time);
            time += frame % 17 === 0 ? 40 : 16;
          }
          expect(actual.length).toBeGreaterThan(100);
          expect(actual).toEqual(expected);
          expect(real.value$.value).toEqual(pinned.value$.value);
        } finally {
          real.stop();
          pinned.stop();
        }
      });
    }

    it('Then stop() and a second play() after a partial run still match', () => {
      const actual: Emission[] = [];
      const expected: Emission[] = [];
      const factory = factoryFor(5, 'implicit', 'per-keyframe', 'tagged', { repeat: 1, yoyo: true });
      const real = new Keyframes(
        factory((value, progress) => {
          actual.push([value, progress]);
        }),
      );
      const pinned = new PinnedKeyframes(
        factory((value, progress) => {
          expected.push([value, progress]);
        }),
      );
      try {
        for (let run = 0; run < 2; run += 1) {
          real.play();
          pinned.play();
          for (let time = 0; time <= 1500; time += 16) raf.advance(run * 5000 + time);
          real.stop();
          pinned.stop();
        }
        expect(actual).toEqual(expected);
      } finally {
        real.stop();
        pinned.stop();
      }
    });
  });

  describe('When a single keyframe or only two keyframes are given', () => {
    it('Then they match the pre-cursor implementation at 0, mid and 1 and on repeated seeks to the same position', () => {
      for (const count of [1, 2]) {
        expectSameSeeks(factoryFor(count, 'implicit', 'linear', 'tagged'), [
          0,
          0,
          512,
          512,
          512,
          1023,
          DURATION,
          DURATION,
          3,
          0,
        ]);
        expectSameSeeks(factoryFor(count, 'implicit', 'per-keyframe', 'numeric'), [DURATION, 0, 700, 100, 700, 0]);
      }
    });
  });

  describe('When progress is degenerate (zero duration, NaN or infinite seeks)', () => {
    it('Then a zero-duration Keyframes matches the pre-cursor implementation', () => {
      for (const count of [1, 2, 5, 20]) {
        expectSameSeeks(factoryFor(count, 'implicit', 'per-keyframe', 'tagged', { duration: 0 }), [0, 5, 0, 1e9, 0]);
        expectSameSeeks(factoryFor(count, 'uneven', 'linear', 'numeric', { duration: 0, delay: 10 }), [0, 10, 11, 0]);
      }
    });

    it('Then NaN and Infinity seeks match the pre-cursor implementation, also between cursor-moving seeks', () => {
      for (const count of [2, 5, 20, 50, 100]) {
        expectSameSeeks(factoryFor(count, 'dyadic', 'per-keyframe', 'tagged'), [
          900,
          Number.NaN,
          900,
          Number.POSITIVE_INFINITY,
          100,
          Number.NEGATIVE_INFINITY,
          700,
          Number.NaN,
          Number.NaN,
          3,
          1023,
        ]);
      }
    });

    for (const count of [3, 60]) {
      it(`Then the first segment is used when progress is NaN with ${count} frames (scan path and cursor path), as before the cursor`, () => {
        const emitted: Emission[] = [];
        const reference: Emission[] = [];
        const factory = factoryFor(count, 'implicit', 'linear', 'tagged');
        const real = new Keyframes(
          factory((value, progress) => {
            emitted.push([value, progress]);
          }),
        );
        const pinned = new PinnedKeyframes(
          factory((value, progress) => {
            reference.push([value, progress]);
          }),
        );
        try {
          // Move the cursor to the last segment first, then feed NaN straight into the update step (a seek never produces one).
          real.seek(DURATION * 0.95);
          pinned.seek(DURATION * 0.95);
          (real as unknown as { updateValue(progress: number): void }).updateValue(Number.NaN);
          (pinned as unknown as { updateValue(progress: number): void }).updateValue(Number.NaN);
          expect(emitted).toEqual(reference);
          expect(String(emitted[emitted.length - 1]![0])).toMatch(/^0>10@/);
        } finally {
          real.stop();
          pinned.stop();
        }
      });
    }
  });

  describe('When a seek lands exactly on an offset', () => {
    it('Then the earlier segment owns it (progress <= end offset), at 0, 0.5 and just above 0.5', () => {
      const emissions: unknown[] = [];
      const sequence = new Keyframes<unknown>({
        duration: DURATION,
        interpolate: tagged,
        keyframes: [
          { value: 'a', offset: 0 },
          { value: 'b', offset: 0.5 },
          { value: 'c', offset: 1 },
        ],
        onUpdate: (value) => emissions.push(value),
      });
      try {
        sequence.seek(0);
        sequence.seek(DURATION / 2);
        sequence.seek(DURATION / 2 + 1);
        sequence.seek(DURATION / 2); // backward onto the boundary again
        sequence.seek(DURATION / 4);
        sequence.seek(DURATION);
        expect(emissions).toEqual([
          'a>b@0',
          'a>b@1', // exact 0.5 belongs to the first segment, at its end
          `b>c@${1 / 1024 / 0.5}`,
          'a>b@1',
          'a>b@0.5',
          'c',
        ]);
      } finally {
        sequence.stop();
      }
    });
  });
});
