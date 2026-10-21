import { describe, expect, it } from '@jest/globals';
import { BehaviorSubject } from 'rxjs';
import { readonlyBehavior } from '../../src/utils/readOnlyBehavior.js';

describe('Given readonlyBehavior', () => {
  describe('When a read-only BehaviorSubject view is created', () => {
    describe('And When a BehaviorSubject is wrapped in a read-only view', () => {
      it('Then it preserves BehaviorSubject snapshot and emissions without exposing mutation methods', () => {
        const source = new BehaviorSubject(1);
        const view = readonlyBehavior(source);
        const received: number[] = [];
        const subscription = view.subscribe((value) => received.push(value));

        expect(view.value).toBe(1);
        source.next(2);
        expect(view.value).toBe(2);
        expect(received).toEqual([1, 2]);
        expect(Reflect.get(view, 'next')).toBeUndefined();
        expect(Reflect.get(view, 'complete')).toBeUndefined();

        subscription.unsubscribe();
        source.complete();
      });
    });
  });
});
