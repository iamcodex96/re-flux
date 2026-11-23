import { keyframes } from '@lib';
import { CDN_URLS } from './config';
import type {
  AnimationRunner,
  AnimeModuleShape,
  BenchmarkMessages,
  EngineId,
  EngineModules,
  GsapApi,
  GsapModuleShape,
  RenderScene,
  ScenarioId,
} from './types';

let cachedModules: Promise<EngineModules> | null = null;

/** Load GSAP and Anime.js once, on demand, from the pinned CDN URLs (their network time is excluded from results). */
export function loadCompetitorModules(
  messages: Pick<BenchmarkMessages, 'gsapLoadedFromTheCdnButItsAnimationApiWasNotFound' | 'animeJsLoadedFromTheCdnButItsAnimateApiWasNotFound'>,
  dynamicImport: (url: string) => Promise<unknown> = (url) => import(/* @vite-ignore */ url) as Promise<unknown>,
): Promise<EngineModules> {
  if (!cachedModules) {
    cachedModules = (async () => {
      // The external engines are loaded only on demand and their network load time is excluded from measurements.
      const [gsapModuleValue, animeModuleValue] = await Promise.all([
        dynamicImport(CDN_URLS.gsap),
        dynamicImport(CDN_URLS.animejs),
      ]);
      const gsapModule = gsapModuleValue as GsapModuleShape;
      const gsapDefault = gsapModule.default;
      const gsapCandidate = gsapModule.gsap
        ?? (gsapDefault && typeof gsapDefault === 'object' && 'gsap' in gsapDefault ? gsapDefault.gsap : undefined)
        ?? gsapDefault;
      if (!gsapCandidate || typeof gsapCandidate !== 'object' || !('to' in gsapCandidate)) {
        throw new Error(messages.gsapLoadedFromTheCdnButItsAnimationApiWasNotFound);
      }
      const animeModule = animeModuleValue as AnimeModuleShape;
      const animeDefault = animeModule.default;
      const animeCandidate = animeModule.animate
        ?? (animeDefault && typeof animeDefault === 'object' && 'animate' in animeDefault ? animeDefault.animate : undefined);
      if (typeof animeCandidate !== 'function') {
        throw new Error(messages.animeJsLoadedFromTheCdnButItsAnimateApiWasNotFound);
      }
      return { gsap: gsapCandidate as GsapApi, animeAnimate: animeCandidate };
    })().catch((error: unknown) => {
      cachedModules = null;
      throw error;
    });
  }
  return cachedModules;
}

export function createPerTargetRunner(
  engine: EngineId,
  scene: RenderScene,
  scenario: Exclude<ScenarioId, 'shared-renderer'>,
  durationMs: number,
  onComplete: () => void,
  modules: EngineModules,
  messages: Pick<BenchmarkMessages, 'theSelectedBenchmarkScenarioHasNoTargets'>,
): AnimationRunner {
  const targets = scenario === 'engine-only'
    ? (scene.objectTargets ?? [])
    : (scene.domTargets ?? []);
  if (targets.length === 0) throw new Error(messages.theSelectedBenchmarkScenarioHasNoTargets);

  if (engine === 're-flux') {
    const animations: ReturnType<typeof keyframes<number>>[] = [];
    const subscriptions: Array<{ unsubscribe(): void }> = [];
    let completedTargets = 0;
    const completeTarget = () => {
      completedTargets += 1;
      if (completedTargets === targets.length) onComplete();
    };
    for (const target of targets) {
      const animation = keyframes<number>({
        duration: durationMs,
        easing: 'linear',
        keyframes: [{ value: 0, offset: 0 }, { value: 1, offset: 1 }],
        onComplete: completeTarget,
      });
      void animation.catch(() => undefined);
      subscriptions.push(animation.value$.subscribe((progress) => {
        if (scenario === 'engine-only') {
          (target as { value: number }).value = progress;
        } else {
          (target as HTMLDivElement).style.opacity = String(0.38 + (0.96 - 0.38) * progress);
        }
      }));
      animations.push(animation);
    }
    return {
      start() { for (const animation of animations) animation.play(); },
      cleanup() {
        for (const subscription of subscriptions) subscription.unsubscribe();
        for (const animation of animations) animation.stop();
      },
    };
  }

  if (engine === 'gsap') {
    const tween = modules.gsap.to(targets as object, {
      ...(scenario === 'engine-only' ? { value: 1 } : { opacity: 0.96 }),
      duration: durationMs / 1000,
      ease: 'none',
      paused: true,
      onComplete,
    });
    return { start: () => { tween.play(0); }, cleanup: () => tween.kill() };
  }

  const animation = modules.animeAnimate(targets as object, {
    ...(scenario === 'engine-only' ? { value: [0, 1] } : { opacity: [0.38, 0.96] }),
    duration: durationMs,
    ease: 'linear',
    autoplay: false,
    onComplete,
  });
  return { start: () => { animation.play(); }, cleanup: () => { animation.cancel(); } };
}

/** The animation of one engine for the chosen scenario. */
export function createRunner(
  engine: EngineId,
  scene: RenderScene,
  durationMs: number,
  onComplete: () => void,
  modules: EngineModules,
  scenario: ScenarioId,
  messages: Pick<BenchmarkMessages, 'theSelectedBenchmarkScenarioHasNoTargets'>,
): AnimationRunner {
  if (scenario !== 'shared-renderer') {
    return createPerTargetRunner(engine, scene, scenario, durationMs, onComplete, modules, messages);
  }
  if (engine === 're-flux') {
    const animation = keyframes<number>({
      duration: durationMs,
      easing: 'linear',
      keyframes: [{ value: 0, offset: 0 }, { value: 1, offset: 1 }],
      onComplete,
    });
    // Stop/reject on cancellation is expected for this PromiseLike engine handle.
    void animation.catch(() => undefined);
    const subscription = animation.value$.subscribe((progress) => scene.render(progress));
    return {
      start() { animation.play(); },
      cleanup() {
        subscription.unsubscribe();
        animation.stop();
      },
    };
  }

  const progress = { value: 0 };
  if (engine === 'gsap') {
    const tween = modules.gsap.to(progress, {
      value: 1,
      duration: durationMs / 1000,
      ease: 'none',
      paused: true,
      onUpdate: () => scene.render(progress.value),
      onComplete,
    });
    return { start: () => { tween.play(0); }, cleanup: () => tween.kill() };
  }

  const animation = modules.animeAnimate(progress, {
    value: 1,
    duration: durationMs,
    ease: 'linear',
    autoplay: false,
    onUpdate: () => scene.render(progress.value),
    onComplete,
  });
  return { start: () => { animation.play(); }, cleanup: () => { animation.cancel(); } };
}
