import { describe, expect, it } from '@jest/globals';
import {
  addVectors,
  distanceBetween,
  dotProduct,
  lerpVector,
  limitVector,
  normalizeVector,
  scaleVector,
  subtractVectors,
  vectorFromAngle,
  vectorMagnitude,
  vectorMagnitudeSquared,
} from '../../src/utils/vector2.js';

describe('Given two-dimensional vector utilities', () => {
  describe('When vectors are combined or scaled', () => {
    it('Then it performs component-wise arithmetic', () => {
      expect(addVectors({ x: 2, y: 3 }, { x: 4, y: -1 })).toEqual({ x: 6, y: 2 });
      expect(subtractVectors({ x: 2, y: 3 }, { x: 4, y: -1 })).toEqual({ x: -2, y: 4 });
      expect(scaleVector({ x: 2, y: -3 }, 2)).toEqual({ x: 4, y: -6 });
      expect(lerpVector({ x: 0, y: 4 }, { x: 10, y: 8 }, 0.5)).toEqual({ x: 5, y: 6 });
      expect(lerpVector({ x: 0, y: 0 }, { x: 10, y: 10 }, 2)).toEqual({ x: 20, y: 20 });
    });
  });

  describe('When magnitude and direction are requested', () => {
    it('Then it returns stable magnitude and normalization results, including zero', () => {
      expect(vectorMagnitudeSquared({ x: 3, y: 4 })).toBe(25);
      expect(vectorMagnitude({ x: 3, y: 4 })).toBe(5);
      expect(normalizeVector({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
      expect(normalizeVector({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
      expect(vectorFromAngle(0, 4).x).toBe(4);
      expect(vectorFromAngle(Math.PI / 2).y).toBeCloseTo(1);
    });
  });

  describe('When distance, projection and limits are calculated', () => {
    it('Then it returns Euclidean distance, dot product and bounded magnitude', () => {
      expect(distanceBetween({ x: 1, y: 1 }, { x: 4, y: 5 })).toBe(5);
      expect(dotProduct({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
      expect(limitVector({ x: 6, y: 8 }, 5)).toEqual({ x: 3, y: 4 });
      expect(limitVector({ x: 2, y: 1 }, 5)).toEqual({ x: 2, y: 1 });
      expect(limitVector({ x: 2, y: 1 }, 0)).toEqual({ x: 0, y: 0 });
    });

    it('Then it rejects invalid magnitude limits and non-finite polar inputs', () => {
      expect(() => limitVector({ x: 1, y: 2 }, -1)).toThrow(RangeError);
      expect(() => limitVector({ x: 1, y: 2 }, Number.POSITIVE_INFINITY)).toThrow(RangeError);
      expect(() => vectorFromAngle(Number.NaN)).toThrow(RangeError);
    });
  });
});
