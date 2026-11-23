import { describe, expect, it } from '@jest/globals';
import type { EasingFunction, EasingName, EasingOption } from '../../src/index.js';
import { Easings } from '../../src/index.js';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <_T extends true>(): void => undefined;

// API-001: the union must not collapse to plain `string`, or editors lose autocomplete for known names.
assertType<Equal<EasingOption, string> extends false ? true : false>();
assertType<Equal<EasingOption, EasingFunction | EasingName | string> extends false ? true : false>();

// Every known name and every function is assignable; unknown strings remain allowed (warn-and-fallback policy).
const known: EasingOption = 'easeInOutElastic';
const custom: EasingOption = (progress: number) => progress;
const arbitrary: EasingOption = 'anything-else';
const names: readonly EasingName[] = ['linear', 'easeInOutElastic'];

describe('Given the EasingOption type', () => {
  describe('When the known easing names are compared with the runtime table', () => {
    it('Then every EasingName is a key of Easings and the type is not plain string', () => {
      const typeNames: Record<EasingName, true> = {
        linear: true,
        easeInSine: true,
        easeOutSine: true,
        easeInOutSine: true,
        easeInQuad: true,
        easeOutQuad: true,
        easeInOutQuad: true,
        easeInCubic: true,
        easeOutCubic: true,
        easeInOutCubic: true,
        easeInQuart: true,
        easeOutQuart: true,
        easeInOutQuart: true,
        easeInQuint: true,
        easeOutQuint: true,
        easeInOutQuint: true,
        easeInCirc: true,
        easeOutCirc: true,
        easeInOutCirc: true,
        easeInExpo: true,
        easeOutExpo: true,
        easeInOutExpo: true,
        easeInBack: true,
        easeOutBack: true,
        easeInOutBack: true,
        easeInElastic: true,
        easeOutElastic: true,
        easeInOutElastic: true,
        easeInBounce: true,
        easeOutBounce: true,
        easeInOutBounce: true,
      };
      expect(Object.keys(typeNames).sort()).toEqual(Object.keys(Easings).sort());
      expect([known, custom, arbitrary, names].length).toBe(4);
    });
  });
});
