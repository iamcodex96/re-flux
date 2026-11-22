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

describe('Given Keyframes that wrap an Animation', () => {
  describe('When keyframe options are validated', () => {
    describe('And When no keyframes are supplied', () => {
      it('Then it throws a RangeError', () => {
        expect(() => new Keyframes({ duration: 100, keyframes: [] })).toThrow(RangeError);
        expect(() => new Keyframes({ duration: 100, keyframes: [] })).toThrow('Keyframes requires at least one frame.');
      });
    });

    describe.each([
      ['an offset below 0', [{ value: 0, offset: -0.1 }, { value: 1 }]],
      ['an offset above 1', [{ value: 0 }, { value: 1, offset: 1.5 }]],
      ['a non-finite offset', [{ value: 0, offset: Number.NaN }, { value: 1 }]],
    ])('And When a frame has %s', (_label, frames) => {
      it('Then it throws a RangeError naming the valid range', () => {
        expect(() => new Keyframes({ duration: 100, keyframes: frames })).toThrow('Keyframe offsets must be finite numbers between 0 and 1.');
      });
    });

    describe('And When explicit offsets do not increase', () => {
      it('Then it throws a RangeError', () => {
        expect(() => new Keyframes({
          duration: 100,
          keyframes: [{ value: 0, offset: 0.5 }, { value: 1, offset: 0.5 }],
        })).toThrow('Explicit keyframe offsets must be strictly increasing.');
      });
    });

    describe('And When a single frame is supplied', () => {
      it('Then the value is held for the whole duration', () => {
        const sequence = new Keyframes({ duration: 100, keyframes: [{ value: 7 }] });
        expect(sequence.value$.value).toBe(7);
        sequence.seek(50);
        expect(sequence.value$.value).toBe(7);
        sequence.seek(100);
        expect(sequence.value$.value).toBe(7);
      });
    });
  });

  describe('When offsets and easing are normalized', () => {
    describe('And When the first offset is above 0 and the last is below 1', () => {
      it('Then the first and last values are held before and after the explicit offsets', () => {
        const sequence = new Keyframes({
          duration: 100,
          keyframes: [{ value: 0, offset: 0.2 }, { value: 10, offset: 0.8 }],
        });

        sequence.seek(10);
        expect(sequence.value$.value).toBe(0);
        sequence.seek(50);
        expect(sequence.value$.value).toBeCloseTo(5, 9);
        sequence.seek(90);
        expect(sequence.value$.value).toBe(10);
      });
    });

    describe('And When one frame overrides the default easing', () => {
      it('Then that segment uses its own easing and the others use the default', () => {
        const sequence = new Keyframes({
          duration: 100,
          easing: 'linear',
          keyframes: [
            { value: 0, offset: 0, easing: 'easeInQuad' },
            { value: 100, offset: 0.5 },
            { value: 200, offset: 1 },
          ],
        });

        sequence.seek(25); // halfway through the first segment: easeInQuad(0.5) = 0.25
        expect(sequence.value$.value).toBe(25);
        sequence.seek(75); // halfway through the second segment: linear
        expect(sequence.value$.value).toBe(150);
      });
    });
  });

  describe('When the value callback is used', () => {
    describe('And When the sequence is sought, stopped and restarted', () => {
      it('Then onUpdate receives every published value and progress, including resets', () => {
        const onUpdate = jest.fn();
        const sequence = keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 100 }], onUpdate });

        sequence.seek(50);
        expect(onUpdate).toHaveBeenLastCalledWith(50, 0.5);
        sequence.seek(100);
        expect(onUpdate).toHaveBeenLastCalledWith(100, 1);
        sequence.stop();
        expect(onUpdate).toHaveBeenLastCalledWith(0, 0);
        sequence.restart();
        expect(onUpdate).toHaveBeenCalledWith(0, 0);
        sequence.stop();
      });
    });
  });

  describe('When playback is controlled through Keyframes', () => {
    describe('And When it is played, paused and resumed', () => {
      it('Then each control method returns the instance and the clock follows playback', () => {
        const sequence = keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 100 }] });

        expect(sequence).toBeInstanceOf(Keyframes);
        expect(sequence.play()).toBe(sequence);
        raf.advance(0);
        raf.advance(40);
        expect(sequence.value$.value).toBe(40);
        expect(sequence.pause()).toBe(sequence);
        expect(sequence.state$.value).toBe('paused');
        expect(raf.pendingCount).toBe(0);
      });
    });

    describe('And When it is stopped or restarted', () => {
      it('Then it returns to the first value', () => {
        const sequence = keyframes({ duration: 100, keyframes: [{ value: 10 }, { value: 20 }] });
        sequence.seek(100);
        expect(sequence.value$.value).toBe(20);

        expect(sequence.stop()).toBe(sequence);
        expect(sequence.value$.value).toBe(10);
        sequence.seek(50);
        expect(sequence.restart()).toBe(sequence);
        expect(sequence.value$.value).toBe(10);
        expect(sequence.state$.value).toBe('running');
        sequence.stop();
      });
    });

    describe('And When a Timeline owns it', () => {
      it('Then pauseFromParent(), seekLocal() and resetInternal() are honoured', () => {
        const sequence = keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 100 }] });
        const timeline = new Timeline().add(sequence);
        timeline.play();
        raf.advance(0);
        raf.advance(20);
        expect(sequence.state$.value).toBe('running');
        timeline.pause();
        expect(sequence.state$.value).toBe('paused');

        sequence.seekLocal(60, true);
        expect(sequence.value$.value).toBe(60);
        sequence.resetInternal();
        expect(sequence.value$.value).toBe(0);
        expect(sequence.progress$.value).toBe(0);
        timeline.stop();
      });
    });
  });

  describe('When the sequence is used as a promise', () => {
    describe('And When it completes', () => {
      it('Then then(), finally() and toPromise() resolve', async () => {
        const sequence = keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 1 }] });
        const onFinally = jest.fn();
        const settled = Promise.all([sequence.then(() => 'done'), sequence.finally(onFinally), sequence.toPromise()]);
        sequence.play();
        raf.advance(0);
        raf.advance(100);

        await expect(settled).resolves.toEqual(['done', undefined, undefined]);
        expect(onFinally).toHaveBeenCalledTimes(1);
        expect(sequence.duration).toBe(100);
      });
    });

    describe('And When it is stopped before completing', () => {
      it('Then catch() receives the stop error', async () => {
        const sequence = keyframes({ duration: 100, keyframes: [{ value: 0 }, { value: 1 }] });
        const caught = sequence.catch((error: unknown) => (error as Error).message);
        sequence.play();
        raf.advance(0);
        sequence.stop();

        await expect(caught).resolves.toBe('Animation stopped before completion');
      });
    });
  });
});
