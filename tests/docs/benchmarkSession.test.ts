import { describe, expect, it } from '@jest/globals';
import { REPETITIONS, WARMUP_DURATION_MS, WARMUP_ORDER, WARMUP_TARGETS } from '../../apps/docs/src/benchmarks/config';
import type { MeasureRunOptions } from '../../apps/docs/src/benchmarks/measure';
import {
  runBenchmarkSession,
  type SessionCallbacks,
  type SessionDependencies,
} from '../../apps/docs/src/benchmarks/session';
import type { BrowserRunResult, EngineId, EngineModules, EngineStatus } from '../../apps/docs/src/benchmarks/types';
import { FakeBenchmarkEnvironment } from '../helpers/benchmarkEnvironment';
import { messages } from '../helpers/benchmarkMessages';

const modules = {} as EngineModules;

function fakeRun(options: MeasureRunOptions): BrowserRunResult {
  return {
    engine: options.engine,
    repetition: options.repetition,
    scenario: options.scenario,
    renderer: options.renderer,
    targetCount: options.targetCount,
    configuredDurationMs: options.durationMs,
    completed: true,
    elapsedMs: options.durationMs,
    renderCallbacks: 0,
    renderedTargetsPerCallback: 0,
    rendererWork: { medianMs: null, p95Ms: null, p99Ms: null, totalMs: null },
    frameIntervals: {
      sampleCount: 0,
      medianMs: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      stretchedFrameCount: 0,
      estimatedMissedRefreshCount: 0,
    },
    longTaskCount: null,
    longTaskDurationMs: null,
    longAnimationFrameCount: null,
    cleanupPassed: null,
  };
}

interface Recording {
  events: string[];
  measured: MeasureRunOptions[];
  results: Array<{ engine: EngineId; run: BrowserRunResult }>;
  engineStatuses: Array<Record<EngineId, EngineStatus>>;
  statuses: string[];
  progress: number;
  engines: Array<EngineId | null>;
}

function setup(overrides: Partial<SessionDependencies> = {}) {
  const recording: Recording = {
    events: [],
    measured: [],
    results: [],
    engineStatuses: [],
    statuses: [],
    progress: 0,
    engines: [],
  };
  const dependencies: SessionDependencies = {
    loadModules: async () => {
      recording.events.push('load');
      return modules;
    },
    calibrate: async () => {
      recording.events.push('calibrate');
      return { intervalMs: 8.33, sampleCount: 60, source: 'raf-calibration' };
    },
    measure: async (options) => {
      recording.measured.push(options);
      recording.events.push(`measure:${options.engine}:${options.repetition}`);
      return fakeRun(options);
    },
    ...overrides,
  };
  const callbacks: SessionCallbacks = {
    status: (message) => recording.statuses.push(message),
    engineStatuses: (statuses) => recording.engineStatuses.push({ ...statuses }),
    currentEngine: (engine) => recording.engines.push(engine),
    progress: () => {
      recording.progress += 1;
    },
    calibrated: (calibration) => recording.events.push(`calibrated:${calibration.intervalMs}`),
    result: (engine, run) => recording.results.push({ engine, run }),
  };
  const controller = new AbortController();
  const host = {} as HTMLElement;
  const run = () =>
    runBenchmarkSession({
      configuration: {
        scenario: 'shared-renderer',
        scenarioLabel: 'Shared',
        renderer: 'svg',
        targetCount: 250,
        durationMs: 1500,
      },
      host: () => host,
      messages,
      env: new FakeBenchmarkEnvironment(),
      signal: controller.signal,
      callbacks,
      dependencies,
    });
  return { recording, controller, run, host };
}

describe('Given a benchmark session', () => {
  describe('When it runs to the end', () => {
    it('Then it loads the engines, calibrates, warms every engine up, then measures every repetition', async () => {
      const { recording, run } = setup();

      expect(await run()).toEqual({ outcome: 'complete' });

      expect(REPETITIONS).toBe(10);
      expect(recording.events.slice(0, 3)).toEqual(['load', 'calibrate', 'calibrated:8.33']);
      const warmups = recording.measured.slice(0, 3);
      expect(warmups.map((options) => options.engine)).toEqual([...WARMUP_ORDER]);
      expect(
        warmups.every(
          (options) =>
            options.targetCount === WARMUP_TARGETS &&
            options.durationMs === WARMUP_DURATION_MS &&
            options.repetition === 0,
        ),
      ).toBe(true);
      const measured = recording.measured.slice(3);
      expect(measured).toHaveLength(REPETITIONS * 3);
      expect(measured.every((options) => options.targetCount === 250 && options.durationMs === 1500)).toBe(true);
      expect(recording.progress).toBe(3 + REPETITIONS * 3);
    });

    it('Then every measured run uses the calibrated frame interval, the chosen renderer and the host element', async () => {
      const { recording, run, host } = setup();
      await run();

      for (const options of recording.measured) {
        expect(options.frameIntervalReferenceMs).toBe(8.33);
        expect(options.renderer).toBe('svg');
        expect(options.scenario).toBe('shared-renderer');
        expect(options.host).toBe(host);
      }
    });

    it('Then each repetition runs the three engines once, in an order that rotates', async () => {
      const { recording, run } = setup();
      await run();

      const byRepetition = new Map<number, EngineId[]>();
      for (const { engine, run: result } of recording.results) {
        byRepetition.set(result.repetition, [...(byRepetition.get(result.repetition) ?? []), engine]);
      }
      expect([...byRepetition.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const order of byRepetition.values()) expect([...order].sort()).toEqual(['animejs', 'gsap', 're-flux']);
      expect(byRepetition.get(1)).toEqual(['re-flux', 'gsap', 'animejs']);
      expect(byRepetition.get(2)).toEqual(['animejs', 'gsap', 're-flux']);
      expect(byRepetition.get(4)).toEqual(byRepetition.get(1));
      expect(new Set([...byRepetition.values()].slice(0, 3).map((order) => order[0])).size).toBe(3);
    });

    it('Then it reports progress and status as it goes and ends with every engine complete', async () => {
      const { recording, run } = setup();
      await run();

      expect(recording.statuses[0]).toBe('loadingPinnedComparisonEnginesNetworkLoadingIsExcludedFromTheResults');
      expect(recording.statuses).toContain('calibratingTheBrowserFrameCadence');
      expect(recording.statuses).toContain('warmingUpEachEngineWithASmallUnreportedRun');
      expect(recording.statuses).toContain('rep 1/10 re;Flux Shared');
      expect(recording.statuses.at(-1)).toBe('done 30');
      expect(recording.engineStatuses[0]).toEqual({ 're-flux': 'loading', gsap: 'loading', animejs: 'loading' });
      expect(recording.engineStatuses.at(-1)).toEqual({ 're-flux': 'complete', gsap: 'complete', animejs: 'complete' });
      expect(recording.engines.at(-1)).toBeNull();
    });

    it('Then warm-up runs are not reported as results', async () => {
      const { recording, run } = setup();
      await run();

      expect(recording.results).toHaveLength(REPETITIONS * 3);
      expect(recording.results.every(({ run: result }) => result.repetition >= 1)).toBe(true);
    });
  });

  describe('When the session is canceled', () => {
    it('Then it stops, keeps the runs already reported and says so', async () => {
      const { recording, controller, run } = setup({
        measure: async function measure(options) {
          if (options.repetition === 2) controller.abort();
          if (options.signal.aborted) throw new DOMException('Benchmark canceled.', 'AbortError');
          return fakeRun(options);
        },
      });
      const outcome = await run();

      expect(outcome).toEqual({ outcome: 'canceled' });
      expect(recording.statuses.at(-1)).toBe('benchmarkCanceledCompletedRunsRemainAvailableBelow');
      expect(recording.engines.at(-1)).toBeNull();
    });

    it('Then a signal aborted before the start never calls the engines', async () => {
      const { recording, controller, run } = setup();
      controller.abort();

      expect(await run()).toEqual({ outcome: 'canceled' });
      expect(recording.measured).toHaveLength(0);
    });
  });

  describe('When a run fails', () => {
    it('Then the session returns the error and the engine that was running', async () => {
      const { recording, run } = setup({
        measure: async (options) => {
          if (options.engine === 'gsap' && options.repetition === 1)
            throw new Error('GSAP did not complete within the expected time.');
          return fakeRun(options);
        },
      });
      const outcome = await run();

      expect(outcome).toEqual({
        outcome: 'error',
        message: 'GSAP did not complete within the expected time.',
        engine: 'gsap',
      });
      expect(recording.statuses.at(-1)).toBe('theComparisonDidNotCompleteCheckConnectivityAndTryAgain');
    });

    it('Then a non-Error failure uses the generic message', async () => {
      const { run } = setup({
        loadModules: async () => {
          throw 'offline';
        },
      });

      expect(await run()).toEqual({
        outcome: 'error',
        message: 'anUnknownErrorOccurredWhileRunningTheBenchmark',
        engine: null,
      });
    });
  });
});
