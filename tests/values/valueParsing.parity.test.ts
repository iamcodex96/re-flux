import { describe, expect, it } from '@jest/globals';
import { interpolate } from '../../src/values/interpolate.js';
import { interpolateCssValue } from '../../src/adapters/dom/cssInterpolation.js';

/**
 * REFACTOR-003 parity: `interpolate()` and `interpolateCssValue()` may format their output differently on purpose
 * (rgba() normalization vs author-template preservation) but they must agree on the NUMERIC VALUE of every
 * number and color channel. The comparison parses both outputs with the helper below, which is deliberately
 * independent of the production parser so the test cannot agree with a bug by sharing it.
 */

const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi;

/** Numbers of a value, or [r, g, b, a] for a color (channels rounded to 8 bits, as a browser would). */
function numericValues(text: string): number[] {
  const value = text.trim().toLowerCase();
  const hex = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/.exec(value);
  if (hex) {
    let raw = hex[1]!;
    if (raw.length <= 4) raw = [...raw].map((digit) => digit + digit).join('');
    const channel = (index: number): number => Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16);
    return [channel(0), channel(1), channel(2), raw.length === 8 ? channel(3) / 255 : 1];
  }
  const rgb = /^rgba?\((.*)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1]!
      .replace('/', ' ')
      .split(/[\s,]+/)
      .filter(Boolean);
    const numbers = parts.map((part, index) => {
      const number = Number.parseFloat(part);
      if (!part.endsWith('%')) return number;
      return index < 3 ? (number / 100) * 255 : number / 100;
    });
    return [...numbers.slice(0, 3).map((channel) => Math.round(Math.max(0, Math.min(255, channel)))), numbers[3] ?? 1];
  }
  return (value.match(NUMBER) ?? []).map(Number);
}

const INPUTS: ReadonlyArray<readonly [from: string, to: string]> = [
  ['0px', '100px'],
  ['+5px', '+15px'],
  ['+5px', '-5px'],
  ['-20.5px', '40.25px'],
  ['1e-3px', '2e-3px'],
  ['1e-3px', '1e-2px'],
  ['1e3px', '2e3px'],
  ['0.1234567px', '1.9876543px'],
  ['50%', '75.5%'],
  ['1em', '3em'],
  ['translate(0px, 10px)', 'translate(100px, -30px)'],
  ['matrix(1, 0, 0, 1, 0, 0)', 'matrix(2, 0.5, -0.5, 2, 10, 20)'],
  ['scale(.5)', 'scale(1.5)'],
  ['0 0 0 / 0.2', '10 10 4 / 0.9'],
  ['rgb(0, 20, 40)', 'rgb(100, 120, 140)'],
  ['rgb(10.5, 0, 0)', 'rgb(20.5, 0, 0)'],
  ['rgba(0,0,0,.123456)', 'rgba(0,0,0,.9)'],
  ['rgb(300 0 0 / 50%)', 'rgb(0 0 300 / 100%)'],
  ['rgb(0 0 0 / 0)', 'rgb(255 255 255 / 1)'],
  ['rgb(-20, 128, 300)', 'rgb(255, 0, 0)'],
  ['rgb(10% 20% 30%)', 'rgb(50% 60% 70%)'],
  ['rgb(10% 20% 30%)', '#ffffff'],
  ['#000', '#fff'],
  ['#112233', '#445566'],
  ['#123', '#456'],
  ['#0000ff', '#ff0000'],
  ['#ff000080', '#00ff00'],
  ['#f008', '#0f08'],
  ['#112233', 'rgb(100, 120, 140)'],
  ['rgba(0, 0, 0, 0)', 'rgba(100, 200, 50, 1)'],
];

const PROGRESS_VALUES = [0.1, 0.25, 0.5, 0.75, 0.9, 1.2, -0.2];

describe('Given interpolate() and interpolateCssValue() receive the same input', () => {
  it('Then the table covers at least 20 distinct inputs', () => {
    expect(new Set(INPUTS.map(([from, to]) => `${from}|${to}`)).size).toBeGreaterThanOrEqual(20);
  });

  describe.each(INPUTS)('When interpolating %s -> %s', (from, to) => {
    it.each(PROGRESS_VALUES)('Then both paths agree on every number and channel at progress %s', (progress) => {
      const value = numericValues(interpolate(from, to, progress));
      const css = numericValues(interpolateCssValue(from, to, progress));
      expect(css).toHaveLength(value.length);
      css.forEach((number, index) => expect(number).toBeCloseTo(value[index]!, 5));
    });
  });
});
