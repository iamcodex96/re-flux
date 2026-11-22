import { describe, expect, it } from '@jest/globals';
import {
  NUMERIC_TOKEN_SOURCE,
  formatNumber,
  formatRgba,
  mixRgba,
  parseColor,
  renderNumericTemplate,
  tokenizeNumbers,
} from '../../src/utils/valueTemplate.js';

describe('Given the shared numeric tokenizer', () => {
  describe('When a value contains signed, decimal and exponent numbers', () => {
    it('Then it extracts every number and keeps units and text in the template', () => {
      const { template, values } = tokenizeNumbers('translate(+5px, -.5em) scale(1.) 2E-2 1e3px');
      expect(values).toEqual([5, -0.5, 1, 0.02, 1000]);
      expect(template).toBe('translate(\u0000px, \u0000em) scale(\u0000) \u0000 \u0000px');
    });
    it('Then the em and ex units are not read as exponents', () => {
      expect(tokenizeNumbers('1em 2ex 3e').values).toEqual([1, 2, 3]);
    });
    it('Then a value without numbers has no values and an unchanged template', () => {
      expect(tokenizeNumbers('auto')).toEqual({ template: 'auto', values: [] });
    });
    it('Then a token that is not a finite number stays literal in the template', () => {
      expect(tokenizeNumbers('1e999px 2px')).toEqual({ template: '1e999px \u0000px', values: [2] });
    });
    it('Then it is stateless across calls', () => {
      expect(tokenizeNumbers('1 2').values).toEqual([1, 2]);
      expect(tokenizeNumbers('1 2').values).toEqual([1, 2]);
    });
  });
  describe('When the numeric pattern source is reused to build a larger pattern', () => {
    it('Then it matches the same tokens as the tokenizer', () => {
      expect('M1e2-3.5.5L+4'.match(new RegExp(NUMERIC_TOKEN_SOURCE, 'g'))).toEqual(['1e2', '-3.5', '.5', '+4']);
    });
  });
  describe('When a template is rendered', () => {
    it('Then each slot is replaced in order by the produced text', () => {
      const { template } = tokenizeNumbers('a1b2c3');
      expect(renderNumericTemplate(template, (index) => `<${index}>`)).toBe('a<0>b<1>c<2>');
    });
  });
});

describe('Given formatNumber', () => {
  it('Then it rounds to 5 decimals, drops trailing zeros and never prints -0', () => {
    expect(formatNumber(1.0555555)).toBe('1.05556');
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-0.000001)).toBe('0');
    expect(formatNumber(1e-7)).toBe('0');
    expect(formatNumber(-2.5)).toBe('-2.5');
  });
});

describe('Given the shared color parser', () => {
  describe('When hex colors are supplied', () => {
    it('Then it parses 3, 4, 6 and 8 digit hex, case-insensitively and trimmed', () => {
      expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor(' #F008 ')).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
      expect(parseColor('#112233')).toEqual({ r: 17, g: 34, b: 51, a: 1 });
      expect(parseColor('#11223380')).toEqual({ r: 17, g: 34, b: 51, a: 128 / 255 });
    });
    it('Then it rejects malformed hex', () => {
      for (const bad of ['#12', '#12345', '#1234567', '#ggg', 'fff']) expect(parseColor(bad)).toBeNull();
    });
  });
  describe('When rgb() and rgba() colors are supplied', () => {
    it('Then it accepts comma, space and slash separated forms', () => {
      expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
      expect(parseColor('RGBA(1,2,3,.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
      expect(parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
      expect(parseColor('rgb(1 2 3/0.25)')).toEqual({ r: 1, g: 2, b: 3, a: 0.25 });
    });
    it('Then it clamps channels to 0..255 and alpha to 0..1', () => {
      expect(parseColor('rgb(300, -5, 10.5 / 2)')).toEqual({ r: 255, g: 0, b: 10.5, a: 1 });
      expect(parseColor('rgba(0 0 0 / 250%)')?.a).toBe(1);
    });
    it('Then it converts percentage channels to the 0..255 range', () => {
      expect(parseColor('rgb(0% 50% 100%)')).toEqual({ r: 0, g: 127.5, b: 255, a: 1 });
    });
    it('Then it accepts exponent numbers', () => {
      expect(parseColor('rgb(1e2, 0, 0)')).toEqual({ r: 100, g: 0, b: 0, a: 1 });
    });
    it('Then it rejects anything that is not exactly an rgb color', () => {
      for (const bad of ['rgb(1px, 2, 3)', 'rgb(1, 2)', 'rgb(1, 2, 3, 4, 5)', 'hsl(0, 0%, 0%)', 'red', 'rgb(1,2,3) x', '10px']) {
        expect(parseColor(bad)).toBeNull();
      }
    });
  });
});

describe('Given color mixing and formatting', () => {
  it('Then mixRgba clamps channels and alpha, including on overshoot', () => {
    const from = { r: 0, g: 100, b: 255, a: 0 };
    const to = { r: 255, g: 100, b: 0, a: 1 };
    expect(mixRgba(from, to, 0.5)).toEqual({ r: 127.5, g: 100, b: 127.5, a: 0.5 });
    expect(mixRgba(from, to, 1.2)).toEqual({ r: 255, g: 100, b: 0, a: 1 });
    expect(mixRgba(from, to, -0.2)).toEqual({ r: 0, g: 100, b: 255, a: 0 });
  });
  it('Then formatRgba rounds channels and prints alpha with the shared precision', () => {
    expect(formatRgba({ r: 127.5, g: 0.4, b: 255, a: 0.511734 })).toBe('rgba(128, 0, 255, 0.51173)');
  });
});
