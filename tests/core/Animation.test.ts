import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BehaviorSubject } from 'rxjs';
import { Animation } from '../../src/core/Animation.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given Animation lifecycle', () => {

  describe('When invalid timing options are supplied', () => {
    describe('And When an Animation is constructed', () => {
      it('Then it rejects them instead of silently normalizing them', () => {
        expect(() => new Animation({ duration: -1 })).toThrow('Animation duration');
        expect(() => new Animation({ duration: Number.NaN })).toThrow('Animation duration');
        expect(() => new Animation({ duration: Infinity })).toThrow('Animation duration');
        expect(() => new Animation({ duration: 10, delay: -1 })).toThrow('Animation delay');
        expect(() => new Animation({ duration: 10, delay: Number.NaN })).toThrow('Animation delay');
        expect(() => new Animation({ duration: 10, delay: Infinity })).toThrow('Animation delay');
        expect(() => new Animation({ duration: 10, repeat: -1 })).toThrow('Animation repeat');
        expect(() => new Animation({ duration: 10, repeat: 1.5 })).toThrow('Animation repeat');
        expect(() => new Animation({ duration: 10, repeat: Number.NaN })).toThrow('Animation repeat');
        expect(() => new Animation({ duration: Number.MAX_VALUE, repeat: 2 })).toThrow('total duration');
        expect(new Animation({ duration: 10, repeat: Infinity }).duration).toBe(Infinity);
      });
    });
  });

  describe('When an Animation is idle or paused', () => {
    describe('And When it is manually sought', () => {
      it('Then values update without starting a clock', () => {
        const animation = new Animation({ duration: 100 });
        animation.seek(40);
        expect(animation.progress$.value).toBeCloseTo(0.4);
        expect(animation.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);

        animation.play();
        expect(animation.state$.value).toBe('running');
        raf.advance(0);
        animation.seek(55);
        expect(animation.progress$.value).toBeCloseTo(0.55);
        expect(animation.state$.value).toBe('running');
        expect(raf.pendingCount).toBe(1);
        animation.pause();
        animation.seek(60);
        expect(animation.progress$.value).toBeCloseTo(0.6);
        expect(animation.state$.value).toBe('paused');
        expect(raf.pendingCount).toBe(0);

        animation.seek(100);
        expect(animation.state$.value).toBe('completed');
        animation.seek(50);
        expect(animation.state$.value).toBe('idle');
        expect(animation.progress$.value).toBeCloseTo(0.5);
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an Animation is playing', () => {
    describe('And When shared frame deltas reach its duration', () => {
      it('Then completion resolves', async () => {
        const onComplete = jest.fn();
        const animation = new Animation({ duration: 100, onComplete });
        const completion = animation.toPromise();

        animation.play();
        expect(raf.pendingCount).toBe(1);
        raf.advance(1000);
        expect(animation.progress$.value).toBe(0);
        raf.advance(1040);
        expect(animation.progress$.value).toBeCloseTo(0.4);
        raf.advance(1100);

        expect(animation.progress$.value).toBe(1);
        expect(animation.state$.value).toBe('completed');
        expect(onComplete).toHaveBeenCalledTimes(1);
        await expect(completion).resolves.toBeUndefined();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When multiple Animations play concurrently', () => {
    describe('And When they share the frame clock and stop', () => {
      it('Then only one RAF chain exists and it is cancelled after the last leaves', () => {
        const first = new Animation({ duration: 200 });
        const second = new Animation({ duration: 300 });
        first.play();
        second.play();

        expect(raf.pendingCount).toBe(1);
        raf.advance(0);
        expect(raf.pendingCount).toBe(1);

        first.stop();
        expect(raf.pendingCount).toBe(1);
        second.stop();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When a running Animation', () => {
    describe('And When it pauses and resumes', () => {
      it('Then progress is preserved and the resumed clock starts at a fresh frame boundary', () => {
        const onPause = jest.fn();
        const onResume = jest.fn();
        const animation = new Animation({ duration: 100, onPause, onResume });

        animation.play();
        raf.advance(0);
        raf.advance(40);
        animation.pause();
        expect(animation.progress$.value).toBeCloseTo(0.4);
        expect(animation.state$.value).toBe('paused');
        expect(onPause).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(0);

        animation.play();
        raf.advance(100);
        expect(animation.progress$.value).toBeCloseTo(0.4);
        raf.advance(130);
        expect(animation.progress$.value).toBeCloseTo(0.7);
        expect(onResume).toHaveBeenCalledTimes(1);
        animation.stop();
      });
    });
  });

  describe('When an Animation is pending', () => {
    describe('And When it is stopped', () => {
      it('Then completion rejects and state resets', async () => {
        const animation = new Animation({ duration: 100 });
        const completion = animation.toPromise();
        const assertion = expect(completion).rejects.toThrow('Animation stopped before completion');
        animation.play();
        raf.advance(0);
        animation.seek(40);
        animation.stop();

        await assertion;
        expect(animation.progress$.value).toBe(0);
        expect(animation.state$.value).toBe('idle');
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an Animation has completed', () => {
    describe('And When it is sought beyond the end and played again', () => {
      it('Then the seek clamps and a fresh cycle starts', async () => {
        const animation = new Animation({ duration: 100 });
        animation.seek(250);
        await expect(animation.toPromise()).resolves.toBeUndefined();
        expect(animation.progress$.value).toBe(1);
        expect(animation.state$.value).toBe('completed');

        animation.play();
        const nextCycle = animation.toPromise();
        expect(animation.state$.value).toBe('running');
        raf.advance(0);
        raf.advance(100);
        raf.advance(200);
        await expect(nextCycle).resolves.toBeUndefined();
        expect(animation.state$.value).toBe('completed');
      });
    });
  });

  describe('When delay, repeat and yoyo options', () => {
    describe('And When the Animation is sought across cycles', () => {
      it('Then reported progress reflects those options', () => {
        const animation = new Animation({ duration: 100, delay: 20, repeat: 1, yoyo: true });

        animation.seek(10);
        expect(animation.progress$.value).toBe(0);
        animation.seek(70);
        expect(animation.progress$.value).toBeCloseTo(0.5);
        animation.seek(120);
        expect(animation.progress$.value).toBe(1);
        animation.seek(220);
        expect(animation.progress$.value).toBe(0);
        expect(animation.state$.value).toBe('completed');
      });
    });
  });
});


describe('Given Animation motion preferences', () => {
  describe('When reduced motion is already requested', () => {
    describe('And When a finite opted-in Animation plays', () => {
      it('Then it finishes immediately', async () => {
        const state = new BehaviorSubject({ reducedMotion: true, visible: true });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const animation = new Animation({ duration: 160, motion: { preferences } });
        const completion = animation.toPromise();

        animation.play();

        expect(animation.progress$.value).toBe(1);
        expect(animation.state$.value).toBe('completed');
        expect(raf.pendingCount).toBe(0);
        await expect(completion).resolves.toBeUndefined();
      });
    });
  });

  describe('When two Animations with different motion policies', () => {
    describe('And When reduced motion is requested', () => {
      it('Then only the opted-in Animation is affected', () => {
        const state = new BehaviorSubject({ reducedMotion: false, visible: true });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const optedIn = new Animation({ duration: 200, motion: { preferences } });
        const unrestricted = new Animation({ duration: 200 });
        optedIn.play();
        unrestricted.play();
        raf.advance(0);

        state.next({ reducedMotion: true, visible: true });
        expect(optedIn.state$.value).toBe('completed');
        expect(unrestricted.state$.value).toBe('running');
        expect(raf.pendingCount).toBe(1);
        unrestricted.stop();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an Animation is configured to ignore reduced motion', () => {
    describe('And When the preference changes', () => {
      it('Then playback continues', () => {
        const state = new BehaviorSubject({ reducedMotion: false, visible: true });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const animation = new Animation({ duration: 200, motion: { preferences, reducedMotion: 'ignore' } });
        animation.play();
        raf.advance(0);

        state.next({ reducedMotion: true, visible: true });
        expect(animation.state$.value).toBe('running');
        expect(raf.pendingCount).toBe(1);
        animation.stop();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an Animation configured to pause when hidden', () => {
    describe('And When visibility changes', () => {
      it('Then it pauses and resumes with visibility', () => {
        const state = new BehaviorSubject({ reducedMotion: false, visible: true });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const onResume = jest.fn();
        const animation = new Animation({ duration: 200, onResume, motion: { preferences, pauseWhenHidden: true } });
        animation.play();
        raf.advance(0);
        raf.advance(32);
        const beforePause = animation.progress$.value;

        state.next({ reducedMotion: false, visible: false });
        expect(animation.state$.value).toBe('paused');
        expect(raf.pendingCount).toBe(0);
        state.next({ reducedMotion: false, visible: true });
        expect(animation.state$.value).toBe('running');
        expect(onResume).toHaveBeenCalledTimes(1);
        expect(raf.pendingCount).toBe(1);
        raf.advance(1000);
        expect(animation.progress$.value).toBeCloseTo(beforePause);
        animation.stop();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an Animation is paused while waiting for visibility', () => {
    describe('And When the tab becomes visible', () => {
      it('Then it remains paused', () => {
        const state = new BehaviorSubject({ reducedMotion: false, visible: false });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const onResume = jest.fn();
        const animation = new Animation({ duration: 100, onResume, motion: { preferences, pauseWhenHidden: true } });
        animation.play();
        expect(animation.state$.value).toBe('paused');
        animation.pause();
        state.next({ reducedMotion: false, visible: true });
        expect(animation.state$.value).toBe('paused');
        expect(onResume).not.toHaveBeenCalled();
        expect(raf.pendingCount).toBe(0);
      });
    });
  });

  describe('When an infinite-repeat Animation runs under reduced motion', () => {
    describe('And When the preference is cleared', () => {
      it('Then its lifecycle resumes without forcing completion', () => {
        const state = new BehaviorSubject({ reducedMotion: true, visible: true });
        const preferences = { state$: state.asObservable(), get snapshot() { return state.value; } };
        const onResume = jest.fn();
        const animation = new Animation({ duration: 100, repeat: Infinity, onResume, motion: { preferences } });

        animation.play();
        expect(animation.state$.value).toBe('paused');
        expect(raf.pendingCount).toBe(0);
        state.next({ reducedMotion: false, visible: true });
        expect(animation.state$.value).toBe('running');
        expect(onResume).not.toHaveBeenCalled();
        expect(raf.pendingCount).toBe(1);
        animation.stop();
      });
    });
  });

});
