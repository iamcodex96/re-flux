import { describe, expect, it } from '@jest/globals';
import {
  engineName,
  engineRunOrder,
  estimateMissedRefreshes,
  median,
  percentile,
  round,
  summarizeEngine,
} from '../../apps/docs/src/benchmarks/statistics';
import type { BrowserRunResult, EngineMeta } from '../../apps/docs/src/benchmarks/types';

const meta: EngineMeta = { id: 'gsap', name: 'GSAP', version: '3.15.0', subtitle: 'tween', href: 'https://gsap.com/' };

function run(overrides: Partial<BrowserRunResult> = {}, p95: number | null = 1): BrowserRunResult {
  return {
    engine: 'gsap',
    repetition: 1,
    scenario: 'shared-renderer',
    renderer: 'dom',
    targetCount: 100,
    configuredDurationMs: 1000,
    completed: true,
    elapsedMs: 1000,
    renderCallbacks: 60,
    renderedTargetsPerCallback: 100,
    rendererWork: { medianMs: 0.5, p95Ms: p95, p99Ms: 2, totalMs: 30 },
    frameIntervals: {
      sampleCount: 60,
      medianMs: 16.7,
      p95Ms: 17,
      p99Ms: 18,
      maxMs: 20,
      stretchedFrameCount: 1,
      estimatedMissedRefreshCount: 2,
    },
    longTaskCount: 0,
    longTaskDurationMs: 0,
    longAnimationFrameCount: 0,
    cleanupPassed: true,
    ...overrides,
  };
}

describe('Given the benchmark statistics', () => {
  describe('When values are rounded, medianed and ranked', () => {
    it('Then round() keeps three digits by default and median() averages the middle pair', () => {
      expect(round(1.23456)).toBe(1.235);
      expect(round(1.23456, 1)).toBe(1.2);
      expect(median([3, 1, 2])).toBe(2);
      expect(median([4, 1, 2, 3])).toBe(2.5);
      expect(median([])).toBeNull();
    });

    it('Then percentile() uses the nearest rank and clamps the quantile into the sample', () => {
      const values = Array.from({ length: 100 }, (_, index) => index + 1);
      expect(percentile(values, 0.95)).toBe(95);
      expect(percentile(values, 0.99)).toBe(99);
      expect(percentile(values, 0)).toBe(1);
      expect(percentile(values, 1)).toBe(100);
      expect(percentile([7], 0.99)).toBe(7);
      expect(percentile([], 0.5)).toBeNull();
    });

    it('Then neither mutates its input', () => {
      const values = [3, 1, 2];
      median(values);
      percentile(values, 0.5);
      expect(values).toEqual([3, 1, 2]);
    });
  });

  describe('When a callback interval is compared with the calibrated refresh interval', () => {
    it('Then it counts whole skipped refreshes and ignores unusable input', () => {
      expect(estimateMissedRefreshes(16.7, 16.7)).toBe(0);
      expect(estimateMissedRefreshes(33.4, 16.7)).toBe(1);
      expect(estimateMissedRefreshes(50.1, 16.7)).toBe(2);
      expect(estimateMissedRefreshes(8, 16.7)).toBe(0);
      expect(estimateMissedRefreshes(Number.NaN, 16.7)).toBe(0);
      expect(estimateMissedRefreshes(33, 0)).toBe(0);
    });
  });

  describe('When the engines take turns', () => {
    it('Then the run order rotates through three permutations so no engine is always first', () => {
      const orders = [0, 1, 2, 3].map((index) => engineRunOrder(index));
      expect(orders[0]).toEqual(['re-flux', 'gsap', 'animejs']);
      expect(orders[1]).toEqual(['animejs', 'gsap', 're-flux']);
      expect(orders[2]).toEqual(['gsap', 're-flux', 'animejs']);
      expect(orders[3]).toEqual(orders[0]);
      expect(new Set(orders.slice(0, 3).map((order) => order[0])).size).toBe(3);
      for (const order of orders) expect([...order].sort()).toEqual(['animejs', 'gsap', 're-flux']);
    });

    it('Then engineName() resolves the display name and falls back to the id', () => {
      expect(engineName('re-flux')).toBe('re;Flux');
      expect(engineName('animejs')).toBe('Anime.js');
      expect(engineName('nope' as never)).toBe('nope');
    });
  });

  describe('When an engine is summarized', () => {
    it('Then every metric is the median over the measured runs', () => {
      const summary = summarizeEngine(meta, [
        run({ elapsedMs: 1000, renderCallbacks: 58 }, 1),
        run({ elapsedMs: 1010, renderCallbacks: 60 }, 3),
        run({ elapsedMs: 1030, renderCallbacks: 62 }, 2),
      ]);

      expect(summary).toMatchObject({
        id: 'gsap',
        name: 'GSAP',
        version: '3.15.0',
        medianCompletionMs: 1010,
        medianRendererP95Ms: 2,
        medianRenderCallbacks: 60,
        medianFrameP95Ms: 17,
        medianFrameIntervalMs: 16.7,
        cleanupPassed: true,
      });
      expect(summary.runs).toHaveLength(3);
    });

    it('Then diagnostics the browser could not report stay null instead of becoming zero', () => {
      const summary = summarizeEngine(meta, [
        run({ longTaskCount: null, longAnimationFrameCount: null, cleanupPassed: null }, null),
      ]);

      expect(summary.medianLongTaskCount).toBeNull();
      expect(summary.medianLongAnimationFrameCount).toBeNull();
      expect(summary.medianRendererP95Ms).toBeNull();
      expect(summary.cleanupPassed).toBeNull();
    });

    it('Then the cleanup probe fails the engine if any reporting run failed, ignoring runs without a probe', () => {
      expect(summarizeEngine(meta, [run({ cleanupPassed: true }), run({ cleanupPassed: false })]).cleanupPassed).toBe(
        false,
      );
      expect(summarizeEngine(meta, [run({ cleanupPassed: true }), run({ cleanupPassed: null })]).cleanupPassed).toBe(
        true,
      );
    });

    it('Then an engine without runs has zero completion time and null metrics', () => {
      const summary = summarizeEngine(meta, []);

      expect(summary.medianCompletionMs).toBe(0);
      expect(summary.medianFrameP95Ms).toBeNull();
      expect(summary.cleanupPassed).toBeNull();
    });
  });
});
