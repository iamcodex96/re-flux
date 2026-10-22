<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { map } from 'rxjs';
import { MotionPreferences, Tween } from '@lib';
import { bindSvgAttributes, bindSvgPathDrawing, bindSvgPathMorph, followSvgPath$ } from '@lib/svg';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';

type SvgKind = 'path-draw' | 'path-morph' | 'liquid-filter' | 'motion-path';

const activeScene = ref<string>('path-draw');
const drawingPath = ref<SVGPathElement | null>(null);
const morphPath = ref<SVGPathElement | null>(null);
const followerPath = ref<SVGPathElement | null>(null);
const followerDot = ref<SVGGElement | null>(null);
const liquidTurbulence = ref<SVGFETurbulenceElement | null>(null);
const liquidDisplacement = ref<SVGFEDisplacementMapElement | null>(null);
const morphA = 'M 160 38 L 215 150 L 105 150 Z';
const morphB = 'M 150 60 C 181 30 220 62 204 96 C 223 125 190 166 157 150 C 125 171 84 140 101 105 C 85 75 119 43 150 60 Z';
const preferences = new MotionPreferences();
const activeCleanups: Array<() => void> = [];
let pathDrawingTween: Tween<number> | null = null;

const scenes: readonly VisualLabSceneDefinition[] = [
  {
    id: 'path-draw', category: '01 / SVG', title: 'Draw the line, not the element.',
    description: 'The path stays in place while its dash offset reveals each segment. Great for logos, illustrations and diagrams.',
    stageLabel: 'LIVE SVG STAGE', fileLabel: 'path-drawing.ts', stageTag: 'STROKE PROGRESS', ariaLabel: 'An animated neon line drawing a looping abstract path',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindSvgPathDrawing } from '@re-code/flux/svg';\n\nconst progress = new Tween({\n  from: 0, to: 1, duration: 1900,\n  easing: 'easeInOutCubic',\n});\nconst binding = bindSvgPathDrawing(path, progress.value$);\nvoid progress.play().catch(() => undefined);\n\nreturn () => {\n  binding.unsubscribe();\n  progress.stop();\n};`,
  },
  {
    id: 'path-morph', category: '02 / SVG', title: 'Change the geometry itself.',
    description: 'Morph shapes even when their SVG commands differ. Paths are converted to cubic curves and subdivided into matching segments before interpolation.',
    stageLabel: 'LIVE SVG STAGE', fileLabel: 'path-morph.ts', stageTag: 'NORMALIZED GEOMETRY', ariaLabel: 'An angular purple outline morphing into a rounded organic shape',
    snippet: `import { Tween } from '@re-code/flux';\nimport { bindSvgPathMorph } from '@re-code/flux/svg';\n\nconst progress = new Tween({\n  from: 0, to: 1, duration: 2600,\n  easing: 'easeInOutSine', repeat: Infinity, yoyo: true,\n});\nconst binding = bindSvgPathMorph(path, progress.value$, fromPath, toPath);\nvoid progress.play().catch(() => undefined);\n\nreturn () => { binding.unsubscribe(); progress.stop(); };`,
  },
  {
    id: 'liquid-filter', category: '03 / SVG FILTER', title: 'Distort the pixels, not just the path.',
    description: 'An animated SVG filter deforms a gradient surface with procedural turbulence. This creates a liquid lens effect without changing the underlying path geometry.',
    stageLabel: 'LIVE SVG FILTER', fileLabel: 'liquid-filter.ts', stageTag: 'TURBULENCE + DISPLACEMENT', ariaLabel: 'A gradient shape distorted by a continuously changing liquid SVG filter',
    snippet: `import { map } from 'rxjs';\nimport { Tween } from '@re-code/flux';\nimport { bindSvgAttributes } from '@re-code/flux/svg';\n\nconst progress = new Tween({\n  from: 0, to: 1, duration: 4400,\n  easing: 'easeInOutSine', repeat: Infinity, yoyo: true,\n});\nconst turbulence = bindSvgAttributes(feTurbulence, progress.value$.pipe(\n  map((value) => ({ baseFrequency: (0.003 + value * 0.014).toFixed(4) })),\n));\nconst displacement = bindSvgAttributes(feDisplacementMap, progress.value$.pipe(\n  map((value) => ({ scale: 4 + value * 42 })),\n));\nvoid progress.play().catch(() => undefined);\n\nreturn () => { turbulence.unsubscribe(); displacement.unsubscribe(); progress.stop(); };`,
  },
  {
    id: 'motion-path', category: '04 / SVG', title: 'Move along a curve, with tangent rotation.',
    description: 'Path progress becomes a position and angle stream. The same sample could drive an SVG icon, Canvas sprite or Three.js object.',
    stageLabel: 'LIVE SVG STAGE', fileLabel: 'motion-path.ts', stageTag: 'POSITION + ANGLE STREAM', ariaLabel: 'A marker follows a curved path and rotates with the curve',
    snippet: `import { map } from 'rxjs';\nimport { Tween } from '@re-code/flux';\nimport { bindSvgAttributes, followSvgPath$ } from '@re-code/flux/svg';\n\nconst progress = new Tween({\n  from: 0, to: 1, duration: 3600,\n  easing: 'easeInOutSine', repeat: Infinity, yoyo: true,\n});\nconst samples$ = followSvgPath$(path, progress.value$);\nconst binding = bindSvgAttributes(marker, samples$.pipe(\n  map(({ x, y, angle }) => ({ transform: \`translate(\${x} \${y}) rotate(\${angle})\` })),\n));\nvoid progress.play().catch(() => undefined);\n\nreturn () => { binding.unsubscribe(); progress.stop(); };`,
  },
];

function trackTween<T>(tween: Tween<T>): Tween<T> {
  activeCleanups.push(() => tween.stop());
  void tween.play().catch(() => undefined);
  return tween;
}

function cleanupActiveScene(): void {
  for (const cleanup of activeCleanups.splice(0).reverse()) cleanup();
  pathDrawingTween = null;
}

function setupPathDrawing(): void {
  if (!drawingPath.value) return;
  const progress = trackTween(new Tween({
    from: 0, to: 1, duration: 1900, easing: 'easeInOutCubic',
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  pathDrawingTween = progress;
  const binding = bindSvgPathDrawing(drawingPath.value, progress.value$);
  activeCleanups.push(() => binding.unsubscribe());
}

function replayPathDrawing(): void {
  pathDrawingTween?.restart();
}

function setupPathMorph(): void {
  if (!morphPath.value) return;
  const progress = trackTween(new Tween({
    from: 0, to: 1, duration: 2600, easing: 'easeInOutSine', repeat: Infinity, yoyo: true,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  const binding = bindSvgPathMorph(morphPath.value, progress.value$, morphA, morphB);
  activeCleanups.push(() => binding.unsubscribe());
}

function setupPathFollower(): void {
  if (!followerPath.value || !followerDot.value) return;
  const progress = trackTween(new Tween({
    from: 0, to: 1, duration: 3600, easing: 'easeInOutSine', repeat: Infinity, yoyo: true,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  const samples$ = followSvgPath$(followerPath.value, progress.value$);
  const binding = bindSvgAttributes(followerDot.value, samples$.pipe(map(({ x, y, angle }) => ({
    transform: `translate(${x} ${y}) rotate(${angle})`,
  }))));
  activeCleanups.push(() => binding.unsubscribe());
}

function setupSvgDistortion(): void {
  if (!liquidTurbulence.value || !liquidDisplacement.value) return;
  const progress = trackTween(new Tween({
    from: 0, to: 1, duration: 4400, easing: 'easeInOutSine', repeat: Infinity, yoyo: true,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  const turbulenceBinding = bindSvgAttributes(liquidTurbulence.value, progress.value$.pipe(map((value) => ({
    baseFrequency: (0.003 + value * 0.014).toFixed(4),
  }))));
  const displacementBinding = bindSvgAttributes(liquidDisplacement.value, progress.value$.pipe(map((value) => ({
    scale: 4 + value * 42,
  }))));
  activeCleanups.push(() => turbulenceBinding.unsubscribe(), () => displacementBinding.unsubscribe());
}

async function mountActiveScene(kind: string): Promise<void> {
  await nextTick();
  if (kind !== activeScene.value) return;
  switch (kind as SvgKind) {
    case 'path-draw': setupPathDrawing(); break;
    case 'path-morph': setupPathMorph(); break;
    case 'liquid-filter': setupSvgDistortion(); break;
    case 'motion-path': setupPathFollower(); break;
  }
}

watch(activeScene, async (kind) => {
  cleanupActiveScene();
  await mountActiveScene(kind);
});

onMounted(async () => mountActiveScene(activeScene.value));

onBeforeUnmount(() => {
  cleanupActiveScene();
  preferences.destroy();
});
</script>

<template>
  <VisualLabSceneExplorer
    v-model="activeScene"
    id-prefix="svg-scene"
    eyebrow="VECTOR / SVG"
    heading="Geometry in motion"
    description="Choose a vector experiment to inspect its live geometry, filter, or motion-path binding. Only the selected scene is mounted and animated."
    :scenes="scenes"
  >
    <template #stage="{ scene }">
      <div v-if="scene.id === 'path-draw'" class="visual-stage visual-stage--path">
        <svg viewBox="0 0 400 190" role="img" aria-label="An animated neon line drawing a looping abstract path" class="path-art">
          <defs><linearGradient id="path-stroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient></defs>
          <path ref="drawingPath" d="M 28 116 C 42 35 93 34 112 100 S 164 164 183 94 S 227 25 248 96 S 293 166 311 91 S 352 43 372 76" fill="none" stroke="url(#path-stroke)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="28" cy="116" r="4" fill="#67e8f9"/><circle cx="372" cy="76" r="4" fill="#c4b5fd"/>
        </svg>
        <div class="visual-stage__grid" aria-hidden="true"></div>
        <UiButton class="visual-scene-explorer__stage-action" color="primary" variant="tonal" size="small" aria-label="Replay SVG stroke reveal" @click="replayPathDrawing"><UiIcon start>mdi-replay</UiIcon>Replay</UiButton>
      </div>
      <div v-else-if="scene.id === 'path-morph'" class="visual-stage visual-stage--morph">
        <svg viewBox="0 0 310 205" role="img" aria-label="An angular purple outline morphing into a rounded organic shape" class="morph-art">
          <defs><linearGradient id="morph-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa" stop-opacity=".22"/><stop offset="1" stop-color="#67e8f9" stop-opacity=".05"/></linearGradient></defs>
          <path ref="morphPath" :d="morphA" fill="url(#morph-fill)" stroke="#a78bfa" stroke-width="2.5" stroke-linejoin="round" />
          <circle cx="155" cy="104" r="72" fill="none" stroke="rgba(167,139,250,.13)" stroke-dasharray="3 8" />
        </svg>
        <span class="visual-stage__orb visual-stage__orb--one" aria-hidden="true"></span>
        <span class="visual-stage__orb visual-stage__orb--two" aria-hidden="true"></span>
      </div>
      <div v-else-if="scene.id === 'liquid-filter'" class="visual-stage visual-stage--liquid">
        <svg viewBox="0 0 400 220" role="img" aria-label="A gradient shape distorted by a continuously changing liquid SVG filter" class="liquid-art">
          <defs>
            <linearGradient id="liquid-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".55" stop-color="#818cf8"/><stop offset="1" stop-color="#e879f9"/></linearGradient>
            <filter id="liquid-filter" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
              <feTurbulence ref="liquidTurbulence" type="fractalNoise" baseFrequency=".006" numOctaves="2" seed="3" result="noise" />
              <feDisplacementMap ref="liquidDisplacement" in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <g filter="url(#liquid-filter)"><path d="M 100 38 C 150 6 195 48 214 54 C 258 68 317 39 324 91 C 333 145 282 180 226 162 C 175 145 149 196 105 163 C 59 129 54 68 100 38 Z" fill="url(#liquid-gradient)" opacity=".92"/><circle cx="170" cy="83" r="45" fill="#e0f2fe" fill-opacity=".35"/></g>
          <circle cx="200" cy="110" r="82" fill="none" stroke="rgba(103,232,249,.2)" stroke-dasharray="3 8" />
        </svg>
        <span class="liquid-glow liquid-glow--a" aria-hidden="true"></span><span class="liquid-glow liquid-glow--b" aria-hidden="true"></span>
      </div>
      <div v-else-if="scene.id === 'motion-path'" class="visual-stage visual-stage--path">
        <svg viewBox="0 0 400 190" role="img" aria-label="A small glowing marker follows a curved path and rotates with the curve" class="path-art">
          <defs><linearGradient id="follower-stroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
          <path ref="followerPath" d="M 28 145 C 78 20 140 170 195 85 S 310 30 372 140" fill="none" stroke="url(#follower-stroke)" stroke-width="2" stroke-dasharray="5 7" stroke-linecap="round" />
          <g ref="followerDot" transform="translate(28 145)"><path d="M -8 -5 L 9 0 L -8 5 Z" fill="#e0f2fe" stroke="#67e8f9" stroke-width="2" stroke-linejoin="round" /></g>
        </svg>
        <div class="visual-stage__grid" aria-hidden="true"></div>
      </div>
    </template>
  </VisualLabSceneExplorer>
</template>
