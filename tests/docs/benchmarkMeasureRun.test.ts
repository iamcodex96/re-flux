import { describe, expect, it } from '@jest/globals';
import { measureRun, type WorkloadFactories } from '../../apps/docs/src/benchmarks/measure';
import type { AnimationRunner, EngineModules, RenderScene } from '../../apps/docs/src/benchmarks/types';
import { FakeBenchmarkEnvironment } from '../helpers/benchmarkEnvironment';
import { messages } from '../helpers/benchmarkMessages';

const host = {} as HTMLElement;
const modules = {} as EngineModules;

interface Harness {
  env: FakeBenchmarkEnvironment;
  scene: RenderScene & { renders: number[]; cleaned: number };
  runner: AnimationRunner & { started: number; cleaned: number };
  factories: WorkloadFactories;
  created: string[];
}

/** A scene and an engine that animate for `frames` frames, optionally leaking one render call after cleanup. */
function harness(options: { frames?: number; leakAfterCleanup?: boolean; neverCompletes?: boolean } = {}): Harness {
  const env = new FakeBenchmarkEnvironment();
  const created: string[] = [];
  const scene = {
    targetCount: 10,
    renders: [] as number[],
    cleaned: 0,
    render(progress: number) {
      scene.renders.push(progress);
    },
    cleanup() {
      scene.cleaned += 1;
    },
  };
  let cleaned = false;
  const runner = {
    started: 0,
    cleaned: 0,
    start() {
      runner.started += 1;
      let frame = 0;
      const step = () => {
        if (cleaned && !options.leakAfterCleanup) return;
        scene.render(frame / (options.frames ?? 5));
        frame += 1;
        if (options.neverCompletes) {
          env.requestFrame(step);
          return;
        }
        if (frame > (options.frames ?? 5)) {
          completion();
          return;
        }
        env.requestFrame(step);
      };
      env.requestFrame(step);
    },
    cleanup() {
      runner.cleaned += 1;
      cleaned = true;
      // A stale callback that fires after cleanup is exactly what the cleanup probe must notice.
      if (options.leakAfterCleanup) env.requestFrame(() => scene.render(1));
    },
  };
  let completion = () => undefined as void;
  const factories: WorkloadFactories = {
    createScene: (_host, renderer, count) => {
      created.push(`scene:${renderer}:${count}`);
      return scene;
    },
    createObjectScene: (_host, count) => {
      created.push(`objects:${count}`);
      return scene;
    },
    createRunner: (engine, _scene, _duration, onComplete) => {
      created.push(`runner:${engine}`);
      completion = onComplete;
      return runner;
    },
  };
  return { env, scene, runner, factories, created };
}

function measure(
  h: Harness,
  overrides: Partial<Parameters<typeof measureRun>[0]> = {},
  signal = new AbortController().signal,
) {
  return measureRun({
    engine: 're-flux',
    renderer: 'dom',
    scenario: 'shared-renderer',
    targetCount: 10,
    durationMs: 100,
    repetition: 3,
    modules,
    signal,
    frameIntervalReferenceMs: 16,
    host,
    messages,
    env: h.env,
    factories: h.factories,
    ...overrides,
  });
}

describe('Given a measured benchmark run', () => {
  describe('When a shared-renderer run completes', () => {
    it('Then it reports the run, samples every renderer callback and passes the cleanup probe', async () => {
      const h = harness({ frames: 5 });
      const pending = measure(h);
      await h.env.pump(() => false, 16, 40);
      const run = await pending;

      expect(run).toMatchObject({
        engine: 're-flux',
        repetition: 3,
        scenario: 'shared-renderer',
        renderer: 'dom',
        targetCount: 10,
        configuredDurationMs: 100,
        completed: true,
        renderedTargetsPerCallback: 10,
        cleanupPassed: true,
        longTaskCount: null,
        longAnimationFrameCount: null,
      });
      expect(run.renderCallbacks).toBe(6);
      expect(h.scene.renders).toHaveLength(6);
      expect(run.rendererWork.totalMs).not.toBeNull();
      expect(run.frameIntervals.sampleCount).toBeGreaterThan(0);
      expect(run.frameIntervals.stretchedFrameCount).toBe(0);
      expect(h.created).toEqual(['scene:dom:10', 'runner:re-flux']);
      expect(h.runner.started).toBe(1);
      expect(h.runner.cleaned).toBe(1);
      expect(h.scene.cleaned).toBe(1);
    });

    it('Then frame intervals over 1.5 times the reference count as stretched and as missed refreshes', async () => {
      const h = harness({ frames: 6 });
      const pending = measure(h);
      for (const step of [16, 16, 48, 16, 16, 16, 16, 16, 16, 16, 16, 16]) {
        h.env.tick(step);
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      await h.env.pump(() => false, 16, 20);
      const run = await pending;

      expect(run.frameIntervals.stretchedFrameCount).toBe(1);
      expect(run.frameIntervals.estimatedMissedRefreshCount).toBe(2);
      expect(run.frameIntervals.maxMs).toBe(48);
    });
  });

  describe('When the scenario does not use the shared renderer', () => {
    it('Then renderer callback cost is not sampled and the cleanup probe does not apply', async () => {
      const h = harness({ frames: 4 });
      const pending = measure(h, { scenario: 'per-target-dom' });
      await h.env.pump(() => false, 16, 40);
      const run = await pending;

      expect(run.renderCallbacks).toBe(0);
      expect(run.renderedTargetsPerCallback).toBe(0);
      expect(run.rendererWork).toEqual({ medianMs: null, p95Ms: null, p99Ms: null, totalMs: null });
      expect(run.cleanupPassed).toBeNull();
    });

    it('Then the engine-only renderer builds plain objects instead of a scene', async () => {
      const h = harness({ frames: 2 });
      const pending = measure(h, { scenario: 'engine-only', renderer: 'none' });
      await h.env.pump(() => false, 16, 40);
      await pending;

      expect(h.created[0]).toBe('objects:10');
    });
  });

  describe('When an engine keeps rendering after its cleanup', () => {
    it('Then the cleanup probe fails the run', async () => {
      const h = harness({ frames: 3, leakAfterCleanup: true });
      const pending = measure(h);
      await h.env.pump(() => false, 16, 40);

      expect((await pending).cleanupPassed).toBe(false);
    });
  });

  describe('When the browser supports long-task diagnostics', () => {
    it('Then only entries inside the run window are counted, and unsupported ones stay null', async () => {
      const h = harness({ frames: 4 });
      h.env.supported = ['longtask', 'long-animation-frame'];
      const before = h.env.now() - 500;
      const pending = measure(h);
      h.env.emitEntry('longtask', { startTime: before, duration: 90 });
      h.env.tick(16);
      h.env.emitEntry('longtask', { startTime: h.env.now(), duration: 70 });
      h.env.emitEntry('long-animation-frame', { startTime: h.env.now(), duration: 80 });
      await h.env.pump(() => false, 16, 40);
      const run = await pending;

      expect(run.longTaskCount).toBe(1);
      expect(run.longTaskDurationMs).toBe(70);
      expect(run.longAnimationFrameCount).toBe(1);
      expect(h.env.disconnected.sort()).toEqual(['long-animation-frame', 'longtask']);
    });

    it('Then an observer the browser rejects is reported as unavailable, not as zero', async () => {
      const h = harness({ frames: 2 });
      h.env.supported = ['longtask'];
      h.env.rejected = ['longtask'];
      const pending = measure(h);
      await h.env.pump(() => false, 16, 40);

      expect((await pending).longTaskCount).toBeNull();
    });
  });

  describe('When a run cannot finish', () => {
    it('Then it fails after duration + 5 s and still cleans up', async () => {
      const h = harness({ neverCompletes: true });
      const pending = measure(h, { durationMs: 100 });
      const outcome = pending.then(
        () => 'resolved',
        (error: Error) => error.message,
      );
      await h.env.pump(() => false, 500, 20);

      expect(await outcome).toBe('re;Flux did not complete within the expected time.');
      expect(h.runner.cleaned).toBe(1);
      expect(h.scene.cleaned).toBe(1);
    });

    it('Then cancellation rejects with an AbortError and still cleans up', async () => {
      const h = harness({ neverCompletes: true });
      const controller = new AbortController();
      const pending = measure(h, {}, controller.signal);
      const settled = pending.then(
        () => null,
        (error: unknown) => error,
      );
      h.env.tick(16);
      controller.abort();
      await h.env.pump(() => false, 16, 10);

      expect(await settled).toMatchObject({ name: 'AbortError' });
      expect(h.runner.cleaned).toBe(1);
      expect(h.scene.cleaned).toBe(1);
    });

    it('Then a page without a stage host fails before building anything', async () => {
      const h = harness();

      await expect(measure(h, { host: null })).rejects.toThrow('theBenchmarkStageIsNotAvailable');
      expect(h.created).toEqual([]);
    });
  });
});
