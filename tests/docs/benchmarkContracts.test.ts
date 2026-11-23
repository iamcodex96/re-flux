import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  CALIBRATION_INTERVAL_COUNT,
  CDN_URLS,
  COMPETITOR_VERSIONS,
  DURATION_OPTIONS_MS,
  ENGINE_CATALOG,
  RENDERERS,
  REPETITIONS,
  SCENARIOS,
  TARGET_COUNT_OPTIONS,
} from '../../apps/docs/src/benchmarks/config';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
};

describe('Given the Benchmark Lab configuration contracts', () => {
  it('Then it compares exactly re;Flux, GSAP and Anime.js, once each', () => {
    expect(ENGINE_CATALOG.map((engine) => engine.id)).toEqual(['re-flux', 'gsap', 'animejs']);
  });

  it('Then it offers the DOM, SVG and Canvas renderers and the three scenarios', () => {
    expect(RENDERERS.map((renderer) => renderer.id)).toEqual(['dom', 'svg', 'canvas']);
    expect(SCENARIOS.map((scenario) => scenario.id).sort()).toEqual([
      'engine-only',
      'per-target-dom',
      'shared-renderer',
    ]);
  });

  it('Then it runs ten measured repetitions and calibrates over sixty frame intervals', () => {
    expect(REPETITIONS).toBe(10);
    expect(CALIBRATION_INTERVAL_COUNT).toBe(60);
  });

  it('Then the selectable target counts and durations are the documented ones', () => {
    expect([...TARGET_COUNT_OPTIONS]).toEqual([100, 250, 500, 1000, 2500, 5000]);
    expect([...DURATION_OPTIONS_MS]).toEqual([1000, 1500, 2000, 2500]);
  });

  it('Then the pinned CDN URLs carry the versions of the comparison libraries installed for the headless runner', () => {
    expect(CDN_URLS).toEqual({ gsap: 'https://esm.sh/gsap@3.15.0', animejs: 'https://esm.sh/animejs@4.5.0' });
    expect(packageJson.devDependencies.gsap).toBe(COMPETITOR_VERSIONS.gsap);
    expect(packageJson.devDependencies.animejs).toBe(COMPETITOR_VERSIONS.animejs);
  });
});
