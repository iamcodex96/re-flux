import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { Keyframes } from '../../src/values/Keyframes.js';
import { Tween } from '../../src/values/Tween.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

type ValueAnimation = Tween<number> | Keyframes<number>;

const factories: ReadonlyArray<readonly [string, () => ValueAnimation, number]> = [
  ['Tween', () => new Tween({ from: 5, to: 50, duration: 100, delay: 10, repeat: 2 }), 5],
  [
    'Keyframes',
    () => new Keyframes({ keyframes: [{ value: 5 }, { value: 50 }], duration: 100, delay: 10, repeat: 2 }),
    5,
  ],
];

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe.each(factories)('Given a %s built on the shared value-animation shell', (_name, create, initialValue) => {
  describe('When a control method is called', () => {
    it.each(['play', 'pause', 'stop', 'restart'] as const)(
      'Then %s() forwards to the Animation once and returns the instance',
      (method) => {
        const item = create();
        const spy = jest.spyOn(Animation.prototype, method);

        expect(item[method]()).toBe(item);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.instances[0]).not.toBe(item);
        item.stop();
      },
    );

    it('Then seek() forwards its argument and returns the instance', () => {
      const item = create();
      const spy = jest.spyOn(Animation.prototype, 'seek');

      expect(item.seek(37)).toBe(item);
      expect(spy).toHaveBeenCalledWith(37);
    });

    it('Then seekLocal() forwards both arguments, defaulting preservePlaybackState to false', () => {
      const item = create();
      const spy = jest.spyOn(Animation.prototype, 'seekLocal');

      expect(item.seekLocal(40)).toBeUndefined();
      expect(item.seekLocal(60, true)).toBeUndefined();
      expect(spy).toHaveBeenNthCalledWith(1, 40, false);
      expect(spy).toHaveBeenNthCalledWith(2, 60, true);
    });

    it('Then pauseFromParent() and resetInternal() forward to the Animation', () => {
      const item = create();
      const pause = jest.spyOn(Animation.prototype, 'pauseFromParent');
      const reset = jest.spyOn(Animation.prototype, 'resetInternal');

      item.pauseFromParent();
      item.resetInternal();
      expect(pause).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('Then duration reads the Animation duration', () => {
      expect(create().duration).toBe(10 + 100 * 3);
    });
  });

  describe('When the value is reset', () => {
    it('Then stop() resets the value after the Animation stopped, restart() before it restarts', () => {
      const item = create();
      item.seekLocal(60);
      const order: string[] = [];
      item.value$.subscribe({
        next: (value) => {
          if (value === initialValue) order.push('value');
        },
      });
      order.length = 0;
      jest.spyOn(Animation.prototype, 'stop').mockImplementation(function stubStop(this: Animation) {
        order.push('stop');
        return this;
      });
      jest.spyOn(Animation.prototype, 'restart').mockImplementation(function stubRestart(this: Animation) {
        order.push('restart');
        return this;
      });

      item.stop();
      expect(order).toEqual(['stop', 'value']);
      order.length = 0;
      item.seekLocal(60);
      order.length = 0;
      item.restart();
      expect(order).toEqual(['value', 'restart']);
    });

    it('Then resetInternal() resets the value after the Animation reset', () => {
      const item = create();
      item.seekLocal(60);
      const order: string[] = [];
      item.value$.subscribe({
        next: (value) => {
          if (value === initialValue) order.push('value');
        },
      });
      order.length = 0;
      jest.spyOn(Animation.prototype, 'resetInternal').mockImplementation(() => {
        order.push('reset');
      });

      item.resetInternal();
      expect(order).toEqual(['reset', 'value']);
    });
  });

  describe('When completion is observed', () => {
    it('Then then(), catch(), finally() and toPromise() all use the Animation completion', async () => {
      const item = create();
      const thenSpy = jest.spyOn(Animation.prototype, 'then');
      const catchSpy = jest.spyOn(Animation.prototype, 'catch');
      const finallySpy = jest.spyOn(Animation.prototype, 'finally');
      const toPromiseSpy = jest.spyOn(Animation.prototype, 'toPromise');

      const onfulfilled = (): void => undefined;
      const onrejected = (): void => undefined;
      const onfinally = (): void => undefined;
      item.seekLocal(item.duration);
      await item.then(onfulfilled, onrejected);
      await item.catch(onrejected);
      await item.finally(onfinally);
      await item.toPromise();

      expect(thenSpy).toHaveBeenCalledWith(onfulfilled, onrejected);
      expect(catchSpy).toHaveBeenCalledWith(onrejected);
      expect(finallySpy).toHaveBeenCalledWith(onfinally);
      expect(toPromiseSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('When progress and state are observed', () => {
    it('Then progress$ and state$ are the Animation observables', () => {
      const item = create();
      item.seekLocal(60, true);
      expect(item.progress$.value).toBeGreaterThan(0);
      expect(item.state$.value).toBe('idle');
      item.play();
      expect(item.state$.value).toBe('running');
      item.stop();
      expect(item.state$.value).toBe('idle');
    });
  });
});
