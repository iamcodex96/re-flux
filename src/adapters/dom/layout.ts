import { DOMAnimation, animate, resolveTargets } from './animation.js';
import type { DOMAnimateOptions, DOMAnimationTarget } from './animation.js';

/** Options for a FLIP-style layout transition. */
export type FlipOptions = Omit<DOMAnimateOptions, 'properties'>;

class FlipAnimation extends DOMAnimation {
  private readonly children: DOMAnimation[] = [];

  registerChild(child: DOMAnimation): void {
    this.children.push(child);
  }

  override dispose(): void {
    if (this.disposedByFlip) return;
    this.disposedByFlip = true;
    for (const child of this.children) child.dispose();
    super.dispose();
  }

  private disposedByFlip = false;
}

/**
 * Animate layout changes using First-Last-Invert-Play. The callback performs the DOM change synchronously;
 * the returned timeline animates each selected element from its previous geometry to the new geometry.
 * Transform origins and inline transforms are restored by calling dispose().
 */
export function flip(targets: DOMAnimationTarget, mutate: () => void, options: FlipOptions = {}): DOMAnimation {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('flip() requires a browser environment.');
  }
  if (typeof mutate !== 'function') throw new TypeError('flip() requires a mutation callback.');
  const elements = resolveTargets(targets);
  const firstRects = elements.map((element) => element.getBoundingClientRect());
  mutate();

  const {
    stagger = 0,
    duration = 400,
    delay,
    easing,
    repeat,
    yoyo,
    motion,
    onStart,
    onUpdate,
    onComplete,
    onPause,
    onResume,
    onStop,
  } = options;
  const scene = new FlipAnimation({
    ...(motion === undefined ? {} : { motion }),
    ...(onStart === undefined ? {} : { onStart }),
    ...(onUpdate === undefined ? {} : { onUpdate }),
    ...(onComplete === undefined ? {} : { onComplete }),
    ...(onPause === undefined ? {} : { onPause }),
    ...(onResume === undefined ? {} : { onResume }),
    ...(onStop === undefined ? {} : { onStop }),
  });
  // Read phase: every layout and style read happens before any animation writes an inline style, so the browser
  // lays out once for the whole set instead of once per element. When a target contains another target the old,
  // interleaved order is kept: a descendant must be measured after its ancestor's inverted transform is applied, or the
  // ancestor's displacement would be counted twice.
  const measureLast = (element: Element) => ({
    last: element.getBoundingClientRect(),
    computedTransform: window.getComputedStyle(element).transform,
  });
  const measured = hasNestedTargets(elements) ? null : elements.map(measureLast);
  elements.forEach((element, index) => {
    const first = firstRects[index]!;
    const { last, computedTransform } = measured === null ? measureLast(element) : measured[index]!;
    const dx = first.left - last.left;
    const dy = first.top - last.top;
    const sx = last.width > 0 ? first.width / last.width : 1;
    const sy = last.height > 0 ? first.height / last.height : 1;
    const baseTransform = computedTransform && computedTransform !== 'none' ? ` ${computedTransform}` : '';
    const fromTransform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})${baseTransform}`;
    const toTransform = `translate(0px, 0px) scale(1, 1)${baseTransform}`;
    const child = animate(element, {
      duration,
      ...(delay === undefined ? {} : { delay }),
      ...(easing === undefined ? {} : { easing }),
      ...(repeat === undefined ? {} : { repeat }),
      ...(yoyo === undefined ? {} : { yoyo }),
      properties: {
        transform: { values: [fromTransform, toTransform] },
        'transform-origin': { values: ['0px 0px', '0px 0px'] },
      },
    });
    const childOffset = typeof stagger === 'function' ? stagger(index, element, elements.length) : index * stagger;
    if (!Number.isFinite(childOffset)) {
      child.dispose();
      scene.dispose();
      throw new RangeError(`FLIP stagger must be finite for target ${index}.`);
    }
    scene.registerChild(child);
    scene.add(child, childOffset);
  });
  return scene;
}

function hasNestedTargets(elements: readonly Element[]): boolean {
  const targets = new Set<Element>(elements);
  return elements.some((element) => {
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (targets.has(ancestor)) return true;
    }
    return false;
  });
}
