import type { AnimatableItem, TimelineOptions } from '../types.js';
import { Timeline } from './Timeline.js';
import { stagger, type StaggerOptions } from '../utils/stagger.js';

/** Builds a sequential Timeline from any iterable of AnimatableItems. */
export function sequence(items: Iterable<AnimatableItem>, options: TimelineOptions = {}): Timeline {
  const timeline = new Timeline(options);
  for (const item of items) timeline.add(item);
  return timeline;
}

/** Builds a parallel Timeline; every child starts at absolute time zero. */
export function parallel(items: Iterable<AnimatableItem>, options: TimelineOptions = {}): Timeline {
  const timeline = new Timeline(options);
  for (const item of items) timeline.add(item, 0);
  return timeline;
}

/**
 * Builds a Timeline whose children start with staggered offsets.
 * Pass a number for a first-to-last cascade, or options to choose an origin such as `center`.
 */
export function staggered(
  items: Iterable<AnimatableItem>,
  each: number,
  staggerOptions: StaggerOptions = {},
  timelineOptions: TimelineOptions = {},
): Timeline {
  const children = Array.from(items);
  const getDelay = stagger(each, staggerOptions);
  const timeline = new Timeline(timelineOptions);
  children.forEach((item, index) => {
    const delay = getDelay(index, item, children.length);
    timeline.add(item, Math.max(0, delay));
  });
  return timeline;
}
