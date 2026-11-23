import { describe, expect, it } from '@jest/globals';
import { buildBenchmarkReport, type ReportInput } from '../../apps/docs/src/benchmarks/report';
import { ENGINE_CATALOG } from '../../apps/docs/src/benchmarks/config';
import { summarizeEngine } from '../../apps/docs/src/benchmarks/statistics';
import type { BrowserRunResult, EngineMeta } from '../../apps/docs/src/benchmarks/types';
import { FakeBenchmarkEnvironment } from '../helpers/benchmarkEnvironment';
import { messages } from '../helpers/benchmarkMessages';

const engines: EngineMeta[] = ENGINE_CATALOG.map((engine) => ({
  ...engine,
  version: engine.id === 're-flux' ? 'site' : engine.id === 'gsap' ? '3.15.0' : '4.5.0',
  subtitle: '',
}));

function runFor(engine: EngineMeta['id']): BrowserRunResult {
  return {
    engine,
    repetition: 1,
    scenario: 'shared-renderer',
    renderer: 'canvas',
    targetCount: 500,
    configuredDurationMs: 1500,
    completed: true,
    elapsedMs: 1500,
    renderCallbacks: 90,
    renderedTargetsPerCallback: 500,
    rendererWork: { medianMs: 1, p95Ms: 2, p99Ms: 3, totalMs: 90 },
    frameIntervals: {
      sampleCount: 90,
      medianMs: 16.7,
      p95Ms: 17,
      p99Ms: 18,
      maxMs: 19,
      stretchedFrameCount: 0,
      estimatedMissedRefreshCount: 0,
    },
    longTaskCount: null,
    longTaskDurationMs: null,
    longAnimationFrameCount: null,
    cleanupPassed: true,
  };
}

function input(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    messages,
    env: new FakeBenchmarkEnvironment(),
    engines,
    summaries: engines.map((engine) => summarizeEngine(engine, [runFor(engine.id)])),
    scenario: 'shared-renderer',
    renderer: 'canvas',
    targetCount: 500,
    durationMs: 1500,
    frameBudgetReferenceMs: 16.6667,
    frameBudgetSource: 'raf-calibration',
    calibrationSamples: 58,
    now: new Date('2026-11-23T00:00:00.000Z'),
    ...overrides,
  };
}

describe('Given the exported benchmark report', () => {
  it('Then it is schema version 2 and records the configuration and frame calibration', () => {
    const report = buildBenchmarkReport(input());

    expect(report.schemaVersion).toBe(2);
    expect(report.benchmark).toBe('publicBrowserBenchmark');
    expect(report.createdAt).toBe('2026-11-23T00:00:00.000Z');
    expect(report.configuration).toEqual({
      scenario: 'shared-renderer',
      renderer: 'canvas',
      targetCount: 500,
      durationMs: 1500,
      repetitions: 10,
      frameBudgetReferenceMs: 16.6667,
      frameBudgetSource: 'raf-calibration',
      estimatedRafCadenceHz: 60,
      calibrationSamples: 58,
      stretchedFrameThresholdMs: 25,
    });
    expect(report.environment).toMatchObject({
      userAgent: 'jest',
      devicePixelRatio: 2,
      viewport: { width: 1280, height: 720 },
    });
  });

  it('Then the libraries list the local build and the pinned CDN URLs', () => {
    const { libraries } = buildBenchmarkReport(input());

    expect(libraries).toEqual([
      { id: 're-flux', name: 're;Flux', version: 'site', source: 'localSiteBuild' },
      { id: 'gsap', name: 'GSAP', version: '3.15.0', source: 'https://esm.sh/gsap@3.15.0' },
      { id: 'animejs', name: 'Anime.js', version: '4.5.0', source: 'https://esm.sh/animejs@4.5.0' },
    ]);
  });

  it('Then the methodology names the workload that was actually run', () => {
    expect(buildBenchmarkReport(input({ scenario: 'shared-renderer' })).methodology[1]).toBe(
      'sharedRendererMethodology',
    );
    expect(buildBenchmarkReport(input({ scenario: 'engine-only', renderer: 'none' })).methodology[1]).toBe(
      'engineOnlyMethodology',
    );
    expect(buildBenchmarkReport(input({ scenario: 'per-target-dom', renderer: 'dom' })).methodology[1]).toBe(
      'perTargetDomMethodology',
    );
    expect(buildBenchmarkReport(input()).methodology).toHaveLength(12);
    expect(buildBenchmarkReport(input()).caveats).toEqual([
      'browserDeviceCaveat',
      'sharedCallbackCaveat',
      'cdnCaveat',
      'noUploadCaveat',
    ]);
  });

  it('Then engines without measured runs are left out of the results', () => {
    const summaries = engines.map((engine) => summarizeEngine(engine, engine.id === 'gsap' ? [] : [runFor(engine.id)]));
    const report = buildBenchmarkReport(input({ summaries }));

    expect(report.results.map((result) => result.id)).toEqual(['re-flux', 'animejs']);
  });

  it('Then diagnostics a browser could not report stay null in the export', () => {
    const [first] = buildBenchmarkReport(input()).results;

    expect(first?.medianLongTaskCount).toBeNull();
    expect(first?.medianLongAnimationFrameCount).toBeNull();
    expect(JSON.parse(JSON.stringify(first)).medianLongTaskCount).toBeNull();
  });
});
