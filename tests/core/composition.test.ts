import { describe, expect, it } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { parallel, sequence, staggered } from '../../src/core/composition.js';

describe('Timeline composition helpers', () => {
  it('sequences items in order', () => {
    const first = new Animation({ duration: 100 });
    const second = new Animation({ duration: 50 });
    const third = new Animation({ duration: 25 });
    const timeline = sequence([first, second, third]);

    expect(timeline.duration).toBe(175);
    expect(timeline.segments.map(({ startTime, endTime }) => [startTime, endTime]))
      .toEqual([[0, 100], [100, 150], [150, 175]]);
  });

  it('starts items in parallel at zero', () => {
    const items = [new Animation({ duration: 100 }), new Animation({ duration: 40 }), new Animation({ duration: 70 })];
    const timeline = parallel(items);

    expect(timeline.duration).toBe(100);
    expect(timeline.segments.map(({ startTime }) => startTime)).toEqual([0, 0, 0]);
  });

  it('builds an origin-aware staggered Timeline', () => {
    const items = Array.from({ length: 5 }, () => new Animation({ duration: 100 }));
    const timeline = staggered(items, 20, { from: 'center' });

    expect(timeline.segments.map(({ startTime }) => startTime)).toEqual([40, 20, 0, 20, 40]);
    expect(timeline.duration).toBe(140);
  });
});
