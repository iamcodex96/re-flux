import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given Animation public contracts', () => {
  describe('When a finite animation is configured', () => {
    describe('And When its clock reaches the end', () => {
      it('Then callbacks run in order and completion is reported once', async () => {
        // Given: a finite animation with observable lifecycle callbacks.
        const events: string[] = [];
        const animation = new Animation({
          duration: 100,
          onStart: () => events.push('start'),
          onUpdate: (progress) => events.push(`update:${progress}`),
          onComplete: () => events.push('complete'),
        });
        const completion = animation.toPromise();

        // When: playback is requested repeatedly and frames advance to the end.
        animation.play();
        animation.play();
        expect(raf.pendingCount).toBe(1);
        raf.advance(0);
        raf.advance(50);
        raf.advance(100);
        await expect(completion).resolves.toBeUndefined();

        // Then: lifecycle callbacks are ordered and repeated play/seek calls do not duplicate completion.
        expect(events).toEqual(['start', 'update:0', 'update:0.5', 'update:1', 'complete']);
        animation.seek(100);
        expect(events).toEqual(['start', 'update:0', 'update:0.5', 'update:1', 'complete']);
        expect(animation.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a zero-duration animation is configured', () => {
    describe('And When its first frame is processed', () => {
      it('Then it completes without leaving a frame pending', async () => {
        // Given: an animation that has no active duration.
        const onStart = jest.fn();
        const onUpdate = jest.fn();
        const onComplete = jest.fn();
        const animation = new Animation({ duration: 0, onStart, onUpdate, onComplete });
        const completion = animation.toPromise();

        // When: the animation is played and the first frame is delivered.
        animation.play();
        expect(animation.state$.value).toBe('running');
        expect(raf.pendingCount).toBe(1);
        raf.advance(0);
        await expect(completion).resolves.toBeUndefined();

        // Then: the zero-length cycle reaches its terminal state exactly once and releases the clock.
        expect(animation.progress$.value).toBe(1);
        expect(animation.state$.value).toBe('completed');
        expect(onStart).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(1, 1);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an animation with a delay', () => {
    describe('And When frames advance through the delay', () => {
      it('Then start is reported only when active time begins', () => {
        // Given: a delayed animation with a start callback.
        const onStart = jest.fn();
        const animation = new Animation({ duration: 100, delay: 20, onStart });
        animation.play();

        // When: the initial frame and a frame before the delay has elapsed are delivered.
        raf.advance(0);
        raf.advance(10);

        // Then: the animation has not started yet.
        expect(onStart).not.toHaveBeenCalled();
        expect(animation.progress$.value).toBe(0);

        // When: the clock reaches the delay boundary.
        raf.advance(20);

        // Then: start is announced exactly once.
        expect(onStart).toHaveBeenCalledTimes(1);
        animation.stop();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a running animation', () => {
    describe('And When stop is called', () => {
      it('Then progress resets and later frames cannot update it', () => {
        // Given: an animation that has emitted updates while running.
        const onUpdate = jest.fn();
        const onStop = jest.fn();
        const animation = new Animation({ duration: 100, onUpdate, onStop });
        animation.play();
        raf.advance(0);
        raf.advance(25);
        const updatesAtStop = onUpdate.mock.calls.length;
        expect(animation.progress$.value).toBeCloseTo(0.25);

        // When: playback is stopped.
        animation.stop();

        // Then: the animation resets and its pending frame is cancelled.
        expect(animation.state$.value).toBe('idle');
        expect(animation.progress$.value).toBe(0);
        expect(onStop).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(0);

        // When: a timestamp arrives after stopping.
        raf.advance(75);

        // Then: no detached clock can emit a further update.
        expect(onUpdate).toHaveBeenCalledTimes(updatesAtStop);
        expect(animation.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a partially played animation', () => {
    describe('And When it restarts', () => {
      it('Then the previous completion rejects and a fresh cycle resolves', async () => {
        // Given: an animation with two separately observable completion cycles.
        const animation = new Animation({ duration: 100 });
        const oldCompletion = animation.toPromise();
        const oldCompletionAssertion = expect(oldCompletion).rejects.toThrow('Animation stopped before completion');
        animation.play();
        raf.advance(0);
        raf.advance(30);
        expect(animation.progress$.value).toBeCloseTo(0.3);

        // When: the animation restarts from the beginning.
        animation.restart();
        const newCompletion = animation.toPromise();
        expect(animation.state$.value).toBe('running');
        expect(animation.progress$.value).toBe(0);
        expect(raf.pendingCount).toBe(1);

        // Then: the old cycle rejects and only the new cycle can complete successfully.
        raf.advance(40);
        expect(animation.progress$.value).toBe(0);
        raf.advance(70);
        expect(animation.progress$.value).toBeCloseTo(0.3);
        raf.advance(140);
        await oldCompletionAssertion;
        await expect(newCompletion).resolves.toBeUndefined();
        expect(animation.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an animation has completed', () => {
    describe('And When it is played again', () => {
      it('Then playback starts a new cycle from zero', async () => {
        // Given: an animation that has completed its first cycle.
        const animation = new Animation({ duration: 50 });
        const firstCompletion = animation.toPromise();
        animation.play();
        raf.advance(0);
        raf.advance(50);
        await expect(firstCompletion).resolves.toBeUndefined();
        expect(animation.progress$.value).toBe(1);

        // When: playback is requested again.
        animation.play();
        const secondCompletion = animation.toPromise();

        // Then: a new pending cycle starts at the beginning and completes normally.
        expect(animation.state$.value).toBe('running');
        expect(animation.progress$.value).toBe(0);
        raf.advance(100);
        expect(animation.progress$.value).toBe(0);
        raf.advance(150);
        await expect(secondCompletion).resolves.toBeUndefined();
        expect(animation.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When requestAnimationFrame is unavailable', () => {
    describe('And When an Animation plays', () => {
      it('Then completion rejects and no active clock remains', async () => {
        // Given: the browser frame APIs are unavailable in this environment.
        Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: undefined });
        Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: undefined });
        const animation = new Animation({ duration: 100 });
        const completion = animation.toPromise();

        // When: playback tries to start without a frame scheduler.
        const assertion = expect(completion).rejects.toThrow('requestAnimationFrame is not available');
        animation.play();
        await assertion;

        // Then: the failure is observable through completion and the animation returns to idle.
        expect(animation.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an idle animation', () => {
    describe('And When seek receives out-of-range finite times', () => {
      it('Then it clamps progress without starting the clock', () => {
        // Given: an idle animation with no active frame subscription.
        const animation = new Animation({ duration: 100 });

        // When: the playhead is moved before the start and beyond the end.
        animation.seek(-20);
        expect(animation.progress$.value).toBe(0);
        animation.seek(140);

        // Then: time is clamped to the valid range and manual scrubbing remains clock-free.
        expect(animation.progress$.value).toBe(1);
        expect(animation.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });
});
