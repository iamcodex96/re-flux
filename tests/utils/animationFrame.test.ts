import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createAnimationFrameObservable } from '../../src/utils/animationFrame.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();

beforeEach(() => raf.install());
afterEach(() => {
  raf.uninstall();
  jest.restoreAllMocks();
});

describe('Given createAnimationFrameObservable', () => {
  describe('When an AnimationFrame observable', () => {
    describe('And When timestamps are emitted and the subscription ends', () => {
      it('Then it forwards timestamps and cancels the pending browser request', () => {
        const timestamps: number[] = [];
        const subscription = createAnimationFrameObservable().subscribe((timestamp) => timestamps.push(timestamp));

        expect(raf.pendingCount).toBe(1);
        raf.advance(12.5);
        expect(timestamps).toEqual([12.5]);
        expect(raf.pendingCount).toBe(1);

        subscription.unsubscribe();
        expect(raf.pendingCount).toBe(0);
        raf.advance(50);
        expect(timestamps).toEqual([12.5]);
      });
    });
  });

  describe('When requestAnimationFrame APIs are unavailable', () => {
    describe('And When the observable is subscribed', () => {
      it('Then it emits an explicit error', () => {
        const previousRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
        const previousCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
        Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: undefined });
        Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, writable: true, value: undefined });
        const errors: unknown[] = [];

        createAnimationFrameObservable().subscribe({ error: (error: unknown) => errors.push(error) });

        expect(errors).toHaveLength(1);
        expect(errors[0]).toEqual(new Error('requestAnimationFrame is not available in this environment.'));

        if (previousRequest) Object.defineProperty(globalThis, 'requestAnimationFrame', previousRequest);
        if (previousCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', previousCancel);
      });
    });
  });
});
