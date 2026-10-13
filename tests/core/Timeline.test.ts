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

describe('Timeline temporal contracts', () => {

  it('rejects invalid offsets and invalid child durations', () => {
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

  it('does not report a running state for manual timeline scrubbing', () => {
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
  it('resolves sequential, absolute, relative and parallel offsets without negative start times', () => {
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

  it('drives child animations deterministically when seeking forward and backward', () => {
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

  it('supports nested timelines and uses the parent clock', async () => {
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

  it('completes an empty timeline without division by zero', async () => {
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

  it('rejects pending completion when stopped', async () => {
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


describe('Timeline motion preferences', () => {
  it('applies reduced-motion policy at the timeline level for child animations', async () => {
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


describe('Timeline labels and transport controls', () => {
  it('supports labels and relative offsets from labels', () => {
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

  it('supports callbacks at positions without disturbing implicit append positions', () => {
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

  it('supports time scaling and reverse playback on the same shared frame clock', async () => {
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
    // At 55 ms the reverse playhead has reached 0 (the final timeScale step is capped at the boundary).
    await expect(completion).resolves.toBeUndefined();
    expect(tween.value$.value).toBe(0);
    expect(timeline.progress).toBe(0);
    expect(timeline.isReversed).toBe(true);
    expect(raf.pendingCount).toBe(0);
  });

  it('validates the time scale', () => {
    const timeline = new Timeline();
    expect(timeline.timeScale()).toBe(1);
    expect(() => timeline.timeScale(0)).toThrow('greater than zero');
    expect(() => timeline.timeScale(Number.NaN)).toThrow('finite');
  });
});
