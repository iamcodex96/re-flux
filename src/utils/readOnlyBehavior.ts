import { Observable, type BehaviorSubject } from 'rxjs';

/**
 * Observable state view with a read-only synchronous snapshot.
 * It intentionally omits BehaviorSubject mutation methods such as next() and complete().
 */
export interface ReadonlyBehaviorObservable<T> extends Observable<T> {
  readonly value: T;
}

export function readonlyBehavior<T>(source: BehaviorSubject<T>): ReadonlyBehaviorObservable<T> {
  const view = new Observable<T>((subscriber) => source.subscribe(subscriber)) as ReadonlyBehaviorObservable<T>;
  Object.defineProperty(view, 'value', {
    enumerable: true,
    configurable: false,
    get: () => source.value,
  });
  return view;
}
