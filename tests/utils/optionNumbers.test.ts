import { describe, expect, it } from '@jest/globals';
import { nonNegative, positive } from '../../src/utils/optionNumbers.js';

describe('Given the shared option normalizers', () => {
  describe('When positive receives a value', () => {
    it('Then it keeps finite numbers above zero', () => {
      expect(positive(0.001, 5)).toBe(0.001);
      expect(positive(1e300, 5)).toBe(1e300);
    });
    it('Then it falls back for zero, negatives, undefined, NaN and the infinities', () => {
      for (const value of [0, -0, -1, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(positive(value, 5)).toBe(5);
      }
    });
  });

  describe('When nonNegative receives a value', () => {
    it('Then it keeps zero and finite numbers above it', () => {
      expect(nonNegative(0, 5)).toBe(0);
      expect(nonNegative(2.5, 5)).toBe(2.5);
    });
    it('Then it falls back for negatives, undefined, NaN and the infinities', () => {
      for (const value of [-0.001, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        expect(nonNegative(value, 5)).toBe(5);
      }
    });
  });
});
