import type { BenchmarkReport } from './types';

/** A performance entry the benchmark cares about (long tasks and long animation frames). */
export interface TimingEntry {
  readonly startTime: number;
  readonly duration: number;
}

/**
 * Everything the benchmark engine needs from the browser. The real implementation wraps `window`, `performance` and
 * `PerformanceObserver`; tests pass a deterministic one so runs, timeouts and cleanup probes can be driven by hand.
 */
export interface BenchmarkEnvironment {
  now(): number;
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(id: number): void;
  setTimer(callback: () => void, milliseconds: number): number;
  clearTimer(id: number): void;
  isVisible(): boolean;
  /** Entry types the browser can observe (`PerformanceObserver.supportedEntryTypes`). */
  supportedEntryTypes(): readonly string[];
  /** Start observing; throws when the browser rejects the type. */
  observeEntries(type: 'longtask' | 'long-animation-frame', onEntries: (entries: readonly TimingEntry[]) => void): { disconnect(): void };
  describe(): BenchmarkReport['environment'];
}

export function browserEnvironment(): BenchmarkEnvironment {
  return {
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    setTimer: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    clearTimer: (id) => window.clearTimeout(id),
    isVisible: () => document.visibilityState === 'visible',
    supportedEntryTypes: () => (typeof PerformanceObserver !== 'undefined' ? (PerformanceObserver.supportedEntryTypes ?? []) : []),
    observeEntries(type, onEntries) {
      const observer = new PerformanceObserver((list) => onEntries(list.getEntries()));
      try {
        observer.observe({ type, buffered: false } as PerformanceObserverInit);
      } catch (error) {
        observer.disconnect();
        throw error;
      }
      return observer;
    },
    describe: () => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
      devicePixelRatio: window.devicePixelRatio,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      visibilityState: document.visibilityState,
    }),
  };
}
