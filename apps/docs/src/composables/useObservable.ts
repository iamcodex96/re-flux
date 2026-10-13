import { onScopeDispose, ref, type Ref } from 'vue';
import type { Observable } from 'rxjs';

/** RxJS → Vue bridge: keeps a ref in sync with the latest value and disposes the subscription when the scope is destroyed. */
export function useObservable<T>(source$: Observable<T>, initialValue: T): Ref<T> {
  const value = ref(initialValue) as Ref<T>;
  const subscription = source$.subscribe({ next: (nextValue) => { value.value = nextValue; } });
  onScopeDispose(() => subscription.unsubscribe());
  return value;
}
