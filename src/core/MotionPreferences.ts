import { BehaviorSubject } from 'rxjs';
import type { Observable } from 'rxjs';

/** Current browser motion and visibility preferences. */
export interface MotionPreferencesSnapshot {
  readonly reducedMotion: boolean;
  readonly visible: boolean;
}

/** Minimal read-only contract accepted by animations; makes custom policies and tests easy. */
export interface MotionPreferencesSource {
  readonly state$: Observable<MotionPreferencesSnapshot>;
  readonly snapshot: MotionPreferencesSnapshot;
}

export interface MotionPreferencesOptions {
  /** Override the browser window, useful for iframes and deterministic tests. */
  readonly window?: Window;
  /** Override the document that controls page visibility. */
  readonly document?: Document;
  /** Override matchMedia's reduced-motion query. */
  readonly mediaQueryList?: MediaQueryList;
}

/**
 * Observes `prefers-reduced-motion` and page visibility without imposing a global
 * animation policy. Pass this instance only to the animations/streams that should
 * respect these preferences.
 */
export class MotionPreferences implements MotionPreferencesSource {
  private readonly subject: BehaviorSubject<MotionPreferencesSnapshot>;
  private readonly documentRef: Document | undefined;
  private readonly mediaQuery: MediaQueryList | null;
  private destroyed = false;

  readonly state$: Observable<MotionPreferencesSnapshot>;

  constructor(options: MotionPreferencesOptions = {}) {
    const windowRef = options.window ?? (typeof window !== 'undefined' ? window : undefined);
    this.documentRef = options.document ?? windowRef?.document
      ?? (typeof document !== 'undefined' ? document : undefined);
    this.mediaQuery = options.mediaQueryList ?? windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
    this.subject = new BehaviorSubject<MotionPreferencesSnapshot>(Object.freeze({
      reducedMotion: this.mediaQuery?.matches ?? false,
      visible: this.documentRef?.visibilityState !== 'hidden',
    }));
    this.state$ = this.subject.asObservable();
    this.mediaQuery?.addEventListener?.('change', this.handleMediaChange);
    // Old Safari versions exposed addListener before EventTarget methods existed.
    if (this.mediaQuery && !this.mediaQuery.addEventListener) this.mediaQuery.addListener?.(this.handleMediaChange);
    this.documentRef?.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  get snapshot(): MotionPreferencesSnapshot {
    return this.subject.value;
  }

  /** Removes browser listeners. Safe to call more than once. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.mediaQuery?.removeEventListener?.('change', this.handleMediaChange);
    if (this.mediaQuery && !this.mediaQuery.removeEventListener) this.mediaQuery.removeListener?.(this.handleMediaChange);
    this.documentRef?.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.subject.complete();
  }

  private readonly handleMediaChange = (event?: MediaQueryListEvent): void => {
    this.update({ reducedMotion: event?.matches ?? this.mediaQuery?.matches ?? false });
  };

  private readonly handleVisibilityChange = (): void => {
    this.update({ visible: this.documentRef?.visibilityState !== 'hidden' });
  };

  private update(patch: Partial<MotionPreferencesSnapshot>): void {
    if (this.destroyed) return;
    const previous = this.subject.value;
    const next = Object.freeze({
      reducedMotion: patch.reducedMotion ?? previous.reducedMotion,
      visible: patch.visible ?? previous.visible,
    });
    if (next.reducedMotion !== previous.reducedMotion || next.visible !== previous.visible) this.subject.next(next);
  }
}
