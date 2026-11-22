import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { Timeline } from '../../src/core/Timeline.js';
import type { AnimatableItem } from '../../src/types/animation.js';
import { Tween } from '../../src/values/Tween.js';
import { LegacyTimeline } from '../helpers/legacy/LegacyTimeline.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given the segments snapshot of a Timeline', () => {
  describe('When it is read repeatedly without a structural change', () => {
    it('Then the same frozen array instance is returned', () => {
      const timeline = new Timeline().add(new Animation({ duration: 10 })).add(new Animation({ duration: 20 }), 5);
      const first = timeline.segments;

      expect(timeline.segments).toBe(first);
      expect(Object.isFrozen(first)).toBe(true);
      expect(Object.isFrozen(first[0])).toBe(true);
      expect(first.map((segment) => [segment.startTime, segment.endTime, segment.duration])).toEqual([[0, 10, 10], [5, 25, 20]]);
      timeline.seek(7);
      expect(timeline.segments).toBe(first);
    });

    it('Then a new snapshot appears after add() and the previous one is left untouched', () => {
      const timeline = new Timeline().add(new Animation({ duration: 10 }));
      const before = timeline.segments;
      timeline.add(new Animation({ duration: 10 }));

      expect(timeline.segments).not.toBe(before);
      expect(before).toHaveLength(1);
      expect(timeline.segments).toHaveLength(2);
    });

    it('Then call() markers and an empty timeline have snapshots too', () => {
      const timeline = new Timeline();
      expect(timeline.segments).toEqual([]);
      timeline.call(() => undefined, 5);
      expect(timeline.segments).toHaveLength(1);
      expect(timeline.segments[0]).toMatchObject({ startTime: 5, endTime: 5, duration: 0 });
    });
  });
});

describe('Given a Timeline of sequential built-in children', () => {
  function build(): { timeline: Timeline; first: Animation; second: Animation; third: Tween<number> } {
    const first = new Animation({ duration: 100 });
    const second = new Animation({ duration: 100 });
    const third = new Tween({ from: 0, to: 10, duration: 100 });
    const timeline = new Timeline().add(first).add(second).add(third);
    return { timeline, first, second, third };
  }

  describe('When the playhead moves forward past a child', () => {
    it('Then the finished child is not seeked again, the running ones are', () => {
      const { timeline, first, second } = build();
      const firstSeek = jest.spyOn(first, 'seekLocal');
      const secondSeek = jest.spyOn(second, 'seekLocal');

      timeline.seek(50);
      expect(firstSeek).toHaveBeenCalledTimes(1);
      timeline.seek(150);
      expect(firstSeek).toHaveBeenCalledTimes(2);
      expect(first.state$.value).toBe('completed');
      timeline.seek(160);
      timeline.seek(170);
      timeline.seek(250);

      // 50, 150 (finishes it), then settled; the second one is visited until it finishes at 250.
      expect(firstSeek).toHaveBeenCalledTimes(2);
      expect(secondSeek).toHaveBeenCalledTimes(4);
      expect(first.progress$.value).toBe(1);
      expect(second.progress$.value).toBe(1);
    });
  });

  describe('When the playhead moves back into a finished child', () => {
    it('Then the child follows the playhead again, down to its reset', () => {
      const { timeline, first, second, third } = build();
      timeline.seek(250);
      expect([first.progress$.value, second.progress$.value, third.progress$.value]).toEqual([1, 1, 0.5]);

      timeline.seek(120);
      expect([first.progress$.value, second.progress$.value, third.value$.value]).toEqual([1, 0.2, 0]);
      timeline.seek(50);
      expect([first.progress$.value, second.progress$.value]).toEqual([0.5, 0]);
      timeline.seek(300);
      expect([first.progress$.value, second.progress$.value, third.progress$.value]).toEqual([1, 1, 1]);
      timeline.seek(20);
      expect([first.progress$.value, second.progress$.value, third.progress$.value]).toEqual([0.2, 0, 0]);
    });

    it('Then a child that finished exactly at the playhead is woken only when the playhead moves before its end', () => {
      const { timeline, first } = build();
      const seek = jest.spyOn(first, 'seekLocal');
      timeline.seek(100);
      timeline.seek(100);
      timeline.seek(150);
      expect(seek).toHaveBeenCalledTimes(1);
      timeline.seek(99.5);
      expect(seek).toHaveBeenCalledTimes(2);
      expect(first.progress$.value).toBeCloseTo(0.995);
    });
  });

  describe('When the timeline is stopped and played again', () => {
    it('Then every child is visited again from the start', () => {
      const { timeline, first, second } = build();
      timeline.seek(250);
      timeline.stop();
      expect([first.progress$.value, second.progress$.value]).toEqual([0, 0]);

      timeline.seek(120);
      expect([first.progress$.value, second.progress$.value]).toEqual([1, 0.2]);
    });
  });

  describe('When a child is not a built-in item', () => {
    it('Then it still receives every update after it has started, like before', () => {
      const calls: number[] = [];
      const custom: AnimatableItem = { duration: 50, seekLocal: (local) => { calls.push(local); }, resetInternal: () => undefined };
      const timeline = new Timeline().add(new Animation({ duration: 10 })).add(custom, 20).add(new Animation({ duration: 300 }), 0);

      timeline.seek(10);
      timeline.seek(30);
      timeline.seek(60);
      timeline.seek(90);
      timeline.seek(150);
      expect(calls).toEqual([10, 40, 70, 130]);
    });
  });
});

describe('Given unusual updates', () => {
  /** Runs the same scenario on the old and the new implementation and returns both traces. */
  function both(scenario: (Ctor: typeof Timeline | typeof LegacyTimeline, log: string[]) => void): { legacy: string[]; actual: string[] } {
    const legacy: string[] = [];
    scenario(LegacyTimeline, legacy);
    const actual: string[] = [];
    scenario(Timeline, actual);
    return { legacy, actual };
  }

  describe('When a child callback seeks the timeline re-entrantly', () => {
    it('Then the trace equals the old implementation and later updates stay correct', () => {
      const { legacy, actual } = both((Ctor, log) => {
        const timeline: InstanceType<typeof Ctor> = new Ctor();
        let reentered = false;
        timeline.add(new Animation({ duration: 100, onComplete: () => log.push('a.complete') }));
        timeline.add(new Animation({
          duration: 100,
          onUpdate: (progress) => {
            log.push(`b:${progress}`);
            if (!reentered && progress > 0.5) { reentered = true; timeline.seek(30); }
          },
        }));
        timeline.add(new Animation({ duration: 100, onUpdate: (progress) => log.push(`c:${progress}`) }), 100);
        for (const target of [60, 150, 180, 40, 250, 120, 300, 10]) {
          timeline.seek(target);
          log.push(`@${target}`);
        }
      });
      expect(actual).toEqual(legacy);
      expect(legacy.length).toBeGreaterThan(10);
    });
  });

  describe('When a child callback throws during an update', () => {
    it('Then the error propagates as before and the next updates match the old implementation', () => {
      const { legacy, actual } = both((Ctor, log) => {
        const timeline: InstanceType<typeof Ctor> = new Ctor();
        let thrown = false;
        timeline.add(new Animation({ duration: 100, onUpdate: (progress) => log.push(`a:${progress}`) }));
        timeline.add(new Animation({
          duration: 100,
          onUpdate: (progress) => {
            log.push(`b:${progress}`);
            if (!thrown && progress > 0.3) { thrown = true; throw new Error('boom'); }
          },
        }), 50);
        timeline.add(new Animation({ duration: 100, onUpdate: (progress) => log.push(`c:${progress}`) }), 150);
        for (const target of [20, 100, 120, 200, 80, 260]) {
          try { timeline.seek(target); } catch (error) { log.push(`error:${(error as Error).message}`); }
          log.push(`@${target}`);
        }
      });
      expect(actual).toEqual(legacy);
      expect(legacy).toContain('error:boom');
    });
  });

  describe('When a structure edit follows a stop', () => {
    it('Then a segment added after earlier playback is visited like any other', () => {
      const timeline = new Timeline().add(new Animation({ duration: 50 }));
      timeline.seek(80);
      timeline.stop();
      const late = new Animation({ duration: 50 });
      timeline.add(late, 10);

      timeline.seek(30);
      expect(late.progress$.value).toBe(0.4);
      timeline.seek(200);
      expect(late.progress$.value).toBe(1);
    });
  });
});
