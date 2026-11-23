import { ENGINE_CATALOG, REPETITIONS, WARMUP_DURATION_MS, WARMUP_ORDER, WARMUP_TARGETS } from './config';
import type { BenchmarkEnvironment } from './environment';
import { awaitWithAbort, calibrateFrameInterval, isAbortError, measureRun, throwIfAborted } from './measure';
import type { FrameCalibration, MeasureRunOptions } from './measure';
import { loadCompetitorModules } from './runners';
import { engineName, engineRunOrder } from './statistics';
import type {
  BenchmarkMessages,
  BenchmarkRendererId,
  BrowserRunResult,
  EngineId,
  EngineModules,
  EngineStatus,
  ScenarioId,
} from './types';

export interface SessionConfiguration {
  scenario: ScenarioId;
  /** Label shown in the per-repetition status line. */
  scenarioLabel: string;
  renderer: BenchmarkRendererId;
  targetCount: number;
  durationMs: number;
}

/** What the session tells its owner while it runs. All callbacks are optional notifications, never questions. */
export interface SessionCallbacks {
  status(message: string): void;
  engineStatuses(statuses: Record<EngineId, EngineStatus>): void;
  currentEngine(engine: EngineId | null): void;
  /** One more warm-up or measured run has finished. */
  progress(): void;
  calibrated(calibration: FrameCalibration): void;
  result(engine: EngineId, run: BrowserRunResult): void;
}

export interface SessionDependencies {
  loadModules(messages: BenchmarkMessages): Promise<EngineModules>;
  calibrate(signal: AbortSignal, env: BenchmarkEnvironment): Promise<FrameCalibration>;
  measure(options: MeasureRunOptions): Promise<BrowserRunResult>;
}

const defaultDependencies: SessionDependencies = {
  loadModules: (messages) => loadCompetitorModules(messages),
  calibrate: calibrateFrameInterval,
  measure: measureRun,
};

export interface SessionOptions {
  configuration: SessionConfiguration;
  host: () => HTMLElement | null;
  messages: BenchmarkMessages;
  env: BenchmarkEnvironment;
  signal: AbortSignal;
  callbacks: SessionCallbacks;
  dependencies?: SessionDependencies;
}

export type SessionOutcome =
  | { outcome: 'complete' }
  | { outcome: 'canceled' }
  | { outcome: 'error'; message: string; engine: EngineId | null };

const allEngines = (status: EngineStatus): Record<EngineId, EngineStatus> => ({
  're-flux': status,
  gsap: status,
  animejs: status,
});

/**
 * Orchestrate a whole comparison: load the pinned competitors, calibrate the frame cadence, warm every engine up, then
 * run `REPETITIONS` measured repetitions with a rotating engine order, reporting each result as it lands. Never throws:
 * cancellation and failures are returned as the outcome (completed runs stay with the caller).
 */
export async function runBenchmarkSession(options: SessionOptions): Promise<SessionOutcome> {
  const { configuration, messages, env, signal, callbacks } = options;
  const dependencies = options.dependencies ?? defaultDependencies;
  let currentEngine: EngineId | null = null;
  const setEngine = (engine: EngineId | null) => {
    currentEngine = engine;
    callbacks.currentEngine(engine);
  };
  const measure = (
    engine: EngineId,
    modules: EngineModules,
    reference: number,
    targetCount: number,
    durationMs: number,
    repetition: number,
  ) =>
    dependencies.measure({
      engine,
      renderer: configuration.renderer,
      scenario: configuration.scenario,
      targetCount,
      durationMs,
      repetition,
      modules,
      signal,
      frameIntervalReferenceMs: reference,
      host: options.host(),
      messages,
      env,
    });

  try {
    callbacks.engineStatuses(allEngines('loading'));
    callbacks.status(messages.loadingPinnedComparisonEnginesNetworkLoadingIsExcludedFromTheResults);
    const modules = await awaitWithAbort(dependencies.loadModules(messages), signal);
    throwIfAborted(signal);

    callbacks.status(messages.calibratingTheBrowserFrameCadence);
    const calibration = await dependencies.calibrate(signal, env);
    callbacks.calibrated(calibration);

    callbacks.status(messages.warmingUpEachEngineWithASmallUnreportedRun);
    const statuses = allEngines('loading');
    for (const engine of WARMUP_ORDER) {
      throwIfAborted(signal);
      setEngine(engine);
      statuses[engine] = 'warming-up';
      callbacks.engineStatuses({ ...statuses });
      await measure(engine, modules, calibration.intervalMs, WARMUP_TARGETS, WARMUP_DURATION_MS, 0);
      callbacks.progress();
    }

    callbacks.engineStatuses(allEngines('running'));
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      for (const engine of engineRunOrder(repetition - 1)) {
        throwIfAborted(signal);
        setEngine(engine);
        callbacks.status(
          messages.repetitionOf
            .replace('{current}', String(repetition))
            .replace('{total}', String(REPETITIONS))
            .replace('{engine}', engineName(engine))
            .replace('{scenario}', configuration.scenarioLabel),
        );
        const run = await measure(
          engine,
          modules,
          calibration.intervalMs,
          configuration.targetCount,
          configuration.durationMs,
          repetition,
        );
        callbacks.result(engine, run);
        callbacks.progress();
      }
    }

    callbacks.engineStatuses(allEngines('complete'));
    callbacks.status(messages.allMeasuredRunsComplete.replace('{count}', String(REPETITIONS * ENGINE_CATALOG.length)));
    return { outcome: 'complete' };
  } catch (error) {
    if (isAbortError(error)) {
      callbacks.status(messages.benchmarkCanceledCompletedRunsRemainAvailableBelow);
      return { outcome: 'canceled' };
    }
    callbacks.status(messages.theComparisonDidNotCompleteCheckConnectivityAndTryAgain);
    return {
      outcome: 'error',
      message: error instanceof Error ? error.message : messages.anUnknownErrorOccurredWhileRunningTheBenchmark,
      engine: currentEngine,
    };
  } finally {
    setEngine(null);
  }
}
