import type { DOMAnimationTarget } from './animationTypes.js';

export function resolveTargets(targets: DOMAnimationTarget): Element[] {
  if (typeof targets === 'string') {
    if (typeof document === 'undefined') {
      throw new Error('animate() cannot resolve a CSS selector without a document. Pass an Element or an iterable of Elements for non-browser environments.');
    }
    const matches = Array.from(document.querySelectorAll(targets));
    if (matches.length === 0) throw new RangeError(`animate() selector did not match any elements: ${targets}`);
    return matches;
  }

  if (isElementLike(targets)) return [targets];
  if (isIterableElementCollection(targets)) {
    const elements = Array.from(targets);
    if (elements.length === 0) throw new RangeError('animate() requires at least one target element.');
    if (elements.some((element) => !isElementLike(element))) {
      throw new TypeError('Every item passed to animate() must be a DOM Element.');
    }
    return Array.from(new Set(elements));
  }
  throw new TypeError('animate() targets must be a CSS selector, an Element, or an iterable of Elements.');
}

function isElementLike(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && 'nodeType' in value && (value as { nodeType?: unknown }).nodeType === 1;
}

function isIterableElementCollection(value: unknown): value is Iterable<Element> {
  return typeof value === 'object'
    && value !== null
    && Symbol.iterator in value
    && typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function';
}
