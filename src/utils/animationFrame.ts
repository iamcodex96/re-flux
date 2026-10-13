import { Observable, share } from 'rxjs';

/**
 * Creates an Observable of RAF timestamps. Each isolated subscription owns one RAF;
 * the exported `animationFrame$` source shares a single loop between consumers.
 */
export function createAnimationFrameObservable(): Observable<number> {
  return new Observable<number>((subscriber) => {
    if (typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') {
      subscriber.error(new Error('requestAnimationFrame is not available in this environment.'));
      return undefined;
    }

    let frameId: number | null = null;
    const tick = (timestamp: number): void => {
      if (subscriber.closed) return;
      subscriber.next(timestamp);
      if (!subscriber.closed) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    };
  });
}

/** Global source: RxJS runs one RAF loop while at least one subscriber exists. */
export const animationFrame$ = createAnimationFrameObservable().pipe(share());
