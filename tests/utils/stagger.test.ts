import { describe, expect, it } from '@jest/globals';
import { stagger } from '../../src/utils/stagger.js';

describe('stagger()', () => {
  it('creates a first-to-last cascade by default', () => {
    const delay = stagger(40);
    expect([0, 1, 2, 3].map((index) => delay(index, null, 4))).toEqual([0, 40, 80, 120]);
  });

  it('supports last and center origins', () => {
    const reverse = stagger(30, { from: 'last' });
    expect([0, 1, 2].map((index) => reverse(index, null, 3))).toEqual([60, 30, 0]);

    const center = stagger(20, { from: 'center' });
    expect([0, 1, 2, 3, 4].map((index) => center(index, null, 5))).toEqual([40, 20, 0, 20, 40]);
  });

  it('supports a base delay and an eased distribution', () => {
    const delay = stagger(100, { start: 25, easing: 'easeOutQuad' });
    expect(delay(0, null, 3)).toBe(25);
    expect(delay(1, null, 3)).toBe(175);
    expect(delay(2, null, 3)).toBe(225);
  });

  it('validates step size and target indexes', () => {
    expect(() => stagger(-1)).toThrow(RangeError);
    expect(() => stagger(20)(0, null, 0)).toThrow(RangeError);
    expect(() => stagger(20)(3, null, 3)).toThrow(RangeError);
    expect(() => stagger(20, { from: 5 })(0, null, 3)).toThrow(RangeError);
  });
});
