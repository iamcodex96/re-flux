import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Tween } from '../../src/values/Tween.js';
import { Timeline } from '../../src/core/Timeline.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given a Tween that wraps an Animation', () => {
  describe('When playback is controlled through the Tween', () => {
    describe('And When it is played, paused and resumed', () => {
      it('Then each control method returns the tween and the state follows playback', () => {
        const onPause = jest.fn();
        const onResume = jest.fn();
        const tween = new Tween({ from: 0, to: 100, duration: 100, onPause, onResume });

        expect(tween.play()).toBe(tween);
        expect(tween.state$.value).toBe('running');
        raf.advance(0);
        raf.advance(25);
        expect(tween.value$.value).toBe(25);

        expect(tween.pause()).toBe(tween);
        expect(tween.state$.value).toBe('paused');
        expect(onPause).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(0);

        tween.play();
        expect(tween.state$.value).toBe('running');
        expect(onResume).toHaveBeenCalledTimes(1);
        raf.advance(100);
        raf.advance(150);
        expect(tween.value$.value).toBe(75);
        tween.stop(); // the shared frame clock must be idle before the next test
      });
    });

    describe('And When it is stopped part-way through', () => {
      it('Then stop() returns the tween, restores the source value and calls onStop', () => {
        const onStop = jest.fn();
        const tween = new Tween({ from: 10, to: 20, duration: 100, onStop });
        tween.play();
        raf.advance(0);
        raf.advance(50);
        expect(tween.value$.value).toBe(15);

        expect(tween.stop()).toBe(tween);
        expect(tween.value$.value).toBe(10);
        expect(tween.progress$.value).toBe(0);
        expect(tween.state$.value).toBe('idle');
        expect(onStop).toHaveBeenCalledTimes(1);
      });
    });

    describe('And When it is restarted after being sought', () => {
      it('Then restart() resets the value immediately and starts a new run', () => {
        const tween = new Tween({ from: 0, to: 100, duration: 100 });
        tween.seek(80);
        expect(tween.value$.value).toBe(80);

        expect(tween.restart()).toBe(tween);
        expect(tween.value$.value).toBe(0);
        expect(tween.state$.value).toBe('running');
        raf.advance(0);
        raf.advance(30);
        expect(tween.value$.value).toBe(30);
        tween.stop();
      });
    });

    describe('And When a parent asks a running child to pause', () => {
      it('Then pauseFromParent() pauses only a running tween and calls onPause once', () => {
        const onPause = jest.fn();
        const tween = new Tween({ from: 0, to: 1, duration: 100, onPause });

        tween.pauseFromParent();
        expect(tween.state$.value).toBe('idle');
        expect(onPause).not.toHaveBeenCalled();

        tween.play();
        raf.advance(0);
        tween.pauseFromParent();
        expect(tween.state$.value).toBe('paused');
        expect(onPause).toHaveBeenCalledTimes(1);
        tween.stop(); // pauseFromParent() only changes state; release the shared clock explicitly
      });

      it('Then pausing a Timeline pauses a tween it owns', () => {
        const tween = new Tween({ from: 0, to: 100, duration: 100 });
        const timeline = new Timeline().add(tween);
        timeline.play();
        raf.advance(0);
        raf.advance(20);
        expect(tween.state$.value).toBe('running');

        timeline.pause();
        expect(tween.state$.value).toBe('paused');
        timeline.stop();
      });
    });

    describe('And When a parent drives it with seekLocal()', () => {
      it('Then it updates the value and can preserve the idle playback state', () => {
        const tween = new Tween({ from: 0, to: 100, duration: 100 });

        tween.seekLocal(50, true);
        expect(tween.value$.value).toBe(50);
        expect(tween.state$.value).toBe('idle');

        tween.seekLocal(60);
        expect(tween.value$.value).toBe(60);
        expect(tween.state$.value).toBe('running');
      });
    });

    describe('And When a parent resets it with resetInternal()', () => {
      it('Then it silently returns to the source value, progress zero and idle', () => {
        const onStop = jest.fn();
        const tween = new Tween({ from: 5, to: 15, duration: 100, onStop });
        tween.seek(100);
        expect(tween.state$.value).toBe('completed');

        tween.resetInternal();
        expect(tween.value$.value).toBe(5);
        expect(tween.progress$.value).toBe(0);
        expect(tween.state$.value).toBe('idle');
        expect(onStop).not.toHaveBeenCalled();
      });
    });
  });

  describe('When the tween is used as a promise', () => {
    describe('And When it completes', () => {
      it('Then then(), finally() and await all observe completion', async () => {
        const tween = new Tween({ from: 0, to: 1, duration: 100 });
        const onFinally = jest.fn();
        const settled = Promise.all([tween.then(() => 'then'), tween.finally(onFinally), tween.toPromise()]);
        tween.play();
        raf.advance(0);
        raf.advance(100);

        await expect(settled).resolves.toEqual(['then', undefined, undefined]);
        expect(onFinally).toHaveBeenCalledTimes(1);
        await expect(tween).resolves.toBeUndefined();
      });
    });

    describe('And When it is stopped before completing', () => {
      it('Then catch() receives the stop error', async () => {
        const tween = new Tween({ from: 0, to: 1, duration: 100 });
        const caught = tween.catch((error: unknown) => (error as Error).message);
        tween.play();
        raf.advance(0);
        tween.stop();

        await expect(caught).resolves.toBe('Animation stopped before completion');
      });
    });
  });

  describe('When the tween is configured with timing and value options', () => {
    describe('And When delay and repeat are set', () => {
      it('Then duration reports the total including delay and every repeat', () => {
        expect(new Tween({ from: 0, to: 1, duration: 100, delay: 50, repeat: 1 }).duration).toBe(250);
      });
    });

    describe('And When an easing and an onUpdate callback are set', () => {
      it('Then onUpdate receives the value, raw progress and eased progress', () => {
        const onUpdate = jest.fn();
        const tween = new Tween({ from: 0, to: 100, duration: 100, easing: 'easeInQuad', onUpdate });

        tween.seek(50);
        expect(onUpdate).toHaveBeenLastCalledWith(25, 0.5, 0.25);
      });
    });

    describe('And When numeric-template strings and colors are tweened', () => {
      it('Then they interpolate without a custom interpolator', () => {
        const length = new Tween({ from: '0px', to: '100px', duration: 100 });
        length.seek(50);
        expect(length.value$.value).toBe('50px');

        const color = new Tween({ from: '#000000', to: '#ffffff', duration: 100 });
        color.seek(50);
        expect(color.value$.value).toBe('rgba(128, 128, 128, 1)');
      });
    });

    describe('And When arrays of numbers are tweened', () => {
      it('Then each element interpolates independently', () => {
        const tween = new Tween({ from: [0, 10], to: [10, 20], duration: 100 });
        tween.seek(50);
        expect(tween.value$.value).toEqual([5, 15]);
      });
    });
  });
});
