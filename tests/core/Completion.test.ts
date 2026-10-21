import { describe, expect, it } from '@jest/globals';
import { Completion } from '../../src/core/Completion.js';

describe('Given Completion', () => {
  describe('When a completion is pending', () => {
    describe('And When it is settled multiple times', () => {
      it('Then only the first settlement takes effect', async () => {
        const completion = new Completion();
        const promise = completion.promise;

        completion.resolve();
        completion.reject(new Error('ignored after resolve'));

        await expect(promise).resolves.toBeUndefined();
        expect(completion.isSettled).toBe(true);
      });
    });
  });

  describe('When a completion promise is pending', () => {
    describe('And When the cycle restarts', () => {
      it('Then the old promise rejects and a new pending promise is created', async () => {
        const completion = new Completion();
        const oldPromise = completion.promise;
        const oldAssertion = expect(oldPromise).rejects.toBe('cycle replaced');

        completion.restart('cycle replaced');
        const nextPromise = completion.promise;
        expect(nextPromise).not.toBe(oldPromise);
        expect(completion.isSettled).toBe(false);

        completion.resolve();
        await oldAssertion;
        await expect(nextPromise).resolves.toBeUndefined();
      });
    });
  });

  describe('When a completion has settled', () => {
    describe('And When a pending cycle is requested', () => {
      it('Then a fresh promise can resolve', async () => {
        const completion = new Completion();
        completion.resolve();
        await expect(completion.promise).resolves.toBeUndefined();

        completion.ensurePending();
        expect(completion.isSettled).toBe(false);
        const pending = completion.promise;
        completion.resolve();
        await expect(pending).resolves.toBeUndefined();
      });
    });
  });
});
