import { Observable, Subscription } from 'rxjs';
import { frameCoordinator } from '../../core/FrameCoordinator.js';
import { resolveEasing } from '../../utils/easings.js';
import { Timeline } from '../../core/Timeline.js';
import type { EasingOption } from '../../types.js';

/** Browser scroll progress source for an element, from entering the scroll root to leaving it. */
export interface ScrollProgressOptions {
  /** Scroll root. Defaults to the browser viewport. */
  readonly root?: Window | HTMLElement;
}

/**
 * Emits normalized element visibility progress: 0 when its top reaches the root's bottom and 1
 * when its bottom reaches the root's top. Listeners are passive and are removed on unsubscribe.
 */
export function scrollProgress$(target: Element, options: ScrollProgressOptions = {}): Observable<number> {
  return new Observable<number>((subscriber) => {
    if (typeof window === 'undefined') {
      subscriber.error(new Error('scrollProgress$ requires a browser environment.'));
      return undefined;
    }
    const root = options.root ?? window;
    const update = (): void => {
      const targetRect = target.getBoundingClientRect();
      let rootHeight: number;
      let top: number;
      if (root === window) {
        rootHeight = window.innerHeight || document.documentElement.clientHeight;
        top = targetRect.top;
      } else {
        const elementRoot = root as HTMLElement;
        const rootRect = elementRoot.getBoundingClientRect();
        rootHeight = elementRoot.clientHeight;
        top = targetRect.top - rootRect.top - elementRoot.clientTop;
      }
      const denominator = rootHeight + targetRect.height;
      const progress = denominator > 0 ? (rootHeight - top) / denominator : (top <= 0 ? 1 : 0);
      subscriber.next(Math.min(1, Math.max(0, progress)));
    };
    const scrollTarget: Window | HTMLElement = root;
    scrollTarget.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
    return () => {
      scrollTarget.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });
}


/** Options for binding a timeline's playhead to normalized element scroll progress. */
export interface ScrollTimelineOptions extends ScrollProgressOptions {
  /** Scroll-progress value at which timeline progress becomes zero. Defaults to 0. */
  readonly start?: number;
  /** Scroll-progress value at which timeline progress becomes one. Defaults to 1. */
  readonly end?: number;
  /** Optional easing applied to the normalized scrub value. Defaults to linear. */
  readonly easing?: EasingOption;
}

/**
 * Scrub a Timeline from scroll position. Scroll/resize bursts are coalesced through the shared
 * FrameCoordinator write phase, and unsubscribing removes listeners and any pending frame task.
 */
export function bindScrollTimeline(target: Element, timeline: Timeline, options: ScrollTimelineOptions = {}): Subscription {
  const start = options.start ?? 0;
  const end = options.end ?? 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new RangeError('bindScrollTimeline() requires finite progress bounds with end greater than start.');
  }
  const easing = resolveEasing(options.easing ?? 'linear');
  const root = options.root;
  const source = scrollProgress$(target, root === undefined ? {} : { root });
  const binding = new Subscription();
  let pending: Subscription | null = null;
  let latestProgress = 0;

  const upstream = source.subscribe({
    next: (progress) => {
      latestProgress = Math.max(0, Math.min(1, (progress - start) / (end - start)));
      if (pending && !pending.closed) return;
      pending = frameCoordinator.scheduleWrite(() => {
        pending = null;
        if (binding.closed) return;
        timeline.seekProgress(Math.max(0, Math.min(1, easing(latestProgress))));
      });
    },
    error: (error: unknown) => {
      binding.unsubscribe();
      throw error;
    },
  });
  binding.add(upstream);
  binding.add(() => {
    pending?.unsubscribe();
    pending = null;
  });
  return binding;
}
