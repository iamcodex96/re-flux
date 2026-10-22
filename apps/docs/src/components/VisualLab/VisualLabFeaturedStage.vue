<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { combineLatest, BehaviorSubject, map, type Subscription } from 'rxjs';
import { onBeforeUnmount, onMounted, ref, watch , computed} from 'vue';
import { MotionPreferences, RetargetableMotion, Tween } from '@lib';
import { bindCanvas, resizeCanvas } from '@lib/canvas';
import type { VisualLabStageConfig, VisualLabTelemetry } from './visualLabTypes';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualLabFeaturedStage);
interface PointerPosition { x: number; y: number }
interface CanvasSize { width: number; height: number }
interface StageFrame {
  phase: number;
  pointer: PointerPosition | null;
  config: VisualLabStageConfig;
  size: CanvasSize;
}

const GRID_COLUMNS = 23;
const GRID_ROWS = 9;
const GRID_NODE_COUNT = GRID_COLUMNS * GRID_ROWS;
const TELEMETRY_INTERVAL_MS = 250;

const props = defineProps<{
  config: VisualLabStageConfig;
  preferences: MotionPreferences;
}>();

const emit = defineEmits<{ telemetry: [telemetry: VisualLabTelemetry] }>();

const root = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const isVisible = ref(false);
const isPointerActive = ref(false);
const canvasUnavailable = ref(false);
const prefersReducedMotion = ref(props.preferences.snapshot.reducedMotion);

const pointerSubject = new BehaviorSubject<PointerPosition | null>(null);
const configSubject = new BehaviorSubject<VisualLabStageConfig>({ ...props.config });
const sizeSubject = new BehaviorSubject<CanvasSize>({ width: 1, height: 1 });
const cleanups: Array<() => void> = [];
let phaseTween: Tween<number> | null = null;
let renderSubscription: Subscription | null = null;
let resizeObserver: ResizeObserver | null = null;
let visibilityObserver: IntersectionObserver | null = null;
let canvasContext: CanvasRenderingContext2D | null = null;
let xMotion: RetargetableMotion | null = null;
let yMotion: RetargetableMotion | null = null;
let xMotionSubscription: Subscription | null = null;
let yMotionSubscription: Subscription | null = null;
let palette = { cyan: '#67e8f9', violet: '#a78bfa' };
let lastFrameAt = 0;
let lastTelemetryAt = 0;
let smoothedFps = 0;
let latestDrawTimeMs = 0;
let latestPointer: PointerPosition | null = null;

function getColor(name: string, fallback: string): string {
  const element = root.value ?? document.documentElement;
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  if (!value) return fallback;
  if (/^rgba?\(/i.test(value) || /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(value)) return value;
  // Theme tokens intentionally store RGB channels as comma-separated numbers for rgba().
  if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(value)) return `rgb(${value})`;
  return fallback;
}

function alphaColor(color: string, alpha: number): string {
  const rgb = color.match(/^rgb\(([^)]+)\)$/i);
  if (rgb?.[1]) return `rgba(${rgb[1]}, ${alpha})`;
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? hex.split('').map((channel) => `${channel}${channel}`).join('') : hex;
    const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
    return `rgba(${channels.join(', ')}, ${alpha})`;
  }
  return color;
}

function drawLattice(context: CanvasRenderingContext2D, frame: StageFrame): void {
  const { width, height } = frame.size;
  if (width <= 0 || height <= 0) return;

  context.clearRect(0, 0, width, height);
  const columns = GRID_COLUMNS;
  const rows = GRID_ROWS;
  const insetX = width * 0.035;
  const insetY = height * 0.09;
  const spanX = width - insetX * 2;
  const spanY = height - insetY * 2;
  const config = frame.config;
  const timePhase = frame.phase * config.timeScale;
  const amplitude = config.springElasticity * (1 - Math.min(0.72, config.airDrag * 5.5)) * Math.min(14, height * 0.035);
  const pointerX = frame.pointer ? frame.pointer.x * width : -width;
  const pointerY = frame.pointer ? frame.pointer.y * height : -height;

  const pointAt = (column: number, row: number): PointerPosition => {
    const baseX = insetX + spanX * column / (columns - 1);
    const baseY = insetY + spanY * row / (rows - 1);
    const wave = Math.sin(timePhase * 1.25 + column * 0.23 + row * 0.41) * amplitude;
    const gravityOffset = (config.gravity / 25) * (row / (rows - 1)) * height * 0.025;
    const dx = baseX - pointerX;
    const dy = baseY - pointerY;
    const distance = Math.hypot(dx / Math.max(1, width), dy / Math.max(1, height));
    const influence = frame.pointer ? Math.max(0, 1 - distance / 0.22) : 0;
    return {
      x: baseX + Math.sin(timePhase + row * 0.7) * amplitude * 0.2 - dx * influence * 0.095,
      y: baseY + wave + gravityOffset - dy * influence * 0.12,
    };
  };

  context.lineWidth = 1;
  for (let row = 0; row < rows; row += 1) {
    context.beginPath();
    for (let column = 0; column < columns; column += 1) {
      const point = pointAt(column, row);
      if (column === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = row % 2 === 0 ? alphaColor(palette.cyan, 0.43) : alphaColor(palette.violet, 0.46);
    context.stroke();
  }

  for (let column = 0; column < columns; column += 1) {
    context.beginPath();
    for (let row = 0; row < rows; row += 1) {
      const point = pointAt(column, row);
      if (row === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = alphaColor(palette.violet, 0.24);
    context.stroke();
  }

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const first = pointAt(column, row);
      const second = pointAt(column + 1, row + 1);
      const third = pointAt(column + 1, row);
      const fourth = pointAt(column, row + 1);
      context.beginPath();
      context.moveTo(first.x, first.y);
      context.lineTo(second.x, second.y);
      context.moveTo(third.x, third.y);
      context.lineTo(fourth.x, fourth.y);
      context.strokeStyle = alphaColor(palette.violet, 0.16);
      context.stroke();
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = pointAt(column, row);
      context.beginPath();
      context.arc(point.x, point.y, frame.pointer && Math.hypot(point.x - pointerX, point.y - pointerY) < 52 ? 2.6 : 1.45, 0, Math.PI * 2);
      context.fillStyle = (column + row) % 7 === 0 ? palette.cyan : palette.violet;
      context.fill();
    }
  }

  if (frame.pointer) {
    context.beginPath();
    context.arc(pointerX, pointerY, 18 + config.springElasticity * 15, 0, Math.PI * 2);
    context.strokeStyle = alphaColor(palette.cyan, 0.4 + (1 - config.airDrag / 0.1) * 0.2);
    context.stroke();
  }
}

function currentSpringOptions() {
  return {
    stiffness: 130 + props.config.springElasticity * 210,
    damping: 12 + props.config.airDrag * 520,
    mass: 1,
  };
}

function publishSpringPointer(): void {
  if (!isPointerActive.value) {
    pointerSubject.next(null);
    return;
  }
  const x = xMotion?.value$.value ?? -1;
  const y = yMotion?.value$.value ?? -1;
  if (x >= 0 && x <= 1 && y >= 0 && y <= 1) pointerSubject.next({ x, y });
  else pointerSubject.next(null);
}

function retargetPointer(x: number, y: number): void {
  if (prefersReducedMotion.value) return;
  const options = currentSpringOptions();
  xMotion?.to(x, options);
  yMotion?.to(y, options);
}

function emitTelemetry(state: VisualLabTelemetry['state'], now = performance.now()): void {
  emit('telemetry', {
    fps: state === 'running' ? Math.round(smoothedFps * 10) / 10 : 0,
    frameTimeMs: Math.round(latestDrawTimeMs * 1000) / 1000,
    nodeCount: GRID_NODE_COUNT,
    pointerX: latestPointer?.x ?? null,
    pointerY: latestPointer?.y ?? null,
    state,
  });
  lastTelemetryAt = now;
}

function resize(): void {
  if (!canvas.value) return;
  try {
    const result = resizeCanvas(canvas.value);
    canvasContext = result.context;
    sizeSubject.next({ width: result.width, height: result.height });
  } catch (error) {
    console.warn('Visual Lab featured canvas could not resize.', error);
  }
}

function syncPlayback(): void {
  if (!phaseTween) return;
  if (isVisible.value && !prefersReducedMotion.value) {
    void phaseTween.play().catch(() => undefined);
    emitTelemetry('running');
  } else {
    phaseTween.stop();
    pointerSubject.next(null);
    latestPointer = null;
    lastFrameAt = 0;
    smoothedFps = 0;
    latestDrawTimeMs = 0;
    emitTelemetry(prefersReducedMotion.value ? 'reduced-motion' : 'idle');
  }
}

function onPointerMove(event: PointerEvent): void {
  const element = root.value;
  if (!element || prefersReducedMotion.value) return;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  isPointerActive.value = true;
  retargetPointer(x, y);
}

function clearPointer(): void {
  isPointerActive.value = false;
  if (prefersReducedMotion.value) {
    pointerSubject.next(null);
    latestPointer = null;
  } else {
    retargetPointer(-1, -1);
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (prefersReducedMotion.value) return;
  const step = event.shiftKey ? 0.12 : 0.04;
  const current = latestPointer ?? { x: 0.5, y: 0.5 };
  let x = current.x;
  let y = current.y;
  if (event.key === 'ArrowLeft') x -= step;
  else if (event.key === 'ArrowRight') x += step;
  else if (event.key === 'ArrowUp') y -= step;
  else if (event.key === 'ArrowDown') y += step;
  else if (event.key === 'Home' || event.key === 'Escape') {
    event.preventDefault();
    resetCenter();
    return;
  } else return;
  event.preventDefault();
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  isPointerActive.value = true;
  retargetPointer(x, y);
}

function resetCenter(): void {
  isPointerActive.value = false;
  xMotion?.stop();
  yMotion?.stop();
  xMotion?.to(-1);
  yMotion?.to(-1);
  pointerSubject.next(null);
  latestPointer = null;
  phaseTween?.seek(0);
  if (!isVisible.value || prefersReducedMotion.value) syncPlayback();
  else emitTelemetry('running');
}

defineExpose({ resetCenter });

watch(() => ({ ...props.config }), (config) => {
  configSubject.next(config);
  if (xMotion && yMotion && latestPointer) retargetPointer(latestPointer.x, latestPointer.y);
}, { deep: true });

onMounted(() => {
  if (!canvas.value) return;
  palette = {
    cyan: getColor('--rx-color-accent-cyan-rgb', '#67e8f9'),
    violet: getColor('--rx-theme-primary', '#a78bfa'),
  };
  resize();
  if (!canvasContext) {
    canvasUnavailable.value = true;
    emitTelemetry('idle');
    return;
  }
  phaseTween = new Tween({
    from: 0,
    to: Math.PI * 2,
    duration: 3200,
    easing: 'linear',
    repeat: Infinity,
    motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  });
  void phaseTween.catch(() => undefined);
  renderSubscription = bindCanvas(canvasContext!, combineLatest([phaseTween.value$, pointerSubject, configSubject, sizeSubject]).pipe(
    map(([phase, pointer, config, size]): StageFrame => ({ phase, pointer, config, size })),
  ), (context, frame) => {
    const before = performance.now();
    latestPointer = frame.pointer;
    drawLattice(context, frame);
    const after = performance.now();
    latestDrawTimeMs = Math.max(0, after - before);
    if (lastFrameAt > 0) {
      const delta = after - lastFrameAt;
      if (delta > 0 && delta < 1000) {
        const sample = 1000 / delta;
        smoothedFps = smoothedFps === 0 ? sample : smoothedFps * 0.7 + sample * 0.3;
      }
    }
    lastFrameAt = after;
    if (after - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) emitTelemetry(isVisible.value && !prefersReducedMotion.value ? 'running' : prefersReducedMotion.value ? 'reduced-motion' : 'idle', after);
  }, { clearOnUnsubscribe: true });

  xMotion = new RetargetableMotion({ initialValue: -1, ...currentSpringOptions() });
  yMotion = new RetargetableMotion({ initialValue: -1, ...currentSpringOptions() });
  xMotionSubscription = xMotion.value$.subscribe(publishSpringPointer);
  yMotionSubscription = yMotion.value$.subscribe(publishSpringPointer);

  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.value);
  } else {
    window.addEventListener('resize', resize, { passive: true });
    cleanups.push(() => window.removeEventListener('resize', resize));
  }

  if (typeof IntersectionObserver !== 'undefined') {
    visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      isVisible.value = entry.isIntersecting && entry.intersectionRatio > 0.05;
      syncPlayback();
    }, { threshold: [0, 0.05, 0.25] });
    visibilityObserver.observe(root.value ?? canvas.value);
  } else {
    isVisible.value = true;
  }

  const preferencesSubscription = props.preferences.state$.subscribe((state) => {
    const changed = prefersReducedMotion.value !== state.reducedMotion;
    prefersReducedMotion.value = state.reducedMotion;
    if (!changed) return;
    if (state.reducedMotion) {
      clearPointer();
      pointerSubject.next(null);
    }
    syncPlayback();
  });
  cleanups.push(() => preferencesSubscription.unsubscribe());
  syncPlayback();
});

onBeforeUnmount(() => {
  phaseTween?.stop();
  xMotionSubscription?.unsubscribe();
  yMotionSubscription?.unsubscribe();
  xMotion?.dispose();
  yMotion?.dispose();
  xMotion = null;
  yMotion = null;
  xMotionSubscription = null;
  yMotionSubscription = null;
  resizeObserver?.disconnect();
  visibilityObserver?.disconnect();
  resizeObserver = null;
  visibilityObserver = null;
  renderSubscription?.unsubscribe();
  renderSubscription = null;
  phaseTween = null;
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  pointerSubject.complete();
  configSubject.complete();
  sizeSubject.complete();
  emitTelemetry('idle');
});
</script>

<template>
  <div
    ref="root"
    class="lab-feature-stage"
    :class="{ 'is-active': isVisible && !prefersReducedMotion, 'is-pointer-active': isPointerActive, 'is-static': prefersReducedMotion }"
    role="group"
    :aria-label="copy.staticText.interactiveCanvasLatticePreview"
    tabindex="0"
    @pointermove="onPointerMove"
    @pointerleave="clearPointer"
    @focusout="clearPointer"
    @keydown="onKeydown"
  >
    <canvas v-if="!canvasUnavailable" ref="canvas" class="lab-feature-stage__canvas" aria-hidden="true" />
    <div v-else class="lab-feature-stage__fallback" role="status">{{ copy.staticText.canvas2DIsUnavailableInThisBrowserTheRestOfVisualLabRemainsAvailable }}</div>
    <div class="lab-feature-stage__vignette" aria-hidden="true" />
    <div v-if="!canvasUnavailable" class="lab-feature-stage__hint">
      {{ prefersReducedMotion ? copy.staticText.reducedMotion : isPointerActive ? copy.staticText.pointerSpringActive : isVisible ? copy.staticText.movePointerOrUseArrowKeys : copy.staticText.stagePausedOffscreen }}
    </div>
  </div>
</template>
