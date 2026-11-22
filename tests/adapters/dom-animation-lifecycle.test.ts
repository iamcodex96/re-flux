import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Subscription } from 'rxjs';
import { DOMAnimation, animate } from '../../src/adapters/dom/animation.js';
import { createElement } from '../helpers/fakeDom.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given a DOMAnimation', () => {
  describe('When it is disposed', () => {
    it('Then it can no longer be played or restarted', () => {
      const animation = new DOMAnimation();
      animation.dispose();

      expect(() => animation.play()).toThrow('This DOMAnimation has been disposed');
      expect(() => animation.restart()).toThrow('This DOMAnimation has been disposed');
    });

    it('Then a binding attached afterwards is unsubscribed and rejected', () => {
      const animation = new DOMAnimation();
      animation.dispose();
      const binding = new Subscription();

      expect(() => animation.attachBinding(binding)).toThrow('Cannot attach a binding to a disposed DOMAnimation.');
      expect(binding.closed).toBe(true);
    });

    it('Then dispose is idempotent', () => {
      const callback = jest.fn();
      const animation = new DOMAnimation().addDisposeCallback(callback);

      animation.dispose();
      animation.dispose();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('When dispose callbacks are registered', () => {
    it('Then a callback added after disposal runs immediately', () => {
      const animation = new DOMAnimation();
      animation.dispose();
      const callback = jest.fn();

      animation.addDisposeCallback(callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('Then a non-function callback is rejected', () => {
      expect(() => new DOMAnimation().addDisposeCallback('nope' as unknown as () => void)).toThrow(TypeError);
    });

    it('Then every callback runs even if one throws, and the failures are aggregated', () => {
      const ran: string[] = [];
      const animation = new DOMAnimation()
        .addDisposeCallback(() => ran.push('first'))
        .addDisposeCallback(() => { throw new Error('callback failed'); })
        .addDisposeCallback(() => ran.push('third'));

      let caught: unknown;
      try { animation.dispose(); } catch (error) { caught = error; }

      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toHaveLength(1);
      expect(ran).toEqual(['first', 'third']);
    });
  });

  describe('When it is disposed while playing', () => {
    it('Then it stops the clock and restores the element styles', () => {
      const element = createElement({ opacity: '0.3' });
      const animation = animate(element, { duration: 100, properties: { opacity: { values: [0, 1] } } });

      animation.play();
      raf.advance(0);
      raf.advance(50);
      expect(element.style.getPropertyValue('opacity')).toBe('0.5');

      animation.dispose();

      expect(element.style.getPropertyValue('opacity')).toBe('0.3');
      expect(animation.state$.value).toBe('idle');
      expect(raf.pendingCount).toBe(0);
    });

    it('Then a pause is released as well', () => {
      const element = createElement({ opacity: '1' });
      const animation = animate(element, { duration: 100, properties: { opacity: { values: [0, 1] } } });
      animation.play();
      raf.advance(0);
      raf.advance(10);
      animation.pause();
      expect(animation.state$.value).toBe('paused');

      animation.dispose();

      expect(animation.state$.value).toBe('idle');
      expect(element.style.getPropertyValue('opacity')).toBe('1');
    });
  });

  describe('When a binding fails to tear down', () => {
    it('Then the failure is reported through the aggregate error', () => {
      const animation = new DOMAnimation();
      animation.attachBinding(new Subscription(() => { throw new Error('teardown failed'); }));

      expect(() => animation.dispose()).toThrow(AggregateError);
    });
  });
});
