import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Tween } from '../../src/values/Tween.js';
import { Timeline } from '../../src/core/Timeline.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Tween<T>', () => {
  it('updates values and progress on manual seek without claiming a running clock', () => {
    const onUpdate = jest.fn();
    const tween = new Tween({ from: 10, to: 30, duration: 100, onUpdate });

    expect(tween.value$.value).toBe(10);
    tween.seek(25);
    expect(tween.value$.value).toBe(15);
    expect(tween.progress$.value).toBe(0.25);
    // Manual seeking updates values without starting a frame clock, so it
    // must not report a running state.
    expect(tween.state$.value).toBe('idle');
    expect(raf.pendingCount).toBe(0);
    expect(onUpdate).toHaveBeenLastCalledWith(15, 0.25, 0.25);

    tween.seek(100);
    expect(tween.value$.value).toBe(30);
    expect(tween.state$.value).toBe('completed');
  });

  it('allows easing curves to overshoot the source-to-target interval', () => {
    const tween = new Tween({
      from: 0,
      to: 10,
      duration: 100,
      easing: (progress) => progress * 1.5,
    });

    tween.seek(100);
    expect(tween.value$.value).toBe(15);
  });

  it('uses an explicit interpolator for non-numeric values', () => {
    const tween = new Tween({
      from: { x: 0, y: 10 },
      to: { x: 20, y: 30 },
      duration: 100,
      interpolate: (from, to, progress) => ({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      }),
    });

    tween.seek(50);
    expect(tween.value$.value).toEqual({ x: 10, y: 20 });
  });

  it('requires a custom interpolator for non-numeric values', () => {
    expect(() => new Tween({ from: 'closed', to: 'open', duration: 100 })).toThrow(
      'Tween requires an interpolate function when values are not numbers.',
    );
  });

  it('can be sequenced in a Timeline and resets to its source value on stop', async () => {
    const tween = new Tween({ from: 0, to: 100, duration: 100 });
    const timeline = new Timeline().add(tween);
    const completion = timeline.toPromise();

    timeline.play();
    raf.advance(0);
    raf.advance(40);
    expect(tween.value$.value).toBe(40);
    raf.advance(100);
    await expect(completion).resolves.toBeUndefined();

    tween.seek(50);
    tween.stop();
    expect(tween.value$.value).toBe(0);
    expect(tween.state$.value).toBe('idle');
    expect(raf.pendingCount).toBe(0);
  });

  it('rejects its pending promise when stopped', async () => {
    const tween = new Tween({ from: 0, to: 1, duration: 100 });
    const completion = tween.toPromise();
    const assertion = expect(completion).rejects.toThrow('Animation stopped before completion');
    tween.play();
    raf.advance(0);
    tween.stop();
    await assertion;
  });
});
