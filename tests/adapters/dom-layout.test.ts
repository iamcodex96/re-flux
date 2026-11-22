import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { flip } from '../../src/adapters/dom/layout.js';
import { createElement, installBrowserGlobals, type FakeRect } from '../helpers/fakeDom.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();
let restoreGlobals: () => void;
let computedTransform = 'none';

beforeEach(() => {
  raf.install();
  computedTransform = 'none';
  restoreGlobals = installBrowserGlobals({ getComputedStyle: () => ({ transform: computedTransform }) }, {});
});
afterEach(() => {
  restoreGlobals();
  raf.uninstall();
  jest.restoreAllMocks();
});

/** An element whose rectangle can be changed from the mutation callback. */
function movable(rect: FakeRect): { element: HTMLElement; move: (next: FakeRect) => void } {
  let current = rect;
  return { element: createElement({}, () => current), move: (next) => { current = next; } };
}

describe('Given flip() layout transitions', () => {
  describe('When an element changes position and size during the mutation callback', () => {
    it('Then it starts from the inverted transform and animates to the identity transform', () => {
      const { element, move } = movable({ left: 10, top: 20, width: 100, height: 50 });

      const scene = flip(element, () => move({ left: 110, top: 20, width: 200, height: 50 }), { duration: 400 });

      expect(scene.duration).toBe(400);
      expect(element.style.getPropertyValue('transform')).toBe('translate(-100px, 0px) scale(0.5, 1)');
      expect(element.style.getPropertyValue('transform-origin')).toBe('0px 0px');

      scene.seek(200);
      expect(element.style.getPropertyValue('transform')).toBe('translate(-50px, 0px) scale(0.75, 1)');

      scene.seek(400);
      expect(element.style.getPropertyValue('transform')).toBe('translate(0px, 0px) scale(1, 1)');
      expect(scene.state$.value).toBe('completed');
    });

    it('Then dispose() restores the original inline styles and is safe to repeat', () => {
      const { element, move } = movable({ left: 0, top: 0, width: 10, height: 10 });
      element.style.setProperty('transform', 'rotate(1deg)');

      const scene = flip(element, () => move({ left: 50, top: 0, width: 10, height: 10 }));
      expect(element.style.getPropertyValue('transform')).not.toBe('rotate(1deg)');

      scene.dispose();
      expect(element.style.getPropertyValue('transform')).toBe('rotate(1deg)');
      expect(element.style.getPropertyValue('transform-origin')).toBe('');
      expect(() => scene.dispose()).not.toThrow();
    });
  });

  describe('When the last box has no width or height', () => {
    it('Then the scale falls back to 1 instead of dividing by zero', () => {
      const { element, move } = movable({ left: 0, top: 0, width: 100, height: 100 });

      flip(element, () => move({ left: 0, top: 0, width: 0, height: 0 }));

      expect(element.style.getPropertyValue('transform')).toBe('translate(0px, 0px) scale(1, 1)');
    });
  });

  describe('When the element already has a computed transform', () => {
    it('Then the existing transform is composed after the FLIP transform', () => {
      computedTransform = 'matrix(1, 0, 0, 1, 5, 5)';
      const { element, move } = movable({ left: 0, top: 0, width: 10, height: 10 });

      const scene = flip(element, () => move({ left: 20, top: 0, width: 10, height: 10 }));

      expect(element.style.getPropertyValue('transform')).toBe('translate(-20px, 0px) scale(1, 1) matrix(1, 0, 0, 1, 5, 5)');
      scene.seek(400);
      expect(element.style.getPropertyValue('transform')).toBe('translate(0px, 0px) scale(1, 1) matrix(1, 0, 0, 1, 5, 5)');
    });
  });

  describe('When several elements move with a stagger', () => {
    it('Then a numeric stagger offsets each element and lengthens the scene', () => {
      const first = movable({ left: 0, top: 0, width: 10, height: 10 });
      const second = movable({ left: 0, top: 0, width: 10, height: 10 });

      const scene = flip([first.element, second.element], () => {
        first.move({ left: 10, top: 0, width: 10, height: 10 });
        second.move({ left: 10, top: 0, width: 10, height: 10 });
      }, { duration: 100, stagger: 50 });

      expect(scene.duration).toBe(150);
      scene.seek(100);
      expect(first.element.style.getPropertyValue('transform')).toBe('translate(0px, 0px) scale(1, 1)');
      expect(second.element.style.getPropertyValue('transform')).toBe('translate(-5px, 0px) scale(1, 1)');
    });

    it('Then a stagger function receives the index, element and total', () => {
      const first = movable({ left: 0, top: 0, width: 10, height: 10 });
      const second = movable({ left: 0, top: 0, width: 10, height: 10 });
      const stagger = jest.fn((index: number, _element: Element, _total: number) => index * 10);

      flip([first.element, second.element], () => undefined, { duration: 100, stagger });

      expect(stagger).toHaveBeenCalledTimes(2);
      expect(stagger.mock.calls[1]?.[0]).toBe(1);
      expect(stagger.mock.calls[1]?.[1]).toBe(second.element);
      expect(stagger.mock.calls[1]?.[2]).toBe(2);
    });
  });

  describe('When the input is invalid', () => {
    it('Then a non-finite stagger throws and restores every element', () => {
      const first = movable({ left: 0, top: 0, width: 10, height: 10 });
      const second = movable({ left: 0, top: 0, width: 10, height: 10 });

      expect(() => flip([first.element, second.element], () => first.move({ left: 9, top: 0, width: 10, height: 10 }), {
        stagger: (index: number) => (index === 1 ? Number.NaN : 0),
      })).toThrow('FLIP stagger must be finite for target 1.');

      expect(first.element.style.getPropertyValue('transform')).toBe('');
      expect(second.element.style.getPropertyValue('transform')).toBe('');
    });

    it('Then a missing mutation callback throws a TypeError before reading layout', () => {
      const { element } = movable({ left: 0, top: 0, width: 1, height: 1 });
      expect(() => flip(element, undefined as unknown as () => void)).toThrow(TypeError);
    });

    it('Then it reports a clear error outside a browser', () => {
      restoreGlobals();
      const { element } = movable({ left: 0, top: 0, width: 1, height: 1 });
      expect(() => flip(element, () => undefined)).toThrow('flip() requires a browser environment.');
      restoreGlobals = installBrowserGlobals({ getComputedStyle: () => ({ transform: 'none' }) }, {});
    });
  });
});
