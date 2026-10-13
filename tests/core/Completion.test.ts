import { describe, expect, it } from '@jest/globals';
import { Completion } from '../../src/core/Completion.js';

describe('Completion', () => {
  it('resolves once and ignores later settlement attempts', async () => {
    const completion = new Completion();
    const promise = completion.promise;

    completion.resolve();
    completion.reject(new Error('ignored after resolve'));

    await expect(promise).resolves.toBeUndefined();
    expect(completion.isSettled).toBe(true);
  });

  it('rejects the old cycle and creates a new pending promise on restart', async () => {
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

  it('creates a pending cycle after a settled promise when requested', async () => {
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
