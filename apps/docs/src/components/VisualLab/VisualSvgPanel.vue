<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { map } from 'rxjs';
import { MotionPreferences, Tween } from '@lib';
import { bindSvgAttributes, bindSvgPathDrawing, bindSvgPathMorph, followSvgPath$ } from '@lib/svg';

const drawingPath = ref<SVGPathElement | null>(null);
const morphPath = ref<SVGPathElement | null>(null);
const followerPath = ref<SVGPathElement | null>(null);
const followerDot = ref<SVGGElement | null>(null);
const liquidTurbulence = ref<SVGFETurbulenceElement | null>(null);
const liquidDisplacement = ref<SVGFEDisplacementMapElement | null>(null);
const morphA = 'M 160 38 L 215 150 L 105 150 Z';
const morphB = 'M 150 60 C 181 30 220 62 204 96 C 223 125 190 166 157 150 C 125 171 84 140 101 105 C 85 75 119 43 150 60 Z';

const preferences = new MotionPreferences();
const cleanups: Array<() => void> = [];
let pathDrawingTween: Tween<number> | null = null;

function trackTween<T>(tween: Tween<T>): Tween<T> {
  cleanups.push(() => tween.stop());
  tween.play();
  return tween;
}

function setupPathDrawing(): void {
  if (!drawingPath.value) return;
  const progress = trackTween(new Tween({
    from: 0,
    to: 1,
    duration: 1900,
    easing: 'easeInOutCubic',
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  pathDrawingTween = progress;
  const binding = bindSvgPathDrawing(drawingPath.value, progress.value$);
  cleanups.push(() => binding.unsubscribe());
}

function replayPathDrawing(): void {
  pathDrawingTween?.restart();
}

function setupPathMorph(): void {
  if (!morphPath.value) return;
  const progress = trackTween(new Tween({
    from: 0,
    to: 1,
    duration: 2600,
    easing: 'easeInOutSine',
    repeat: Infinity,
    yoyo: true,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  const binding = bindSvgPathMorph(morphPath.value, progress.value$, morphA, morphB);
  cleanups.push(() => binding.unsubscribe());
}

function setupPathFollower(): void {
  if (!followerPath.value || !followerDot.value) return;
  const progress = trackTween(new Tween({
    from: 0,
    to: 1,
    duration: 3600,
    easing: 'easeInOutSine',
    repeat: Infinity,
    yoyo: true,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  const samples$ = followSvgPath$(followerPath.value, progress.value$);
  const binding = bindSvgAttributes(followerDot.value, samples$.pipe(map(({ x, y, angle }) => ({
    transform: `translate(${x} ${y}) rotate(${angle})`,
  }))));
  cleanups.push(() => binding.unsubscribe());
}

function setupSvgDistortion(): void {
  if (!liquidTurbulence.value || !liquidDisplacement.value) return;
  const progress = trackTween(new Tween({
    from: 0,
    to: 1,
    duration: 4400,
    easing: 'easeInOutSine',
    repeat: Infinity,
    yoyo: true,
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  }));
  const turbulenceBinding = bindSvgAttributes(liquidTurbulence.value, progress.value$.pipe(map((value) => ({
    baseFrequency: (0.003 + value * 0.014).toFixed(4),
  }))));
  const displacementBinding = bindSvgAttributes(liquidDisplacement.value, progress.value$.pipe(map((value) => ({
    scale: 4 + value * 42,
  }))));
  cleanups.push(() => turbulenceBinding.unsubscribe(), () => displacementBinding.unsubscribe());
}

onMounted(async () => {
  await nextTick();
  setupPathDrawing();
  setupPathMorph();
  setupSvgDistortion();
  setupPathFollower();
});

onBeforeUnmount(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  preferences.destroy();
});
</script>

<template>
  <v-row class="visual-demo-grid">
    <v-col cols="12">
        <v-card class="visual-card visual-card--svg" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="primary">01 / SVG</v-chip><span class="text-caption text-medium-emphasis">Stroke reveal</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Draw the line, not the element.</h3>
            <p class="text-body-2 text-medium-emphasis">The path stays in place while its dash offset reveals each segment. Great for logos, illustrations and diagrams.</p>
            <div class="visual-stage visual-stage--path">
              <svg viewBox="0 0 400 190" role="img" aria-label="An animated neon line drawing a looping abstract path" class="path-art">
                <defs><linearGradient id="path-stroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient></defs>
                <path ref="drawingPath" d="M 28 116 C 42 35 93 34 112 100 S 164 164 183 94 S 227 25 248 96 S 293 166 311 91 S 352 43 372 76" fill="none" stroke="url(#path-stroke)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
                <circle cx="28" cy="116" r="4" fill="#67e8f9"/><circle cx="372" cy="76" r="4" fill="#c4b5fd"/>
              </svg>
              <div class="visual-stage__grid" aria-hidden="true"></div>
            </div>
            <div class="d-flex justify-space-between align-center mt-4 ga-3"><span class="text-caption text-medium-emphasis">bindSvgPathDrawing(path, progress$)</span><div class="d-flex align-center ga-2"><v-btn color="primary" variant="tonal" size="small" aria-label="Replay SVG stroke reveal" @click="replayPathDrawing"><v-icon start>mdi-replay</v-icon>Replay</v-btn><v-icon color="primary">mdi-vector-curve</v-icon></div></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--morph" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="secondary">02 / SVG</v-chip><span class="text-caption text-medium-emphasis">Normalized path morph</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Change the geometry itself.</h3>
            <p class="text-body-2 text-medium-emphasis">Morph shapes even when their SVG commands differ. Paths are converted to cubic curves and subdivided into matching segments before interpolation.</p>
            <div class="visual-stage visual-stage--morph">
              <svg viewBox="0 0 310 205" role="img" aria-label="An angular purple outline morphing into a rounded organic shape" class="morph-art">
                <defs><linearGradient id="morph-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa" stop-opacity=".22"/><stop offset="1" stop-color="#67e8f9" stop-opacity=".05"/></linearGradient></defs>
                <path ref="morphPath" :d="morphA" fill="url(#morph-fill)" stroke="#a78bfa" stroke-width="2.5" stroke-linejoin="round" />
                <circle cx="155" cy="104" r="72" fill="none" stroke="rgba(167,139,250,.13)" stroke-dasharray="3 8" />
              </svg>
              <span class="visual-stage__orb visual-stage__orb--one" aria-hidden="true"></span>
              <span class="visual-stage__orb visual-stage__orb--two" aria-hidden="true"></span>
            </div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">normalizeSvgPathPair(from, to) + bindSvgPathMorph()</span><v-icon color="secondary">mdi-vector-square</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--liquid" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="secondary">03 / SVG filter</v-chip><span class="text-caption text-medium-emphasis">Turbulence + displacement</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Distort the pixels, not just the path.</h3>
            <p class="text-body-2 text-medium-emphasis">An animated SVG filter deforms a gradient surface with procedural turbulence. This creates a liquid lens effect without changing the underlying path geometry.</p>
            <div class="visual-stage visual-stage--liquid">
              <svg viewBox="0 0 400 220" role="img" aria-label="A gradient shape distorted by a continuously changing liquid SVG filter" class="liquid-art">
                <defs>
                  <linearGradient id="liquid-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset=".55" stop-color="#818cf8"/><stop offset="1" stop-color="#e879f9"/></linearGradient>
                  <filter id="liquid-filter" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
                    <feTurbulence ref="liquidTurbulence" type="fractalNoise" baseFrequency=".006" numOctaves="2" seed="3" result="noise" />
                    <feDisplacementMap ref="liquidDisplacement" in="SourceGraphic" in2="noise" scale="16" xChannelSelector="R" yChannelSelector="G" />
                  </filter>
                </defs>
                <g filter="url(#liquid-filter)">
                  <path d="M 100 38 C 150 6 195 48 214 54 C 258 68 317 39 324 91 C 333 145 282 180 226 162 C 175 145 149 196 105 163 C 59 129 54 68 100 38 Z" fill="url(#liquid-gradient)" opacity=".92" />
                  <circle cx="170" cy="83" r="45" fill="#e0f2fe" fill-opacity=".35" />
                </g>
                <circle cx="200" cy="110" r="82" fill="none" stroke="rgba(103,232,249,.2)" stroke-dasharray="3 8" />
              </svg>
              <span class="liquid-glow liquid-glow--a" aria-hidden="true"></span><span class="liquid-glow liquid-glow--b" aria-hidden="true"></span>
            </div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">bindSvgAttributes() · feTurbulence</span><v-icon color="secondary">mdi-water-opacity</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>

<v-col cols="12">
        <v-card class="visual-card visual-card--svg" variant="outlined">
          <v-card-text class="pa-5 pa-md-6">
            <div class="visual-card__heading"><v-chip size="small" variant="tonal" color="primary">04 / SVG</v-chip><span class="text-caption text-medium-emphasis">Motion path</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Move along a curve, with tangent rotation.</h3>
            <p class="text-body-2 text-medium-emphasis">Path progress becomes a position and angle stream. The same sample could drive an SVG icon, Canvas sprite or Three.js object.</p>
            <div class="visual-stage visual-stage--path">
              <svg viewBox="0 0 400 190" role="img" aria-label="A small glowing marker follows a curved path and rotates with the curve" class="path-art">
                <defs><linearGradient id="follower-stroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs>
                <path ref="followerPath" d="M 28 145 C 78 20 140 170 195 85 S 310 30 372 140" fill="none" stroke="url(#follower-stroke)" stroke-width="2" stroke-dasharray="5 7" stroke-linecap="round" />
                <g ref="followerDot" transform="translate(28 145)"><path d="M -8 -5 L 9 0 L -8 5 Z" fill="#e0f2fe" stroke="#67e8f9" stroke-width="2" stroke-linejoin="round" /></g>
              </svg>
              <div class="visual-stage__grid" aria-hidden="true"></div>
            </div>
            <div class="d-flex justify-space-between align-center mt-4"><span class="text-caption text-medium-emphasis">followSvgPath$(path, progress$)</span><v-icon color="primary">mdi-vector-link</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>
  </v-row>
</template>
