import { Observable, Subscription } from 'rxjs';
import type { CssStyleMap } from './animationTypes.js';

interface OriginalStyle {
  readonly value: string;
  readonly priority: string;
}

/**
 * Binds a stream of CSS property maps to an element. Properties omitted from a later map are restored
 * to their initial inline declarations; unsubscribe restores every declaration touched by this binding.
 */
export function bindStyle(
  target: HTMLElement | SVGElement,
  styles$: Observable<CssStyleMap>,
): Subscription {
  const original = new Map<string, OriginalStyle>();
  let activeKeys = new Set<string>();
  const subscription = new Subscription();
  const upstream = styles$.subscribe((styles) => {
    const nextKeys = new Set(Object.keys(styles));

    for (const key of activeKeys) {
      if (!nextKeys.has(key)) restoreProperty(target, key, original.get(key));
    }

    for (const [key, value] of Object.entries(styles)) {
      if (!original.has(key)) {
        original.set(key, {
          value: target.style.getPropertyValue(key),
          priority: target.style.getPropertyPriority(key),
        });
      }

      if (value === null || value === undefined) {
        restoreProperty(target, key, original.get(key));
      } else {
        target.style.setProperty(key, value);
      }
    }

    activeKeys = nextKeys;
  });

  subscription.add(upstream);
  subscription.add(() => {
    for (const [key, value] of original) restoreProperty(target, key, value);
    original.clear();
    activeKeys.clear();
  });

  return subscription;
}


function restoreProperty(target: HTMLElement | SVGElement, key: string, value: OriginalStyle | undefined): void {
  if (!value || value.value === '') target.style.removeProperty(key);
  else target.style.setProperty(key, value.value, value.priority);
}
