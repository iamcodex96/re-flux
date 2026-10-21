import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Keyframes, keyframes } from '../../src/values/Keyframes.js';
import { Timeline } from '../../src/core/Timeline.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given Keyframes<T>', () => {

  describe('When a keyframe sequence is configured', () => {
    describe('And When keyframes contain invalid adjacent value shapes', () => {
      it('Then it validates every adjacent value pair, including intermediate object and array shapes', () => {
        expect(() => new Keyframes({
          duration: 100,
          keyframes: [
            { value: { x: 0 } },
            { value: { y: 10 } },
            { value: { x: 20 } },
          ],
        })).toThrow('Keyframes requires an interpolate function');

        expect(() => new Keyframes({
          duration: 100,
          keyframes: [
            { value: [0, 1] },
            { value: [0, 1, 2] },
            { value: [2, 3] },
          ],
        })).toThrow('Keyframes requires an interpolate function');
      });
    });
    describe('And When keyframe value shapes differ and a custom interpolator is supplied', () => {
      it('Then it uses a custom interpolator for every segment when keyframe shapes differ', () => {
        const sequence = new Keyframes({
          duration: 100,
          keyframes: [
            { value: { x: 0 } },
            { value: { y: 10 } },
            { value: { x: 20 } },
          ],
          interpolate: (from, to, progress) => progress < 1 ? from : to,
        });

        sequence.seek(50);
        expect(sequence.value$.value).toEqual({ y: 10 });
        sequence.seek(100);
        expect(sequence.value$.value).toEqual({ x: 20 });
      });
    });
    describe('And When keyframes use implicit offsets and manual seeking', () => {
      it('Then it interpolates evenly distributed values and accepts seeks', () => {
        const sequence = keyframes({
          duration: 100,
          keyframes: [{ value: 0 }, { value: 100 }, { value: 50 }],
        });

        sequence.seek(25);
        expect(sequence.value$.value).toBe(50);
        sequence.seek(50);
        expect(sequence.value$.value).toBe(100);
        sequence.seek(100);
        expect(sequence.value$.value).toBe(50);
        expect(sequence.state$.value).toBe('completed');
      });
    });
    describe('And When keyframes mix explicit and missing offsets', () => {
      it('Then it fills missing offsets between explicit keyframes and holds values outside explicit endpoints', () => {
        const sequence = new Keyframes({
          duration: 100,
          keyframes: [
            { value: 10, offset: 0.2 },
            { value: 50 },
            { value: 90, offset: 0.8 },
          ],
        });

        sequence.seek(0);
        expect(sequence.value$.value).toBe(10);
        sequence.seek(50);
        expect(sequence.value$.value).toBe(50);
        sequence.seek(100);
        expect(sequence.value$.value).toBe(90);
      });
    });
    describe('And When individual keyframe segments configure easing', () => {
      it('Then it applies per-segment easing', () => {
        const sequence = new Keyframes({
          duration: 100,
          keyframes: [
            { value: 0, offset: 0, easing: 'easeOutQuad' },
            { value: 100, offset: 1 },
          ],
        });

        sequence.seek(50);
        expect(sequence.value$.value).toBe(75);
      });
    });
    describe('And When object-valued keyframes are configured with a custom interpolator', () => {
      it('Then it supports custom interpolators for object values', () => {
        const sequence = keyframes({
          duration: 100,
          keyframes: [{ value: { x: 0 } }, { value: { x: 20 } }],
          interpolate: (from, to, progress) => ({ x: from.x + (to.x - from.x) * progress }),
        });

        sequence.seek(25);
        expect(sequence.value$.value).toEqual({ x: 5 });
      });
    });
    describe('And When a Keyframes instance is added to a Timeline', () => {
      it('Then it can be composed in Timeline and is driven by the parent playhead', async () => {
        const sequence = new Keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 100 }] });
        const timeline = new Timeline().add(sequence, 50);
        const completion = timeline.toPromise();

        timeline.play();
        raf.advance(0);
        timeline.seek(100);
        expect(sequence.value$.value).toBe(50);
        timeline.seek(150);
        await expect(completion).resolves.toBeUndefined();
        expect(sequence.value$.value).toBe(100);
        expect(raf.pendingCount).toBe(0);
      });
    });
    describe('And When keyframe offsets or non-numeric values are invalid', () => {
      it('Then it validates offsets and requires a custom non-numeric interpolator', () => {
        expect(() => new Keyframes({ duration: 100, keyframes: [] })).toThrow('at least one frame');
        expect(() => new Keyframes({ duration: 100, keyframes: [{ value: 0, offset: 0.8 }, { value: 1, offset: 0.2 }] })).toThrow('strictly increasing');
        expect(() => new Keyframes({ duration: 100, keyframes: [{ value: 'a' }, { value: 'b' }] })).toThrow('Keyframes requires an interpolate function');
      });
    });
  });
});
