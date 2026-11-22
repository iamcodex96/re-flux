import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { animateNumber, animateText } from '../../src/adapters/dom/text.js';
import { createTextElement } from '../helpers/fakeDom.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given animateText()', () => {
  describe('When text is split into graphemes (the default)', () => {
    it('Then it wraps each non-space grapheme, hides spans from assistive technology and labels the parent', () => {
      const target = createTextElement('Hi!');

      const animation = animateText(target, { duration: 100, stagger: 0 });

      expect(target.fakeChildren).toHaveLength(3);
      expect(target.getAttribute('aria-label')).toBe('Hi!');
      animation.dispose();
      expect(target.textContent).toBe('Hi!');
      expect(target.hasAttribute('aria-label')).toBe(false);
    });

    it('Then Intl.Segmenter keeps multi-code-point graphemes together', () => {
      const target = createTextElement('éx'); // "é" built from two code points, then "x"

      const animation = animateText(target, { duration: 100 });

      expect(target.fakeChildren.map((node) => node.textContent)).toEqual(['é', 'x']);
      animation.dispose();
    });

    it('Then it falls back to code points when Intl.Segmenter is unavailable', () => {
      const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
      Object.defineProperty(Intl, 'Segmenter', { configurable: true, writable: true, value: undefined });
      try {
        const target = createTextElement('ab');
        const animation = animateText(target, { duration: 100 });
        expect(target.fakeChildren.map((node) => node.textContent)).toEqual(['a', 'b']);
        animation.dispose();
      } finally {
        if (descriptor) Object.defineProperty(Intl, 'Segmenter', descriptor);
      }
    });
  });

  describe('When text is split by words', () => {
    it('Then whitespace is preserved as text nodes between animated word spans', () => {
      const target = createTextElement('Hello brave world');

      const animation = animateText(target, { splitBy: 'words', duration: 100 });

      expect(target.fakeChildren.map((node) => node.textContent)).toEqual(['Hello', ' ', 'brave', ' ', 'world']);
      expect(target.fakeChildren.filter((node) => node.nodeType === 1)).toHaveLength(3);
      animation.dispose();
      expect(target.textContent).toBe('Hello brave world');
    });
  });

  describe('When the element already has an aria-label', () => {
    it('Then the existing label is kept while animating and restored on dispose', () => {
      const target = createTextElement('Go', { 'aria-label': 'Start' });

      const animation = animateText(target, { duration: 100 });
      expect(target.getAttribute('aria-label')).toBe('Start');

      animation.dispose();
      expect(target.getAttribute('aria-label')).toBe('Start');
      expect(target.textContent).toBe('Go');
    });
  });

  describe('When there is nothing to animate', () => {
    it('Then whitespace-only text yields an empty animation that still restores the element', () => {
      const target = createTextElement('   ');

      const animation = animateText(target, { duration: 100 });
      expect(animation.duration).toBe(0);
      expect(target.getAttribute('aria-label')).toBe('   ');

      animation.dispose();
      expect(target.textContent).toBe('   ');
      expect(target.hasAttribute('aria-label')).toBe(false);
    });
  });

  describe('When the options are invalid', () => {
    it.each([
      ['splitBy', { splitBy: 'lines' as unknown as 'words' }, TypeError],
      ['fromOpacity above 1', { fromOpacity: 2 }, RangeError],
      ['fromOpacity below 0', { fromOpacity: -1 }, RangeError],
      ['fromOpacity NaN', { fromOpacity: Number.NaN }, RangeError],
      ['fromTransform', { fromTransform: 5 as unknown as string }, TypeError],
    ])('Then an invalid %s is rejected before the element is touched', (_label, options, errorType) => {
      const target = createTextElement('abc');

      expect(() => animateText(target, options)).toThrow(errorType);

      expect(target.textContent).toBe('abc');
      expect(target.hasAttribute('aria-label')).toBe(false);
    });

    it('Then a target without an ownerDocument is rejected', () => {
      const target = createTextElement('abc');
      Object.defineProperty(target, 'ownerDocument', { value: null });
      expect(() => animateText(target)).toThrow('requires a target with an ownerDocument');
    });

    it('Then an invalid animation option restores the original text and label', () => {
      const target = createTextElement('abc');

      expect(() => animateText(target, { duration: -5 })).toThrow(RangeError);

      expect(target.textContent).toBe('abc');
      expect(target.fakeChildren).toHaveLength(1);
      expect(target.hasAttribute('aria-label')).toBe(false);
    });
  });
});

describe('Given animateNumber()', () => {
  describe('When a numeric text value animates', () => {
    it('Then it renders with the default integer formatter and restores the original node on dispose', () => {
      const target = createTextElement('0');
      const original = target.fakeChildren[0];

      const animation = animateNumber(target, { from: 0, to: 100, duration: 100 });
      animation.seek(50);
      expect(target.textContent).toBe('50');

      animation.dispose();
      expect(target.fakeChildren[0]).toBe(original);
    });

    it('Then a custom formatter receives the value and progress', () => {
      const target = createTextElement('0');
      const format = jest.fn((value: number, progress: number) => `${value.toFixed(1)}@${progress}`);

      const animation = animateNumber(target, { from: 0, to: 10, duration: 100, format });
      animation.seek(25);

      expect(target.textContent).toBe('2.5@0.25');
      expect(format).toHaveBeenLastCalledWith(2.5, 0.25);
      animation.dispose();
    });
  });

  describe('When the endpoints are not finite', () => {
    it.each([[Number.NaN, 1], [0, Infinity]])('Then from=%p and to=%p are rejected', (from, to) => {
      const target = createTextElement('0');
      expect(() => animateNumber(target, { from, to, duration: 100 })).toThrow(RangeError);
    });
  });
});
