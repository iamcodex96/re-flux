<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { onBeforeUnmount, onMounted, ref, useId , computed} from 'vue';
import { MotionPreferences, Tween } from '@lib';
import { bindCanvas, resizeCanvas } from '@lib/canvas';
import { draggable, type DraggableHandle } from '@lib/dom';
import { bindSvgPathMorph } from '@lib/svg';
import { drawParticleConstellation } from '@demos/canvas';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.landingLabPreview);
export type LandingLabPreviewKind = 'svg' | 'canvas' | 'interaction';

const props = defineProps<{
  kind: LandingLabPreviewKind;
  title: string;
}>();

const root = ref<HTMLElement | null>(null);
const morphPath = ref<SVGPathElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const dragStage = ref<HTMLElement | null>(null);
const dragNode = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const canvasReady = ref(false);
const uniqueId = useId().replaceAll(':', '');

const shapeStart = 'M 140 37 L 206 139 L 91 151 Z';
const shapeEnd = 'M 135 51 C 174 24 220 56 202 91 C 225 121 184 163 149 147 C 116 168 74 135 94 101 C 79 71 106 43 135 51 Z';
const preferences = new MotionPreferences();
const cleanups: Array<() => void> = [];
let visible = false;
let intersectionObserver: IntersectionObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let preferencesSubscription: { unsubscribe(): void } | null = null;
let morphTween: Tween<number> | null = null;
let canvasTween: Tween<number> | null = null;
let dragHandle: DraggableHandle | null = null;
let canvasContext: CanvasRenderingContext2D | null = null;
let canvasSize = { width: 1, height: 1 };
let currentCanvasPhase = 0;
let dragReducedMotion: boolean | null = null;

function shouldAnimate(): boolean {
  return visible && !preferences.snapshot.reducedMotion && preferences.snapshot.visible;
}

function syncPlayback(): void {
  const active = shouldAnimate();
  for (const tween of [morphTween, canvasTween]) {
    if (!tween) continue;
    const state = tween.state$.value;
    if (active && state !== 'running') tween.play();
    else if (!active && state === 'running') tween.pause();
  }
}

function setupMorph(): void {
  const target = morphPath.value;
  if (!target) return;

  morphTween = new Tween({
    from: 0,
    to: 1,
    duration: 3200,
    easing: 'easeInOutSine',
    repeat: Infinity,
    yoyo: true,
  });
  const tween = morphTween;
  const binding = bindSvgPathMorph(target, tween.value$, shapeStart, shapeEnd);
  cleanups.push(() => binding.unsubscribe());
  cleanups.push(() => tween.stop());
}

function renderParticles(phase: number): void {
  if (!canvasContext) return;
  canvasContext.clearRect(0, 0, canvasSize.width, canvasSize.height);
  drawParticleConstellation(canvasContext, phase, canvasSize, {
    count: 34,
    connectionDistance: 42,
    speed: 0.38,
    nodeColor: '#67e8f9',
    accentColor: '#c4b5fd',
    linkColor: '#14c8dd',
  });
}

function resizeCanvasPreview(): void {
  const target = canvas.value;
  if (!target) return;

  try {
    const rect = target.getBoundingClientRect();
    const resized = resizeCanvas(target, {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
    });
    canvasContext = resized.context;
    canvasSize = { width: resized.width, height: resized.height };
    canvasReady.value = true;
    renderParticles(currentCanvasPhase);
  } catch {
    canvasReady.value = false;
  }
}

function setupCanvas(): void {
  resizeCanvasPreview();
  const context = canvasContext;
  if (!context) return;

  canvasTween = new Tween({
    from: 0,
    to: Math.PI * 2,
    duration: 9400,
    easing: 'linear',
    repeat: Infinity,
    onUpdate: (phase) => { currentCanvasPhase = phase; },
  });
  const tween = canvasTween;
  const binding = bindCanvas(context, tween.value$, (_context, phase) => {
    currentCanvasPhase = phase;
    renderParticles(phase);
  }, { clearOnUnsubscribe: true });
  cleanups.push(() => binding.unsubscribe());
  cleanups.push(() => tween.stop());

  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    resizeObserver = new ResizeObserver(resizeCanvasPreview);
    resizeObserver.observe(canvas.value);
  } else {
    window.addEventListener('resize', resizeCanvasPreview, { passive: true });
    cleanups.push(() => window.removeEventListener('resize', resizeCanvasPreview));
  }
}

function setupDraggable(): void {
  const stage = dragStage.value;
  const node = dragNode.value;
  if (!stage || !node) return;

  const initialX = Math.max(0, (stage.clientWidth - node.offsetWidth) / 2);
  const initialY = Math.max(0, (stage.clientHeight - node.offsetHeight) / 2);
  const reducedMotion = preferences.snapshot.reducedMotion;
  dragHandle = draggable(node, {
    axis: 'both',
    initialPosition: { x: initialX, y: initialY },
    friction: reducedMotion ? 24 : 5.2,
    minVelocity: reducedMotion ? 1_000_000_000 : 12,
    velocitySmoothing: 0.7,
    ...(reducedMotion ? {} : { snapTo: 8, snapDuration: 280 }),
    getBounds: () => ({
      minX: 0,
      minY: 0,
      maxX: Math.max(0, stage.clientWidth - node.offsetWidth),
      maxY: Math.max(0, stage.clientHeight - node.offsetHeight),
    }),
    onStart: () => { isDragging.value = true; },
    onEnd: () => { isDragging.value = false; },
    onError: () => { isDragging.value = false; },
  });
}

function syncDraggableMotionPolicy(): void {
  if (props.kind !== 'interaction' || !dragStage.value || !dragNode.value) return;
  const nextReducedMotion = preferences.snapshot.reducedMotion;
  if (dragHandle && dragReducedMotion === nextReducedMotion) return;

  dragHandle?.destroy();
  dragHandle = null;
  isDragging.value = false;
  dragReducedMotion = nextReducedMotion;
  setupDraggable();
}

onMounted(() => {
  preferencesSubscription = preferences.state$.subscribe(() => {
    syncPlayback();
    syncDraggableMotionPolicy();
  });

  if (props.kind === 'interaction') syncDraggableMotionPolicy();
  if (props.kind === 'svg') setupMorph();
  if (props.kind === 'canvas') setupCanvas();

  const element = root.value;
  if (!element) return;

  if (typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.08 });
    intersectionObserver.observe(element);
  } else {
    visible = true;
  }
  syncPlayback();
});

onBeforeUnmount(() => {
  intersectionObserver?.disconnect();
  resizeObserver?.disconnect();
  preferencesSubscription?.unsubscribe();
  preferencesSubscription = null;
  dragHandle?.destroy();
  dragHandle = null;
  isDragging.value = false;
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  preferences.destroy();
});
</script>

<template>
  <div ref="root" class="landing-lab-preview" :class="[`landing-lab-preview--${kind}`, { 'is-dragging': isDragging }]">
    <template v-if="kind === 'svg'">
      <svg class="landing-lab-preview__svg" viewBox="0 0 280 190" role="img" :aria-label="copy.staticText.svgPathMorphingPreviewAriaLabel.replace('{title}', title)">
        <defs>
          <linearGradient :id="`${uniqueId}-morph-fill`" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#a78bfa" stop-opacity=".42" />
            <stop offset="1" stop-color="#14c8dd" stop-opacity=".1" />
          </linearGradient>
        </defs>
        <circle cx="140" cy="95" r="67" class="landing-lab-preview__orbit" />
        <path ref="morphPath" :d="shapeStart" :fill="`url(#${uniqueId}-morph-fill)`" class="landing-lab-preview__morph" />
        <circle cx="140" cy="95" r="4" class="landing-lab-preview__svg-node" />
      </svg>
      <span class="landing-lab-preview__label">{{ copy.staticText.svgMORPHSTREAM }}</span>
    </template>

    <template v-else-if="kind === 'canvas'">
      <div class="landing-lab-preview__canvas-wrap">
        <canvas ref="canvas" class="landing-lab-preview__canvas" :class="{ 'is-ready': canvasReady }" :aria-label="copy.staticText.canvasParticleConstellationPreviewAriaLabel.replace('{title}', title)" />
        <svg class="landing-lab-preview__canvas-fallback" viewBox="0 0 280 190" aria-hidden="true">
          <path d="M12 100 Q65 28 114 92 T210 75 T268 97" />
          <path d="M12 126 Q65 58 114 118 T210 101 T268 124" />
        </svg>
      </div>
      <span class="landing-lab-preview__label">{{ copy.staticText.canvasVALUE }}</span>
    </template>

    <template v-else>
      <div ref="dragStage" class="landing-lab-preview__drag-stage">
        <span class="landing-lab-preview__drag-ring landing-lab-preview__drag-ring--one" aria-hidden="true" />
        <span class="landing-lab-preview__drag-ring landing-lab-preview__drag-ring--two" aria-hidden="true" />
        <span class="landing-lab-preview__drag-trace" aria-hidden="true" />
        <div ref="dragNode" class="landing-lab-preview__drag-node" role="group" :aria-label="copy.staticText.draggableMotionNodeAriaLabel">
          <span aria-hidden="true">{{ copy.staticText.re }}</span>
        </div>
      </div>
      <span class="landing-lab-preview__label">{{ copy.staticText.gestureSPRING }}</span>
      <span class="landing-lab-preview__interaction-hint">{{ copy.staticText.dragTheNode }}</span>
    </template>
  </div>
</template>

<style scoped lang="scss" src="../styles/components/landing-lab-preview.scss"></style>
