import type { EasingFunction, EasingOption } from '../types.js';

const linear: EasingFunction = (t) => t;
const easeInSine: EasingFunction = (t) => 1 - Math.cos((t * Math.PI) / 2);
const easeOutSine: EasingFunction = (t) => Math.sin((t * Math.PI) / 2);
const easeInOutSine: EasingFunction = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeInQuad: EasingFunction = (t) => t * t;
const easeOutQuad: EasingFunction = (t) => t * (2 - t);
const easeInOutQuad: EasingFunction = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeInCubic: EasingFunction = (t) => t * t * t;
const easeOutCubic: EasingFunction = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic: EasingFunction = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeInQuart: EasingFunction = (t) => t * t * t * t;
const easeOutQuart: EasingFunction = (t) => 1 - Math.pow(1 - t, 4);
const easeInOutQuart: EasingFunction = (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
const easeInQuint: EasingFunction = (t) => t * t * t * t * t;
const easeOutQuint: EasingFunction = (t) => 1 - Math.pow(1 - t, 5);
const easeInOutQuint: EasingFunction = (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
const easeInCirc: EasingFunction = (t) => 1 - Math.sqrt(1 - t * t);
const easeOutCirc: EasingFunction = (t) => Math.sqrt(1 - Math.pow(t - 1, 2));
const easeInOutCirc: EasingFunction = (t) => t < 0.5
  ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
  : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
const easeInExpo: EasingFunction = (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10);
const easeOutExpo: EasingFunction = (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
const easeInOutExpo: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t;
  return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
};
const easeInBack: EasingFunction = (t) => {
  const c1 = 1.70158;
  return (c1 + 1) * t * t * t - c1 * t * t;
};
const easeOutBack: EasingFunction = (t) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeInOutBack: EasingFunction = (t) => {
  const c2 = 1.70158 * 1.525;
  return t < 0.5
    ? Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
};
const easeInElastic: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
};
const easeOutElastic: EasingFunction = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};
const easeOutBounce: EasingFunction = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) { const shifted = t - 1.5 / d1; return n1 * shifted * shifted + 0.75; }
  if (t < 2.5 / d1) { const shifted = t - 2.25 / d1; return n1 * shifted * shifted + 0.9375; }
  const shifted = t - 2.625 / d1;
  return n1 * shifted * shifted + 0.984375;
};
const easeInBounce: EasingFunction = (t) => 1 - easeOutBounce(1 - t);
const easeInOutBounce: EasingFunction = (t) => t < 0.5
  ? (1 - easeOutBounce(1 - 2 * t)) / 2
  : (1 + easeOutBounce(2 * t - 1)) / 2;

export const Easings: Readonly<Record<string, EasingFunction>> = Object.freeze({
  linear,
  easeInSine, easeOutSine, easeInOutSine,
  easeInQuad, easeOutQuad, easeInOutQuad,
  easeInCubic, easeOutCubic, easeInOutCubic,
  easeInQuart, easeOutQuart, easeInOutQuart,
  easeInQuint, easeOutQuint, easeInOutQuint,
  easeInCirc, easeOutCirc, easeInOutCirc,
  easeInExpo, easeOutExpo, easeInOutExpo,
  easeInBack, easeOutBack, easeInOutBack,
  easeInElastic, easeOutElastic,
  easeInBounce, easeOutBounce, easeInOutBounce,
});

/** Resolve an easing function or name; unknown names fall back to linear. */
export function resolveEasing(easing?: EasingOption): EasingFunction {
  if (typeof easing === 'function') return easing;
  if (typeof easing === 'string' && Object.prototype.hasOwnProperty.call(Easings, easing)) return Easings[easing]!;
  return Easings.linear!;
}

/** Create a cubic-bezier easing by solving the x curve for the supplied normalized time. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction {
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
    throw new RangeError('Cubic-bezier x control points must be in [0, 1] and all values must be finite.');
  }
  const coordinate = (t: number, a: number, b: number): number => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
  const derivative = (t: number, a: number, b: number): number => 3 * (1 - t) * (1 - t) * a + 6 * (1 - t) * t * (b - a) + 3 * t * t * (1 - b);
  return (progress) => {
    if (progress <= 0 || progress >= 1) return progress;
    let t = progress;
    for (let i = 0; i < 8; i += 1) {
      const error = coordinate(t, x1, x2) - progress;
      const slope = derivative(t, x1, x2);
      if (Math.abs(error) < 1e-7 || Math.abs(slope) < 1e-7) break;
      t = Math.max(0, Math.min(1, t - error / slope));
    }
    let low = 0; let high = 1;
    for (let i = 0; i < 16; i += 1) {
      const x = coordinate(t, x1, x2);
      if (Math.abs(x - progress) < 1e-7) break;
      if (x < progress) low = t; else high = t;
      t = (low + high) / 2;
    }
    return coordinate(t, y1, y2);
  };
}

/** Create a discrete steps easing. `start` advances at the beginning of each step; `end` at its end. */
export function steps(count: number, position: 'start' | 'end' = 'end'): EasingFunction {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Step count must be a positive integer.');
  return (progress) => {
    if (progress <= 0) return position === 'start' ? 1 / count : 0;
    if (progress >= 1) return 1;
    return (position === 'start' ? Math.ceil(progress * count) : Math.floor(progress * count)) / count;
  };
}
