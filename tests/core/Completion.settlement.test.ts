import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Animation } from '../../src/core/Animation.js';
import { Completion } from '../../src/core/Completion.js';
import { Timeline } from '../../src/core/Timeline.js';
import { RafController } from '../helpers/RafController.js';

/**
 * PERF-011 characterization: what a consumer can observe of a Completion does not depend on whether the promise was
 * asked for before or after the cycle settled. Green on the eager implementation, must stay green once the promise is
 * created lazily.
 */
const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => raf.uninstall());

async function nextMacrotask(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Collects unhandled rejections raised while `action` runs and a macrotask afterwards. Jest runs tests with a sandboxed
 * `process` that never receives the real event, so this listener cannot fail here; the assertion that has teeth is
 * `scripts/check-unhandled-rejections.mjs` (`npm run check:unhandled-rejections`, part of `check:all`).
 */
async function unhandledDuring(action: () => void | Promise<void>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const listener = (reason: unknown): void => {
    seen.push(reason);
  };
  process.on('unhandledRejection', listener);
  try {
    await action();
    await nextMacrotask();
    await nextMacrotask();
  } finally {
    process.off('unhandledRejection', listener);
  }
  return seen;
}

describe('Given a Completion cycle that settles before anyone looks at its promise', () => {
  describe('When it was resolved', () => {
    it('Then the promise asked for afterwards resolves and stays the same object', async () => {
      const completion = new Completion();
      completion.resolve();

      const promise = completion.promise;
      expect(completion.promise).toBe(promise);
      await expect(promise).resolves.toBeUndefined();
      expect(completion.isSettled).toBe(true);
    });
  });

  describe('When it was rejected', () => {
    it('Then the promise asked for afterwards rejects with that reason, without an unhandled rejection', async () => {
      const completion = new Completion();
      const reason = new Error('stopped');
      let promise: Promise<void> | undefined;
      const unhandled = await unhandledDuring(async () => {
        completion.reject(reason);
        await nextMacrotask();
        promise = completion.promise;
        await expect(promise).rejects.toBe(reason);
      });

      expect(unhandled).toEqual([]);
      expect(completion.promise).toBe(promise);
    });

    it('Then a rejection nobody ever asks about raises no unhandled rejection', async () => {
      const unhandled = await unhandledDuring(() => {
        const completion = new Completion();
        completion.reject(new Error('never observed'));
        completion.restart(new Error('also never observed'));
        completion.reject(new Error('and again'));
      });

      expect(unhandled).toEqual([]);
    });

    it('Then the first settlement wins whether or not the promise exists', async () => {
      const early = new Completion();
      early.reject(new Error('first'));
      early.resolve();
      early.reject(new Error('second'));
      await expect(early.promise).rejects.toThrow('first');

      const late = new Completion();
      const promise = late.promise;
      late.resolve();
      late.reject(new Error('ignored'));
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('When the cycle is restarted or made pending again', () => {
    it('Then an observed pending promise is rejected with the restart reason and a fresh one is pending', async () => {
      const completion = new Completion();
      const old = completion.promise;
      const assertion = expect(old).rejects.toBe('replaced');
      completion.restart('replaced');
      await assertion;

      expect(completion.isSettled).toBe(false);
      const fresh = completion.promise;
      expect(fresh).not.toBe(old);
      completion.resolve();
      await expect(fresh).resolves.toBeUndefined();
    });

    it('Then an unobserved pending cycle restarts into a pending, resolvable one', async () => {
      const completion = new Completion();
      completion.restart('replaced');
      expect(completion.isSettled).toBe(false);
      completion.resolve();
      await expect(completion.promise).resolves.toBeUndefined();
    });

    it('Then ensurePending() after a settled cycle gives a new pending promise and leaves old consumers alone', async () => {
      const completion = new Completion();
      const first = completion.promise;
      completion.resolve();
      completion.ensurePending();
      const second = completion.promise;

      expect(second).not.toBe(first);
      await expect(first).resolves.toBeUndefined();
      completion.reject(new Error('later'));
      await expect(second).rejects.toThrow('later');
    });

    it('Then ensurePending() on a pending cycle changes nothing', () => {
      const completion = new Completion();
      const promise = completion.promise;
      completion.ensurePending();
      expect(completion.promise).toBe(promise);
      expect(completion.isSettled).toBe(false);
    });
  });
});

describe('Given an Animation or Timeline whose completion nobody awaits', () => {
  describe('When it is stopped, restarted or played again', () => {
    it('Then no unhandled rejection is raised', async () => {
      const unhandled = await unhandledDuring(() => {
        const animation = new Animation({ duration: 100 });
        animation.play();
        raf.advance(0);
        raf.advance(10);
        animation.stop();
        animation.play();
        animation.restart();
        animation.stop();

        const timeline = new Timeline().add(new Animation({ duration: 50 }));
        timeline.play();
        raf.advance(20);
        raf.advance(30);
        timeline.stop();
        timeline.restart();
        timeline.stop();
      });

      expect(unhandled).toEqual([]);
    });

    it('Then a promise asked for after stop() rejects with the stop error and a later play() completes a fresh one', async () => {
      const animation = new Animation({ duration: 50 });
      animation.play();
      raf.advance(0);
      raf.advance(10);
      animation.stop();

      await expect(animation.toPromise()).rejects.toThrow('Animation stopped before completion');
      await expect(animation).rejects.toThrow('Animation stopped before completion');

      animation.play();
      const fresh = animation.toPromise();
      raf.advance(20);
      raf.advance(80);
      await expect(fresh).resolves.toBeUndefined();
      expect(animation.state$.value).toBe('completed');
    });

    it('Then awaiting a completed animation that nobody asked about earlier resolves', async () => {
      const animation = new Animation({ duration: 10 });
      animation.seek(10);
      await expect(animation).resolves.toBeUndefined();
      await expect(animation.then(() => 'done')).resolves.toBe('done');
    });
  });
});
