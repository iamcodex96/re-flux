import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { Tween } from '../../src/values/Tween.js';
import { Keyframes } from '../../src/values/Keyframes.js';
import { animate } from '../../src/adapters/dom/animation.js';
import { createElement } from '../helpers/fakeDom.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

/**
 * API-001 policy: an unknown easing name falls back to linear and logs exactly one warning per name,
 * at construction time. Each case uses its own name because the warning is de-duplicated per process.
 */
describe('Given an unknown easing name', () => {
  const cases: ReadonlyArray<readonly [string, string, () => { dispose?: () => void; stop?: () => void }]> = [
    ['Animation', 'policyTypoAnimation', () => new Animation({ duration: 100, easing: 'policyTypoAnimation' })],
    ['Tween', 'policyTypoTween', () => new Tween({ from: 0, to: 1, duration: 100, easing: 'policyTypoTween' })],
    ['Keyframes', 'policyTypoKeyframes', () => new Keyframes({ keyframes: [{ value: 0 }, { value: 1 }], duration: 100, easing: 'policyTypoKeyframes' })],
    ['Keyframes (per-keyframe easing)', 'policyTypoSegment', () => new Keyframes({ keyframes: [{ value: 0, easing: 'policyTypoSegment' }, { value: 1 }], duration: 100 })],
    ['animate()', 'policyTypoAnimate', () => animate(createElement({ opacity: '0' }), { duration: 100, properties: { opacity: { values: [0, 1] } }, easing: 'policyTypoAnimate' })],
  ];

  describe.each(cases)('When a %s is constructed with it', (_label, name, build) => {
    it('Then one warning naming the easing is logged at construction and none while it runs', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const subject = build();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain(`"${name}"`);

      const playable = subject as unknown as { play(): unknown };
      playable.play();
      raf.advance(0);
      raf.advance(50);
      raf.advance(100);
      expect(warn).toHaveBeenCalledTimes(1);

      subject.dispose?.();
      subject.stop?.();
    });
  });

  describe('When a Tween with the unknown name runs', () => {
    it('Then it behaves like linear', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const tween = new Tween({ from: 0, to: 100, duration: 100, easing: 'policyTypoLinearCheck' });
      tween.play();
      raf.advance(0);
      raf.advance(25);
      expect(tween.value$.value).toBe(25);
      tween.stop();
    });
  });
});
