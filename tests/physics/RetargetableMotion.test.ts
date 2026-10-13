import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RetargetableMotion } from '../../src/physics/RetargetableMotion.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('RetargetableMotion', () => {
  it('retargets from the currently sampled value and velocity without snapping', () => {
    const motion = new RetargetableMotion({ initialValue: 0, stiffness: 90, damping: 8 });
    motion.to(100);
    raf.advance(0); // subscription boundary; intentionally not integrated
    raf.advance(16);
    raf.advance(32);

    const before = motion.currentSample;
    expect(before.value).toBeGreaterThan(0);
    expect(before.velocity).toBeGreaterThan(0);

    motion.to(-50);
    expect(motion.currentSample.value).toBe(before.value);
    expect(motion.currentSample.velocity).toBe(before.velocity);
    expect(motion.target$.value).toBe(-50);

    let timestamp = 48;
    for (let frame = 0; frame < 24; frame += 1) {
      raf.advance(timestamp);
      timestamp += 16;
    }
    expect(motion.currentSample.value).toBeLessThan(before.value);
    motion.dispose();
    expect(raf.pendingCount).toBe(0);
  });

  it('pauses and resumes without losing its sampled state', () => {
    const motion = new RetargetableMotion({ initialValue: 0 });
    motion.to(100);
    raf.advance(0);
    raf.advance(16);
    motion.pause();
    const paused = motion.currentSample;
    const pendingAtPause = raf.pendingCount;

    raf.advance(32);
    expect(motion.currentSample).toEqual(paused);
    expect(pendingAtPause).toBe(0);
    expect(motion.state$.value).toBe('paused');

    motion.resume();
    raf.advance(48); // resume boundary, ignored to prevent paused-time delta
    raf.advance(64);
    expect(motion.currentSample.value).toBeGreaterThan(paused.value);
    motion.dispose();
    expect(raf.pendingCount).toBe(0);
  });

  it('settles at the target, emits completion, and releases the frame loop', () => {
    const onComplete = jest.fn();
    const motion = new RetargetableMotion({
      initialValue: 0,
      stiffness: 200,
      damping: 32,
      onComplete,
    });
    motion.to(10);
    let timestamp = 0;
    for (let i = 0; i < 500 && motion.state$.value !== 'completed'; i += 1) {
      raf.advance(timestamp);
      timestamp += 16;
    }

    expect(motion.state$.value).toBe('completed');
    expect(motion.value$.value).toBe(10);
    expect(motion.velocity$.value).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(raf.pendingCount).toBe(0);
    motion.dispose();
  });

  it('stop keeps position, clears velocity, and dispose prevents further motion', () => {
    const motion = new RetargetableMotion({ initialValue: 20 });
    motion.to(80);
    raf.advance(0);
    raf.advance(16);
    const position = motion.value$.value;
    motion.stop();

    expect(motion.value$.value).toBe(position);
    expect(motion.velocity$.value).toBe(0);
    expect(motion.state$.value).toBe('idle');
    expect(raf.pendingCount).toBe(0);

    motion.dispose();
    expect(() => motion.to(100)).toThrow('RetargetableMotion has been disposed.');
  });
});
