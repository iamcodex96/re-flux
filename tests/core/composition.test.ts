import { describe, expect, it } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { parallel, sequence, staggered } from '../../src/core/composition.js';

describe('Given Timeline composition helpers', () => {
  describe('When composition items run sequentially', () => {
    describe('And When they are composed', () => {
      it('Then the resulting Timeline preserves their order', () => {
        const first = new Animation({ duration: 100 });
        const second = new Animation({ duration: 50 });
        const third = new Animation({ duration: 25 });
        const timeline = sequence([first, second, third]);

        expect(timeline.duration).toBe(175);
        expect(timeline.segments.map(({ startTime, endTime }) => [startTime, endTime]))
          .toEqual([[0, 100], [100, 150], [150, 175]]);
      });
    });
  });

  describe('When composition items run in parallel', () => {
    describe('And When they are composed', () => {
      it('Then every item starts at zero', () => {
        const items = [new Animation({ duration: 100 }), new Animation({ duration: 40 }), new Animation({ duration: 70 })];
        const timeline = parallel(items);

        expect(timeline.duration).toBe(100);
        expect(timeline.segments.map(({ startTime }) => startTime)).toEqual([0, 0, 0]);
      });
    });
  });

  describe('When items are staggered around an origin', () => {
    describe('And When a Timeline is composed', () => {
      it('Then each item is placed relative to that origin', () => {
        const items = Array.from({ length: 5 }, () => new Animation({ duration: 100 }));
        const timeline = staggered(items, 20, { from: 'center' });

        expect(timeline.segments.map(({ startTime }) => startTime)).toEqual([40, 20, 0, 20, 40]);
        expect(timeline.duration).toBe(140);
      });
    });
  });
});
