import { describe, expect, it } from '@jest/globals';
import { interpolate } from '../../src/values/interpolate.js';
import { interpolateCssValue } from '../../src/adapters/dom/cssInterpolation.js';

/**
 * REFACTOR-003 characterization tests.
 *
 * Every row was first pinned GREEN against the untouched code (the original expectations are preserved in the
 * session notes and quoted in each test name as "was ..."). Each ACCIDENTAL divergence was then converged
 * red -> green by REFACTOR-003, so the expectations below describe the converged behaviour. INTENTIONAL
 * differences (CSS preserves the author's template, color function and endpoint strings and switches
 * discretely; the value path normalizes to rgba() and throws on incompatible values) are kept and named as such.
 */

type Row = readonly [from: string, to: string, progress: number];

function both(row: Row): { value: string; css: string } {
  const [from, to, progress] = row;
  return { value: interpolate(from, to, progress), css: interpolateCssValue(from, to, progress) };
}

describe('Given the value path (interpolate) and the CSS path (interpolateCssValue) share one input', () => {
  describe('When a number carries an explicit plus sign', () => {
    it('Then ACCIDENTAL: +5px -> +15px at 0.5 is 10px on both paths (was 10px vs +10px)', () => {
      expect(both(['+5px', '+15px', 0.5])).toEqual({ value: '10px', css: '10px' });
    });
    it('Then ACCIDENTAL: +5px -> -5px and +5px -> 15px interpolate on both paths (was: the CSS path stayed at +5px)', () => {
      expect(both(['+5px', '-5px', 0.5])).toEqual({ value: '0px', css: '0px' });
      expect(both(['+5px', '15px', 0.5])).toEqual({ value: '10px', css: '10px' });
    });
  });

  describe('When a number uses an exponent', () => {
    it('Then ACCIDENTAL: 1e-3px -> 2e-3px at 0.5 is 0.0015px on both paths (was 0.0015px vs 1.5e-3px)', () => {
      expect(both(['1e-3px', '2e-3px', 0.5])).toEqual({ value: '0.0015px', css: '0.0015px' });
    });
    it('Then ACCIDENTAL: 1e-3px -> 1e-2px at 0.5 is 0.0055px on both paths (was 0.0055px vs the invalid 1e-2.5px)', () => {
      expect(both(['1e-3px', '1e-2px', 0.5])).toEqual({ value: '0.0055px', css: '0.0055px' });
    });
    it('Then ACCIDENTAL: 1e3px -> 2e3px at 0.5 is 1500px on both paths (was 1500px vs 1.5e3px)', () => {
      expect(both(['1e3px', '2e3px', 0.5])).toEqual({ value: '1500px', css: '1500px' });
    });
    it('Then the em unit is never read as an exponent (1em -> 3em is 2em on both paths)', () => {
      expect(both(['1em', '3em', 0.5])).toEqual({ value: '2em', css: '2em' });
    });
  });

  describe('When decimals exceed the output precision', () => {
    it('Then ACCIDENTAL: 0.1234567px -> 1.9876543px at 0.5 is 1.05556px (5 decimals) on both paths (was 5 vs 4 decimals)', () => {
      expect(both(['0.1234567px', '1.9876543px', 0.5])).toEqual({ value: '1.05556px', css: '1.05556px' });
    });
    it('Then ACCIDENTAL: rgba(0,0,0,.123456) -> rgba(0,0,0,.9) keeps 5 alpha decimals on both paths (was 0.5117 on the CSS path); INTENTIONAL: the CSS path keeps the author spacing', () => {
      expect(both(['rgba(0,0,0,.123456)', 'rgba(0,0,0,.9)', 0.5])).toEqual({
        value: 'rgba(0, 0, 0, 0.51173)',
        css: 'rgba(0,0,0,0.51173)',
      });
    });
  });

  describe('When channels are out of range or fractional', () => {
    it('Then ACCIDENTAL: rgb(300 0 0 / 50%) -> rgb(0 0 300 / 100%) clamps the inputs on both paths (was CSS rgb(150 0 150 / 75%)); INTENTIONAL: the CSS path keeps the color function', () => {
      expect(both(['rgb(300 0 0 / 50%)', 'rgb(0 0 300 / 100%)', 0.5])).toEqual({
        value: 'rgba(128, 0, 128, 0.75)',
        css: 'rgb(128 0 128 / 75%)',
      });
    });
    it('Then ACCIDENTAL: rgb() overshoot (progress 1.2) is clamped on both paths (was rgb(306,306,306) on the CSS path)', () => {
      expect(both(['rgb(0,0,0)', 'rgb(255,255,255)', 1.2])).toEqual({
        value: 'rgba(255, 255, 255, 1)',
        css: 'rgb(255,255,255)',
      });
    });
    it('Then ACCIDENTAL: fractional channels are rounded on both paths (was 127.5 / 15.5 on the CSS path)', () => {
      expect(both(['rgb(0 0 0 / 0)', 'rgb(255 255 255 / 1)', 0.5])).toEqual({
        value: 'rgba(128, 128, 128, 0.5)',
        css: 'rgb(128 128 128 / 0.5)',
      });
      expect(both(['rgb(10.5, 0, 0)', 'rgb(20.5, 0, 0)', 0.5])).toEqual({
        value: 'rgba(16, 0, 0, 1)',
        css: 'rgb(16, 0, 0)',
      });
    });
    it('Then ACCIDENTAL: alpha overshoot (progress 1.2 and -0.2) is clamped to 0..1 on both paths (was 1.2 / -0.2)', () => {
      expect(both(['rgba(0,0,0,0)', 'rgba(0,0,0,1)', 1.2])).toEqual({ value: 'rgba(0, 0, 0, 1)', css: 'rgba(0,0,0,1)' });
      expect(both(['rgba(0,0,0,0)', 'rgba(0,0,0,1)', -0.2])).toEqual({ value: 'rgba(0, 0, 0, 0)', css: 'rgba(0,0,0,0)' });
    });
  });

  describe('When hex colors have the same digit/letter layout', () => {
    it('Then ACCIDENTAL: #112233 -> #445566 is a color on both paths (was the number 112233 on the CSS path: #278899.5)', () => {
      expect(both(['#112233', '#445566', 0.5])).toEqual({ value: 'rgba(43, 60, 77, 1)', css: 'rgba(43, 60, 77, 1)' });
      expect(both(['#123', '#456', 0.5])).toEqual({ value: 'rgba(43, 60, 77, 1)', css: 'rgba(43, 60, 77, 1)' });
    });
  });

  describe('When rgb() channels are percentages', () => {
    it('Then ACCIDENTAL: rgb(10% 20% 30%) -> rgb(50% 60% 70%) is a color on both paths (was a template on the value path); INTENTIONAL: the CSS path keeps percentages, the value path emits rgba()', () => {
      expect(both(['rgb(10% 20% 30%)', 'rgb(50% 60% 70%)', 0.5])).toEqual({
        value: 'rgba(77, 102, 128, 1)',
        css: 'rgb(30% 40% 50%)',
      });
    });
    it('Then ACCIDENTAL: rgb(10% 20% 30%) -> #ffffff is a color on both paths (was a TypeError on the value path)', () => {
      expect(both(['rgb(10% 20% 30%)', '#ffffff', 0.5])).toEqual({
        value: 'rgba(140, 153, 166, 1)',
        css: 'rgba(140, 153, 166, 1)',
      });
    });
  });

  describe('When the author template must be preserved or normalized (INTENTIONAL differences)', () => {
    it('Then INTENTIONAL: the CSS path keeps the author color function and spacing while the value path normalizes to rgba(r, g, b, a)', () => {
      expect(both(['rgb(0, 20, 40)', 'rgb(100, 120, 140)', 0.5])).toEqual({
        value: 'rgba(50, 70, 90, 1)',
        css: 'rgb(50, 70, 90)',
      });
    });
    it('Then INTENTIONAL: the CSS path returns the exact input string at progress 0 and 1 while the value path re-serializes', () => {
      expect(interpolateCssValue('RGB(0,0,0)', 'rgb(1,1,1)', 0)).toBe('RGB(0,0,0)');
      expect(interpolateCssValue('RGB(0,0,0)', 'rgb(1,1,1)', 1)).toBe('rgb(1,1,1)');
      expect(interpolate('rgb(0,0,0)', 'rgb(1,1,1)', 0)).toBe('rgba(0, 0, 0, 1)');
    });
    it('Then INTENTIONAL: incompatible values switch discretely on the CSS path while the value path throws', () => {
      expect(interpolateCssValue('10px', '10em', 0.5)).toBe('10px');
      expect(interpolateCssValue('auto', '100px', 0.5)).toBe('auto');
      expect(() => interpolate('10px', '10em', 0.5)).toThrow('Values are incompatible');
    });
  });
});
