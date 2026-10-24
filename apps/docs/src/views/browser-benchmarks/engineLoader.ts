import type { EngineModules, GsapApi, GsapModuleShape, AnimeModuleShape } from './types';

let cachedModules: Promise<EngineModules> | null = null;

export const benchmarkEngineConfig = {
  gsap: { version: '3.15.0', source: 'https://esm.sh/gsap@3.15.0' },
  animejs: { version: '4.5.0', source: 'https://esm.sh/animejs@4.5.0' },
} as const;

export const benchmarkEngineSources = {
  gsap: benchmarkEngineConfig.gsap.source,
  animejs: benchmarkEngineConfig.animejs.source,
} as const;

export function loadCompetitorModules(messages: { gsapApiMissing: string; animeApiMissing: string; }): Promise<EngineModules> {
  if (!cachedModules) {
    cachedModules = (async () => {
      // The external engines are loaded only on demand and their network load time is excluded from measurements.
      const dynamicImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url) as Promise<unknown>;
      const [gsapModuleValue, animeModuleValue] = await Promise.all([
        dynamicImport(benchmarkEngineSources.gsap),
        dynamicImport(benchmarkEngineSources.animejs),
      ]);
      const gsapModule = gsapModuleValue as GsapModuleShape;
      const gsapDefault = gsapModule.default;
      const gsapCandidate = gsapModule.gsap
        ?? (gsapDefault && typeof gsapDefault === 'object' && 'gsap' in gsapDefault ? gsapDefault.gsap : undefined)
        ?? gsapDefault;
      if (!gsapCandidate || typeof gsapCandidate !== 'object' || !('to' in gsapCandidate)) {
        throw new Error(messages.gsapApiMissing);
      }
      const animeModule = animeModuleValue as AnimeModuleShape;
      const animeDefault = animeModule.default;
      const animeCandidate = animeModule.animate
        ?? (animeDefault && typeof animeDefault === 'object' && 'animate' in animeDefault ? animeDefault.animate : undefined);
      if (typeof animeCandidate !== 'function') {
        throw new Error(messages.animeApiMissing);
      }
      return { gsap: gsapCandidate as GsapApi, animeAnimate: animeCandidate };
    })().catch((error: unknown) => {
      cachedModules = null;
      throw error;
    });
  }
  return cachedModules;
}
