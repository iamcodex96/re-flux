import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
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

describe('Given Timeline public contracts', () => {
  describe('When a Timeline contains one child', () => {
    describe('And When playback completes', () => {
      it('Then parent and child callbacks follow a stable order', async () => {
        // Given: a parent timeline and one child with lifecycle callbacks.
        const events: string[] = [];
        const child = new Animation({
          duration: 100,
          onStart: () => events.push('child:start'),
          onUpdate: (progress) => events.push(`child:update:${progress}`),
          onComplete: () => events.push('child:complete'),
        });
        const timeline = new Timeline({
          onStart: () => events.push('parent:start'),
          onUpdate: (progress) => events.push(`parent:update:${progress}`),
          onComplete: () => events.push('parent:complete'),
        }).add(child);
        const completion = timeline.toPromise();

        // When: the shared frame clock advances from the beginning to the end.
        timeline.play();
        raf.advance(0);
        raf.advance(100);
        await expect(completion).resolves.toBeUndefined();

        // Then: the parent opens the cycle before the child, and the child completes before the parent.
        expect(events).toEqual([
          'parent:start',
          'child:start',
          'child:update:0',
          'parent:update:0',
          'child:update:1',
          'child:complete',
          'parent:update:1',
          'parent:complete',
        ]);
        expect(timeline.state$.value).toBe('completed');
        expect(child.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a Timeline contains a child that emits updates', () => {
    describe('And When the parent stops', () => {
      it('Then the child and clock are reset without later emissions', () => {
        // Given: a timeline whose child is actively being driven by the parent.
        const onUpdate = jest.fn();
        const child = new Tween({ from: 0, to: 100, duration: 100, onUpdate });
        const timeline = new Timeline().add(child);
        timeline.play();
        raf.advance(0);
        raf.advance(30);
        expect(child.value$.value).toBe(30);
        const updatesAtStop = onUpdate.mock.calls.length;

        // When: the parent timeline is stopped.
        timeline.stop();

        // Then: parent and child return to their initial state and no frame stays scheduled.
        expect(timeline.state$.value).toBe('idle');
        expect(timeline.progress$.value).toBe(0);
        expect(child.state$.value).toBe('idle');
        expect(child.value$.value).toBe(0);
        expect(raf.pendingCount).toBe(0);

        // When: another timestamp is delivered after stop.
        raf.advance(100);

        // Then: neither the child value nor its update callback changes.
        expect(child.value$.value).toBe(0);
        expect(onUpdate).toHaveBeenCalledTimes(updatesAtStop);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a Timeline contains a callback marker', () => {
    describe('And When the playhead travels backward', () => {
      it('Then the callback waits for the next forward crossing', () => {
        // Given: a callback positioned midway through the timeline.
        const callback = jest.fn();
        const timeline = new Timeline()
          .add(new Animation({ duration: 100 }))
          .call(callback, 50);

        // When: the playhead crosses the marker for the first time.
        timeline.seek(75);
        expect(callback).toHaveBeenCalledTimes(1);

        // When: it scrubs backward across the marker and then forward again.
        timeline.seek(25);
        expect(callback).toHaveBeenCalledTimes(1);
        timeline.seek(75);

        // Then: reverse travel does not call it, and the next forward crossing rearms it once.
        expect(callback).toHaveBeenCalledTimes(2);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a Timeline has a finite duration', () => {
    describe('And When seekProgress exceeds its bounds', () => {
      it('Then it clamps progress without starting playback', () => {
        // Given: an idle timeline whose child makes its duration non-zero.
        const timeline = new Timeline().add(new Animation({ duration: 100 }));

        // When: normalized playhead values are outside the inclusive range [0, 1].
        timeline.seekProgress(-0.5);
        expect(timeline.currentTime).toBe(0);
        timeline.seekProgress(1.5);

        // Then: the playhead is clamped and the seek operation does not create a frame loop.
        expect(timeline.currentTime).toBe(100);
        expect(timeline.progress).toBe(1);
        expect(timeline.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a Timeline is edited only by seeking', () => {
    describe('And When it seeks to a non-zero time', () => {
      it('Then structural edits stay locked until stop', () => {
        // Given: a timeline which has never been played.
        const timeline = new Timeline().add(new Animation({ duration: 100 }));

        // When: its playhead is moved away from the start.
        timeline.seek(25);

        // Then: adding segments is rejected because the playhead has established a structure-dependent position.
        expect(() => timeline.add(new Animation({ duration: 10 }))).toThrow('stop() before editing');

        // When: the timeline is stopped and reset.
        timeline.stop();

        // Then: edits are available again, and the timeline remains free of pending frames.
        expect(() => timeline.add(new Animation({ duration: 10 }))).not.toThrow();
        expect(timeline.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a partially played timeline', () => {
    describe('And When restart is requested', () => {
      it('Then the previous cycle rejects and children start over', async () => {
        // Given: a timeline with a child whose value tracks its local playhead.
        const child = new Tween({ from: 0, to: 100, duration: 100 });
        const timeline = new Timeline().add(child);
        const previousCompletion = timeline.toPromise();
        const previousAssertion = expect(previousCompletion).rejects.toThrow('Animation stopped before completion');
        timeline.play();
        raf.advance(0);
        raf.advance(40);
        expect(child.value$.value).toBe(40);

        // When: the parent is restarted.
        timeline.restart();
        const currentCompletion = timeline.toPromise();

        // Then: the child is reset and its next cycle advances from the beginning.
        expect(timeline.state$.value).toBe('running');
        expect(timeline.currentTime).toBe(0);
        expect(child.value$.value).toBe(0);
        raf.advance(50);
        expect(child.value$.value).toBe(0);
        raf.advance(75);
        expect(child.value$.value).toBe(25);
        raf.advance(150);
        await previousAssertion;
        await expect(currentCompletion).resolves.toBeUndefined();
        expect(timeline.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a nested Timeline is configured', () => {
    describe('And When the parent pauses and resumes', () => {
      it('Then child time remains parent-controlled', () => {
        // Given: one nested timeline owned by a parent.
        const child = new Tween({ from: 0, to: 100, duration: 100 });
        const nested = new Timeline().add(child);
        const parent = new Timeline().add(nested);
        parent.play();
        raf.advance(0);
        raf.advance(30);
        expect(child.value$.value).toBe(30);

        // When: the parent pauses and frames arrive, child time must remain frozen.
        parent.pause();
        expect(raf.pendingCount).toBe(0);
        raf.advance(60);
        expect(child.value$.value).toBe(30);

        // When: the parent resumes and the next frame boundary arrives.
        parent.play();
        raf.advance(100);
        expect(child.value$.value).toBe(30);
        raf.advance(120);

        // Then: only subsequent parent-frame deltas move the nested child.
        expect(child.value$.value).toBe(50);
        parent.stop();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });


  describe('When reverse playback starts from the beginning', () => {
    describe('And When a finite Timeline reverses to its start', () => {
      it('Then it begins at the end and resolves completion after traversing backward', async () => {
        // Given: a finite timeline and a child whose value follows its local time.
        const onComplete = jest.fn();
        const tween = new Tween({ from: 0, to: 100, duration: 100 });
        const timeline = new Timeline({ onComplete }).add(tween);
        const completion = timeline.toPromise();

        // When: reverse is requested while the playhead is at zero.
        timeline.reverse();
        expect(timeline.currentTime).toBe(100);
        expect(raf.pendingCount).toBe(1);
        raf.advance(0);
        expect(tween.value$.value).toBe(100);
        raf.advance(40);
        expect(tween.value$.value).toBe(60);
        raf.advance(100);

        // Then: the playhead reaches zero, the promise resolves once, and the shared clock is released.
        await expect(completion).resolves.toBeUndefined();
        expect(timeline.currentTime).toBe(0);
        expect(timeline.progress).toBe(0);
        expect(timeline.state$.value).toBe('completed');
        expect(timeline.isReversed).toBe(true);
        expect(tween.value$.value).toBe(0);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });



  describe('When a Timeline has completed in reverse', () => {
    describe('And When forward playback is requested again', () => {
      it('Then it starts a fresh forward cycle from zero', async () => {
        // Given: a finite Timeline that completes a reverse pass to its start.
        const tween = new Tween({ from: 0, to: 100, duration: 100 });
        const timeline = new Timeline().add(tween);
        const reverseCompletion = timeline.toPromise();
        timeline.reverse();
        raf.advance(0);
        raf.advance(100);
        await expect(reverseCompletion).resolves.toBeUndefined();
        expect(timeline.state$.value).toBe('completed');
        expect(tween.value$.value).toBe(0);

        // When: normal forward playback is requested after the reverse cycle completed.
        timeline.play();
        const forwardCompletion = timeline.toPromise();

        // Then: a new forward cycle begins at zero and reaches its end independently.
        expect(timeline.currentTime).toBe(0);
        expect(timeline.progress).toBe(0);
        expect(timeline.state$.value).toBe('running');
        expect(timeline.isReversed).toBe(false);
        raf.advance(200);
        expect(tween.value$.value).toBe(0);
        raf.advance(300);
        await expect(forwardCompletion).resolves.toBeUndefined();
        expect(timeline.progress).toBe(1);
        expect(timeline.state$.value).toBe('completed');
        expect(tween.value$.value).toBe(100);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

});
