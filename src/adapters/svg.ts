import { Subscription, map, type Observable } from 'rxjs';

/** Attribute snapshot for the original SVG element state. */
export type SvgAttributeMap = Readonly<Record<string, string | number | boolean | null | undefined>>;

interface OriginalAttribute {
  readonly existed: boolean;
  readonly value: string | null;
}

/**
 * Binds complete attribute maps to an SVG element. False/null values remove an attribute, true creates
 * an empty boolean-style attribute, omitted keys restore their original state, and unsubscribe restores
 * every attribute touched by this binding.
 */
export function bindSvgAttributes(
  target: SVGElement,
  attributes$: Observable<SvgAttributeMap>,
): Subscription {
  const original = new Map<string, OriginalAttribute>();
  let activeKeys = new Set<string>();
  const subscription = new Subscription();
  const upstream = attributes$.subscribe((attributes) => {
    const nextKeys = new Set(Object.keys(attributes));

    for (const key of activeKeys) {
      if (!nextKeys.has(key)) restoreAttribute(target, key, original.get(key));
    }

    for (const [key, value] of Object.entries(attributes)) {
      if (!original.has(key)) {
        original.set(key, {
          existed: target.hasAttribute(key),
          value: target.getAttribute(key),
        });
      }

      if (value === null || value === undefined || value === false) {
        target.removeAttribute(key);
      } else {
        target.setAttribute(key, value === true ? '' : String(value));
      }
    }

    activeKeys = nextKeys;
  });

  subscription.add(upstream);
  subscription.add(() => {
    for (const [key, value] of original) restoreAttribute(target, key, value);
    original.clear();
    activeKeys.clear();
  });

  return subscription;
}

function restoreAttribute(target: SVGElement, key: string, value: OriginalAttribute | undefined): void {
  if (value?.existed && value.value !== null) target.setAttribute(key, value.value);
  else target.removeAttribute(key);
}

/** Options for animating an SVG geometry element's stroke reveal. */
export interface SvgPathDrawingOptions {
  /** Additional dash offset in SVG user units. Defaults to zero. */
  readonly offset?: number;
  /** Clamp progress to [0, 1]. Defaults to true. */
  readonly clampProgress?: boolean;
}

/**
 * Reveal an SVG path by animating its stroke dash offset. Original dash attributes are restored
 * when the subscription is disposed. The target must implement SVGGeometryElement.getTotalLength().
 */
export function bindSvgPathDrawing(
  target: SVGGeometryElement,
  progress$: Observable<number>,
  options: SvgPathDrawingOptions = {},
): Subscription {
  if (typeof target.getTotalLength !== 'function') throw new TypeError('SVG path drawing requires getTotalLength().');
  const length = target.getTotalLength();
  if (!Number.isFinite(length) || length < 0) throw new RangeError('SVG geometry length must be finite and non-negative.');
  const previous = {
    dasharray: target.getAttribute('stroke-dasharray'),
    dashoffset: target.getAttribute('stroke-dashoffset'),
    hadDasharray: target.hasAttribute('stroke-dasharray'),
    hadDashoffset: target.hasAttribute('stroke-dashoffset'),
  };
  const offset = options.offset ?? 0;
  if (!Number.isFinite(offset)) throw new RangeError('SVG path drawing offset must be finite.');
  target.setAttribute('stroke-dasharray', String(length));
  const subscription = new Subscription();
  subscription.add(progress$.subscribe((progress) => {
    const safeProgress = Number.isFinite(progress) ? progress : 0;
    const normalized = options.clampProgress === false ? safeProgress : Math.min(1, Math.max(0, safeProgress));
    target.setAttribute('stroke-dashoffset', String(length * (1 - normalized) + offset));
  }));
  subscription.add(() => {
    if (previous.hadDasharray && previous.dasharray !== null) target.setAttribute('stroke-dasharray', previous.dasharray);
    else target.removeAttribute('stroke-dasharray');
    if (previous.hadDashoffset && previous.dashoffset !== null) target.setAttribute('stroke-dashoffset', previous.dashoffset);
    else target.removeAttribute('stroke-dashoffset');
  });
  return subscription;
}

export { bindSvgPathMorph, createSvgPathInterpolator, normalizeSvgPathPair } from './svg/pathMorph.js';
export type { NormalizedSvgPathPair, SvgPathNormalizationOptions } from './svg/pathMorph.js';

/** A sample on an SVG geometry path; angle is in degrees in the geometry's user coordinate space. */
export interface SvgMotionPathSample {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly progress: number;
}

export interface SvgMotionPathOptions {
  /** Clamp source progress into [0, 1]. Defaults to true. */
  readonly clampProgress?: boolean;
  /** Distance in SVG user units used to estimate tangent direction. Defaults to 1. */
  readonly lookAhead?: number;
}

/**
 * Convert normalized progress into position and tangent angle along an SVG path/geometry.
 * The output is renderer-agnostic and can drive an SVG element, CSS transform, Canvas sprite or 3D object.
 */
export function followSvgPath$(
  path: SVGGeometryElement,
  progress$: Observable<number>,
  options: SvgMotionPathOptions = {},
): Observable<SvgMotionPathSample> {
  if (typeof path.getTotalLength !== 'function' || typeof path.getPointAtLength !== 'function') {
    throw new TypeError('followSvgPath$ requires SVG geometry with getTotalLength() and getPointAtLength().');
  }
  const length = path.getTotalLength();
  if (!Number.isFinite(length) || length < 0) throw new RangeError('SVG geometry length must be finite and non-negative.');
  const lookAhead = options.lookAhead ?? 1;
  if (!Number.isFinite(lookAhead) || lookAhead <= 0) throw new RangeError('SVG motion-path lookAhead must be finite and greater than zero.');
  const shouldClamp = options.clampProgress ?? true;

  return progress$.pipe(map((inputProgress): SvgMotionPathSample => {
    const progress = Number.isFinite(inputProgress) ? (shouldClamp ? Math.max(0, Math.min(1, inputProgress)) : inputProgress) : 0;
    const distance = Math.max(0, Math.min(length, progress * length));
    const point = path.getPointAtLength(distance);
    const before = path.getPointAtLength(Math.max(0, distance - lookAhead));
    const after = path.getPointAtLength(Math.min(length, distance + lookAhead));
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const angle = Math.hypot(dx, dy) > 0 ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
    return { x: point.x, y: point.y, angle, progress };
  }));
}
