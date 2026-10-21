import { afterEach, describe, expect, it } from '@jest/globals';
import { MotionPreferences } from '../../src/core/MotionPreferences.js';

class MockMediaQueryList extends EventTarget {
  private currentMatches = false;
  readonly media = '(prefers-reduced-motion: reduce)';
  onchange: ((this: MediaQueryList, ev: MediaQueryListEvent) => unknown) | null = null;

  get matches(): boolean { return this.currentMatches; }
  setMatches(value: boolean): void {
    this.currentMatches = value;
    this.dispatchEvent(new Event('change'));
  }
}

describe('Given MotionPreferences', () => {
  let preferences: MotionPreferences | null = null;
  afterEach(() => {
    preferences?.destroy();
    preferences = null;
  });

  describe('When motion preferences are configured', () => {
    describe('And When the instance is destroyed', () => {
      it('Then it tracks reduced-motion and document visibility changes and removes listeners on destroy', () => {
        const media = new MockMediaQueryList();
        const docTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
        let visibilityState: DocumentVisibilityState = 'visible';
        Object.defineProperty(docTarget, 'visibilityState', { configurable: true, get: () => visibilityState });
        const documentRef = docTarget as unknown as Document;
        const windowRef = {
          document: documentRef,
          matchMedia: () => media as unknown as MediaQueryList,
        } as unknown as Window;
        preferences = new MotionPreferences({ window: windowRef, document: documentRef, mediaQueryList: media as unknown as MediaQueryList });

        const states: Array<{ reducedMotion: boolean; visible: boolean }> = [];
        const subscription = preferences.state$.subscribe((state) => states.push(state));
        media.setMatches(true);
        media.setMatches(false);
        visibilityState = 'hidden';
        docTarget.dispatchEvent(new Event('visibilitychange'));

        expect(states).toEqual([
          { reducedMotion: false, visible: true },
          { reducedMotion: true, visible: true },
          { reducedMotion: false, visible: true },
          { reducedMotion: false, visible: false },
        ]);
        preferences.destroy();
        media.setMatches(false);
        visibilityState = 'visible';
        docTarget.dispatchEvent(new Event('visibilitychange'));
        expect(states).toHaveLength(4);
        subscription.unsubscribe();
      });
    });
    describe('And When browser APIs are unavailable', () => {
      it('Then it uses a safe, visible, non-reduced default when browser APIs are unavailable', () => {
        preferences = new MotionPreferences();
        expect(preferences.snapshot).toEqual({ reducedMotion: false, visible: true });
      });
    });
  });
});
