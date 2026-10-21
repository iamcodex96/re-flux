import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BehaviorSubject } from 'rxjs';
import { Animation } from '../../src/core/Animation.js';
import { Timeline } from '../../src/core/Timeline.js';
import { Tween } from '../../src/values/Tween.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given Timeline temporal contracts', () => {

  describe('When invalid offsets or child durations are supplied', () => {
    describe('And When items are added to a Timeline', () => {
      it('Then the operation is rejected', () => {
        const timeline = new Timeline();
        const animation = new Animation({ duration: 10 });
        expect(() => timeline.add(animation, Number.NaN)).toThrow('Timeline offset');
        expect(() => timeline.add(animation, Infinity)).toThrow('Timeline offset');
        expect(() => timeline.add(animation, -1)).toThrow('Timeline offset');
        expect(() => timeline.add({
          duration: Number.NaN,
          seekLocal: () => undefined,
          resetInternal: () => undefined,
        })).toThrow('Timeline child duration');
        expect(() => timeline.addLabel('bad', Infinity)).toThrow('Timeline offset');
        expect(() => timeline.addLabel('negative', -1)).toThrow('Timeline offset');
      });
    });
  });

  describe('When a Timeline instance exists', () => {
    describe('And When its playhead is manually scrubbed', () => {
      it('Then it does not report active playback', () => {
        const onChildPause = jest.fn();
        const onChildResume = jest.fn();
        const child = new Tween({ from: 0, to: 100, duration: 100, onPause: onChildPause, onResume: onChildResume });
        const timeline = new Timeline().add(child);

        timeline.seek(40);
        expect(child.value$.value).toBe(40);
        expect(timeline.state$.value).toBe('idle');
        expect(child.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);

        timeline.play();
        expect(timeline.state$.value).toBe('running');
        raf.advance(0);
        timeline.seek(45);
        expect(child.value$.value).toBe(45);
        expect(timeline.state$.value).toBe('running');
        expect(raf.pendingCount).toBe(1);
        timeline.pause();
        timeline.seek(60);
        expect(child.value$.value).toBe(60);
        expect(timeline.state$.value).toBe('paused');
        expect(child.state$.value).toBe('paused');
        expect(onChildPause).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(0);

        timeline.play();
        raf.advance(10);
        expect(child.state$.value).toBe('running');
        expect(onChildResume).toHaveBeenCalledTimes(1);
        timeline.stop();
      });
    });
  });

  describe('When Timeline items use sequential, absolute, relative, and parallel offsets', () => {
    describe('And When segments are added', () => {
      it('Then start times are resolved without becoming negative', () => {
        const first = new Animation({ duration: 100 });
        const second = new Animation({ duration: 100 });
        const third = new Animation({ duration: 50 });
        const fourth = new Animation({ duration: 30 });
        const fifth = new Animation({ duration: 10 });
        const timeline = new Timeline()
          .add(first)
          .add(second, '-=150')
          .add(third, '<')
          .add(fourth, 5)
          .add(fifth, '+=20');

        expect(timeline.segments.map(({ startTime, endTime }) => [startTime, endTime])).toEqual([
          [0, 100],
          [0, 100],
          [0, 50],
          [5, 35],
          [55, 65],
        ]);
        expect(timeline.duration).toBe(100);
        expect(timeline.segments.every((segment) => segment.startTime >= 0)).toBe(true);
      });
    });
  });

  describe('When child Animations overlap', () => {
    describe('And When a Timeline seeks forward and backward', () => {
      it('Then each child is driven deterministically', () => {
        const first = new Tween({ from: 0, to: 100, duration: 100 });
        const second = new Tween({ from: 0, to: 1, duration: 100 });
        const timeline = new Timeline().add(first).add(second, '-=50');

        timeline.seek(25);
        expect(first.value$.value).toBe(25);
        expect(second.value$.value).toBe(0);
        expect(second.state$.value).toBe('idle');

        timeline.seek(75);
        expect(first.value$.value).toBe(75);
        expect(second.value$.value).toBeCloseTo(0.25);

        timeline.seek(10);
        expect(first.value$.value).toBe(10);
        expect(second.value$.value).toBe(0);
        expect(second.state$.value).toBe('idle');
      });
    });
  });

  describe('When a nested Timeline is configured', () => {
    describe('And When the parent plays', () => {
      it('Then the parent clock drives the nested child', async () => {
        const child = new Animation({ duration: 100 });
        const nested = new Timeline().add(child);
        const parent = new Timeline().add(nested);
        const completion = parent.toPromise();

        parent.play();
        expect(raf.pendingCount).toBe(1);
        raf.advance(0);
        raf.advance(50);
        expect(child.progress$.value).toBeCloseTo(0.5);
        raf.advance(100);
        expect(parent.state$.value).toBe('completed');
        expect(child.state$.value).toBe('completed');
        await expect(completion).resolves.toBeUndefined();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an empty Timeline', () => {
    describe('And When it plays', () => {
      it('Then it completes without division by zero', async () => {
        const timeline = new Timeline();
        expect(timeline.duration).toBe(0);
        timeline.play();
        const completion = timeline.toPromise();
        raf.advance(0);
        await expect(completion).resolves.toBeUndefined();
        expect(timeline.progress$.value).toBe(1);
        expect(timeline.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a playing Timeline', () => {
    describe('And When it is stopped', () => {
      it('Then pending completion rejects', async () => {
        const timeline = new Timeline().add(new Animation({ duration: 200 }));
        const completion = timeline.toPromise();
        const assertion = expect(completion).rejects.toThrow('Animation stopped before completion');
        timeline.play();
        raf.advance(0);
        timeline.stop();
        await assertion;
        expect(timeline.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });
});


describe('Given Timeline motion preferences', () => {
  describe('When reduced motion is requested on a Timeline', () => {
    describe('And When it plays', () => {
      it('Then its child animations follow the parent policy', async () => {
        const state = new BehaviorSubject({ reducedMotion: true, visible: true });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const child = new Animation({ duration: 100 });
        const timeline = new Timeline({ motion: { preferences } }).add(child);
        const completion = timeline.toPromise();

        timeline.play();

        expect(timeline.state$.value).toBe('completed');
        expect(timeline.progress$.value).toBe(1);
        expect(child.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
        await expect(completion).resolves.toBeUndefined();
      });
    });
  });
});


describe('Given Timeline labels and transport controls', () => {
  describe('When a Timeline has named labels', () => {
    describe('And When segments use label-relative offsets', () => {
      it('Then they resolve to the expected positions', () => {
        const timeline = new Timeline();
        timeline.add(new Animation({ duration: 100 }));
        timeline.addLabel('intro');
        timeline.add(new Animation({ duration: 50 }), 'intro+=25');
        timeline.addLabel('outro', 'intro+=80');
        timeline.add(new Animation({ duration: 20 }), 'outro');

        expect(timeline.labelTime('intro')).toBe(100);
        expect(timeline.timelineLabels).toEqual({ intro: 100, outro: 180 });
        expect(timeline.segments.map(({ startTime, endTime }) => [startTime, endTime])).toEqual([
          [0, 100], [125, 175], [180, 200],
        ]);
        expect(() => timeline.add(new Animation({ duration: 10 }), 'missing-label')).toThrow('Unknown timeline offset or label');
      });
    });
  });

  describe('When callbacks are scheduled at explicit positions', () => {
    describe('And When more segments are appended', () => {
      it('Then implicit append positions remain unchanged', () => {
        const callback = jest.fn();
        const timeline = new Timeline()
          .add(new Animation({ duration: 100 }))
          .call(callback, 50)
          .add(new Animation({ duration: 100 }));

        expect(timeline.segments.map(({ startTime, endTime }) => [startTime, endTime])).toEqual([[0, 100], [50, 50], [100, 200]]);
        timeline.seek(75);
        expect(callback).toHaveBeenCalledTimes(1);
        timeline.seek(25);
        timeline.seek(75);
        expect(callback).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('When a callback is scheduled at offset zero', () => {
    describe('And When the playhead rewinds and advances again', () => {
      it('Then the callback rearms without firing during reverse travel', () => {
        const callback = jest.fn();
        const timeline = new Timeline()
          .call(callback, 0)
          .add(new Animation({ duration: 100 }), 0);

        timeline.seek(25);
        expect(callback).toHaveBeenCalledTimes(1);

        timeline.seek(0);
        expect(callback).toHaveBeenCalledTimes(1);

        timeline.seek(0);
        expect(callback).toHaveBeenCalledTimes(1);

        timeline.seek(25);
        expect(callback).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('When a Timeline uses a time scale', () => {
    describe('And When playback reverses', () => {
      it('Then both directions use the shared frame clock', async () => {
        const tween = new Tween({ from: 0, to: 100, duration: 100 });
        const timeline = new Timeline().add(tween).timeScale(2);
        timeline.play();
        raf.advance(0);
        raf.advance(25);
        expect(tween.value$.value).toBe(50);
        expect(timeline.currentTime).toBe(50);

        timeline.reverse();
        raf.advance(30);
        raf.advance(40);
        expect(tween.value$.value).toBe(20);
        raf.advance(55);
        const completion = timeline.toPromise();

        await expect(completion).resolves.toBeUndefined();
        expect(tween.value$.value).toBe(0);
        expect(timeline.progress).toBe(0);
        expect(timeline.isReversed).toBe(true);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an invalid time scale is supplied', () => {
    describe('And When it is applied to a Timeline', () => {
      it('Then it is rejected', () => {
        const timeline = new Timeline();
        expect(timeline.timeScale()).toBe(1);
        expect(() => timeline.timeScale(0)).toThrow('greater than zero');
        expect(() => timeline.timeScale(Number.NaN)).toThrow('finite');
      });
    });
  });

  describe('When playback has begun', () => {
    describe('And When the Timeline structure is edited', () => {
      it('Then edits are locked until stop resets it', async () => {
        const timeline = new Timeline().add(new Animation({ duration: 100 }));
        const completion = timeline.toPromise();

        timeline.play();
        expect(() => timeline.add(new Animation({ duration: 20 }))).toThrow('stop() before editing');
        expect(() => timeline.addLabel('late')).toThrow('stop() before editing');
        expect(() => timeline.removeLabel('intro')).toThrow('stop() before editing');

        timeline.stop();
        await expect(completion).rejects.toThrow('Animation stopped before completion');
        expect(() => timeline.add(new Animation({ duration: 20 }))).not.toThrow();
        expect(() => timeline.addLabel('after-stop')).not.toThrow();
      });
    });
  });

  describe('When a nested Timeline has a parent owner', () => {
    describe('And When structure or direct controls are changed', () => {
      it('Then parent-ownership rules are enforced', () => {
        const nested = new Timeline().add(new Animation({ duration: 100 }));
        const parent = new Timeline().add(nested);

        expect(parent.duration).toBe(100);
        expect(() => nested.add(new Animation({ duration: 10 }))).toThrow('after adding it to a parent');
        expect(() => nested.seek(20)).toThrow('controlled by its parent');
        expect(() => nested.play()).toThrow('controlled by its parent');
        expect(() => new Timeline().add(nested)).toThrow('one parent Timeline');
        expect(() => parent.add(nested)).toThrow('only be added once');

        parent.play();
        raf.advance(0);
        raf.advance(50);
        expect(nested.currentTime).toBe(50);
        parent.stop();
        expect(() => nested.add(new Animation({ duration: 10 }))).toThrow('after adding it to a parent');
      });
    });
  });

  describe('When a segment has been entered', () => {
    describe('And When the playhead crosses back before its start', () => {
      it('Then it resets only on that boundary crossing', () => {
        const reset = jest.fn();
        const seek = jest.fn();
        const item = {
          duration: 50,
          seekLocal: seek,
          resetInternal: reset,
        };
        const timeline = new Timeline().add(new Animation({ duration: 100 })).add(item, 100);

        timeline.seek(10);
        timeline.seek(20);
        expect(reset).toHaveBeenCalledTimes(1);

        timeline.seek(110);
        timeline.seek(120);
        expect(seek).toHaveBeenCalledTimes(2);

        timeline.seek(40);
        timeline.seek(50);
        expect(reset).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('When nested Timeline relationships are configured', () => {
    describe('And When a direct or indirect cycle is attempted', () => {
      it('Then the cycle is rejected', () => {
        const first = new Timeline();
        const second = new Timeline();
        expect(() => first.add(first)).toThrow('cannot contain itself');
        first.add(second);
        expect(() => second.add(first)).toThrow('nested Timeline cycle');
      });
    });
  });

});
