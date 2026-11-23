import { describe, expect, it } from '@jest/globals';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { readonlyBehavior } from '../../src/utils/readOnlyBehavior.js';

/** PERF-011 characterization of the read-only view that Animation, Timeline and Tween expose as progress$ / state$ / value$. */
describe('Given a read-only BehaviorSubject view', () => {
  describe('When it is used as an Observable', () => {
    it('Then it is an Observable, replays the current value to each subscriber and works with pipe()', () => {
      const source = new BehaviorSubject(1);
      const view = readonlyBehavior(source);
      const doubled: number[] = [];
      const plain: number[] = [];

      expect(view).toBeInstanceOf(Observable);
      const first = view.pipe(map((value) => value * 2)).subscribe((value) => doubled.push(value));
      source.next(5);
      const second = view.subscribe((value) => plain.push(value));
      source.next(6);

      expect(doubled).toEqual([2, 10, 12]);
      expect(plain).toEqual([5, 6]);
      first.unsubscribe();
      second.unsubscribe();
      expect(source.observed).toBe(false);
    });

    it('Then completion and errors of the source reach subscribers', () => {
      const source = new BehaviorSubject('a');
      const view = readonlyBehavior(source);
      const events: string[] = [];
      view.subscribe({ next: (value) => events.push(`next:${value}`), complete: () => events.push('complete') });
      source.complete();

      const failing = new BehaviorSubject(1);
      const failures: unknown[] = [];
      readonlyBehavior(failing).subscribe({ error: (error: unknown) => failures.push(error) });
      failing.error(new Error('boom'));

      expect(events).toEqual(['next:a', 'complete']);
      expect(failures).toHaveLength(1);
    });
  });

  describe('When its value is read or written', () => {
    it('Then value follows the source, cannot be assigned, and no mutation method is exposed', () => {
      const source = new BehaviorSubject({ n: 1 });
      const view = readonlyBehavior(source);

      expect(view.value).toBe(source.value);
      source.next({ n: 2 });
      expect(view.value).toEqual({ n: 2 });
      expect(() => {
        (view as { value: unknown }).value = { n: 3 };
      }).toThrow(TypeError);
      expect(view.value).toEqual({ n: 2 });
      for (const method of ['next', 'error', 'complete', 'getValue']) expect(Reflect.get(view, method)).toBeUndefined();
    });

    it('Then reading value after the source errored throws like the source does', () => {
      const source = new BehaviorSubject(1);
      const view = readonlyBehavior(source);
      source.error(new Error('failed'));
      expect(() => view.value).toThrow('failed');
    });

    it('Then each view is independent of the others over the same source', () => {
      const source = new BehaviorSubject(0);
      const a = readonlyBehavior(source);
      const b = readonlyBehavior(source);
      expect(a).not.toBe(b);
      source.next(7);
      expect([a.value, b.value]).toEqual([7, 7]);
    });
  });
});
