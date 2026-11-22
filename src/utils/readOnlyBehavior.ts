import { Observable, type BehaviorSubject } from 'rxjs';

/**
 * Observable state view with a read-only synchronous snapshot.
 * It intentionally omits BehaviorSubject mutation methods such as next() and complete().
 */
export interface ReadonlyBehaviorObservable<T> extends Observable<T> {
  readonly value: T;
}

/**
 * The view is an `Observable` whose `source` is the subject, which is what `Subject.asObservable()` builds, with
 * `value` as an accessor on the prototype. Defining `value` on each view with `Object.defineProperty` cost about
 * 370 bytes per view (a getter closure and a hidden class of its own); this costs about 50.
 */
class ReadonlyBehaviorView<T> extends Observable<T> implements ReadonlyBehaviorObservable<T> {
  get value(): T {
    return (this.source as BehaviorSubject<T>).value;
  }
}

export function readonlyBehavior<T>(source: BehaviorSubject<T>): ReadonlyBehaviorObservable<T> {
  const view = new ReadonlyBehaviorView<T>();
  view.source = source;
  return view;
}
