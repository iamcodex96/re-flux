import { Observable, Subscription } from 'rxjs';
import type { CssStyleMap } from './animationTypes.js';

interface OriginalStyle {
  readonly value: string;
  readonly priority: string;
}

/** Per-property bookkeeping of one binding. Created (and the original inline declaration captured) on first emission. */
interface StyleState {
  readonly key: string;
  readonly original: OriginalStyle;
  /** Emission counter value of the last emission that carried this key. */
  seen: number;
}

/**
 * Binds a stream of CSS property maps to an element. Properties omitted from a later map are restored
 * to their initial inline declarations; unsubscribe restores every declaration touched by this binding.
 */
export function bindStyle(
  target: HTMLElement | SVGElement,
  styles$: Observable<CssStyleMap>,
): Subscription {
  // One state per key ever seen, in first-capture order (restore order on unsubscribe).
  const lookup = new Map<string, StyleState>();
  const states: StyleState[] = [];
  // States carried by the previous / the current emission, in emission key order. The two arrays are swapped and
  // reused (filled by index, never truncated, so their backing stores are kept), so tracking the active keys allocates
  // nothing per emission.
  let active: StyleState[] = [];
  let next: StyleState[] = [];
  let activeCount = 0;
  let nextCount = 0;
  let emission = 0;
  const subscription = new Subscription();
  const upstream = styles$.subscribe((styles) => {
    emission += 1;

    // Mark the keys of this emission first: omitted keys are restored (in previous-emission order) before writing.
    for (const key in styles) {
      if (!Object.hasOwn(styles, key)) continue;
      const state = lookup.get(key);
      if (state !== undefined) state.seen = emission;
    }
    for (let index = 0; index < activeCount; index += 1) {
      const state = active[index]!;
      if (state.seen !== emission) restoreProperty(target, state.key, state.original);
    }

    nextCount = 0;
    for (const key in styles) {
      if (!Object.hasOwn(styles, key)) continue;
      const value = styles[key];
      let state = lookup.get(key);
      if (state === undefined) {
        state = {
          key,
          original: { value: target.style.getPropertyValue(key), priority: target.style.getPropertyPriority(key) },
          seen: emission,
        };
        lookup.set(key, state);
        states.push(state);
      }
      state.seen = emission;
      next[nextCount] = state;
      nextCount += 1;

      if (value === null || value === undefined) restoreProperty(target, key, state.original);
      else target.style.setProperty(key, value);
    }

    const previous = active;
    active = next;
    next = previous;
    activeCount = nextCount;
  });

  subscription.add(upstream);
  subscription.add(() => {
    for (let index = 0; index < states.length; index += 1) {
      const state = states[index]!;
      restoreProperty(target, state.key, state.original);
    }
    states.length = 0;
    active.length = 0;
    next.length = 0;
    activeCount = 0;
    nextCount = 0;
    lookup.clear();
  });

  return subscription;
}

/**
 * @internal Single-property variant of {@link bindStyle} used by `animate()`: one fixed property and a stream of plain
 * values, so no per-emission style map, key set or entry arrays are needed. Same semantics as `bindStyle` for that one
 * property: the original inline declaration is captured on the first emission, every emission writes, and
 * unsubscribing restores the original. Not exported from the package entry points.
 */
export function bindStyleProperty(
  target: HTMLElement | SVGElement,
  property: string,
  value$: Observable<string>,
): Subscription {
  let original: OriginalStyle | undefined;
  const subscription = new Subscription();
  subscription.add(value$.subscribe((value) => {
    original ??= { value: target.style.getPropertyValue(property), priority: target.style.getPropertyPriority(property) };
    target.style.setProperty(property, value);
  }));
  subscription.add(() => {
    if (original !== undefined) restoreProperty(target, property, original);
    original = undefined;
  });
  return subscription;
}

function restoreProperty(target: HTMLElement | SVGElement, key: string, value: OriginalStyle | undefined): void {
  if (!value || value.value === '') target.style.removeProperty(key);
  else target.style.setProperty(key, value.value, value.priority);
}
