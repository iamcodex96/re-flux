import { describe, expect, it } from '@jest/globals';
import { interpolate, resolveInterpolator } from '../../src/values/interpolate.js';

describe('value interpolation', () => {
  it('interpolates numbers and compatible CSS-like numeric templates', () => {
    expect(interpolate(0, 10, 0.25)).toBe(2.5);
    expect(interpolate('translate(0px, 10px)', 'translate(100px, 30px)', 0.5)).toBe('translate(50px, 20px)');
  });

  it('interpolates hex and rgba colors', () => {
    expect(interpolate('#0000ff', '#ff0000', 0.5)).toBe('rgba(128, 0, 128, 1)');
    expect(interpolate('rgba(0, 0, 0, 0)', 'rgba(100, 200, 50, 1)', 0.5)).toBe('rgba(50, 100, 25, 0.5)');
  });

  it('recursively interpolates arrays and plain objects', () => {
    expect(interpolate([0, 10], [10, 30], 0.5)).toEqual([5, 20]);
    expect(interpolate({ position: { x: 0, y: 10 }, opacity: 0 }, { position: { x: 20, y: 30 }, opacity: 1 }, 0.5))
      .toEqual({ position: { x: 10, y: 20 }, opacity: 0.5 });
  });

  it('rejects discrete strings and mismatched structures unless a custom interpolator is provided', () => {
    expect(() => resolveInterpolator('closed', 'open')).toThrow('requires an interpolate function');
    expect(() => interpolate('translateX(0px)', 'scale(1)', 0.5)).toThrow('Values are incompatible');
    expect(() => interpolate('closed', 'open', 0.5)).toThrow('Values are incompatible');
  });
});
