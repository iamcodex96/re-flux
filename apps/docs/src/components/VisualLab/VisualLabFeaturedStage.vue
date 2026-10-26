<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { combineLatest, BehaviorSubject, map, type Subscription } from 'rxjs';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MotionPreferences, RetargetableMotion, Tween } from '@lib';
import { combineSteering, flee, seek, separate, stepSteeringAgent, type SteeringAgent, type WeightedSteeringForce } from '@lib/steering';
import { distanceBetween, vectorFromAngle } from '@lib/utils';
import { createBubbleChamberLayer, drawBubbleChamberDrift, drawBubbleChamberMotion, type BubbleChamberPalette } from './bubbleChamberBackground';
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

const GLYPH_TEXT = 're;Flux';
const GLYPHS = Array.from(GLYPH_TEXT);
const GLYPH_COUNT = GLYPHS.length;
const MAX_GLYPH_SPEED = 164;
const MAX_GLYPH_FORCE = 620;
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
let palette: BubbleChamberPalette = {
  cyan: '#67e8f9',
  violet: '#a78bfa',
  background: '#080b16',
};
let backgroundSeed = createBackgroundSeed();

function createBackgroundSeed(previousSeed?: number): number {
  const nextSeed = Math.floor(Math.random() * 0xffff_ffff) >>> 0;
  return previousSeed !== undefined && nextSeed === previousSeed ? (nextSeed + 1) >>> 0 : nextSeed;
}
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

interface GlyphTrailPoint { x: number; y: number }
interface KineticGlyphAgent {
  readonly character: string;
  readonly index: number;
  readonly phase: number;
  readonly width: number;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  trail: GlyphTrailPoint[];
}

let glyphAgents: KineticGlyphAgent[] = [];
let glyphLayoutSignature = '';
let glyphFontSize = 48;
let glyphFontFamily = 'monospace';
let bubbleBackgroundLayer: HTMLCanvasElement | null = null;
let bubbleBackgroundSignature = '';

function ensureBubbleBackground(width: number, height: number): HTMLCanvasElement | null {
  const signature = `${Math.ceil(width)}|${Math.ceil(height)}|${backgroundSeed}|${palette.cyan}|${palette.violet}|${palette.background}`;
  if (!bubbleBackgroundLayer || signature !== bubbleBackgroundSignature) {
    bubbleBackgroundLayer = createBubbleChamberLayer(width, height, backgroundSeed, palette);
    bubbleBackgroundSignature = signature;
  }
  return bubbleBackgroundLayer;
}

function ensureGlyphLayout(context: CanvasRenderingContext2D, width: number, height: number): void {
  const styleSource = root.value ?? document.documentElement;
  const family = getComputedStyle(styleSource).getPropertyValue('--rx-font-mono').trim() || 'monospace';
  const fontSize = Math.max(27, Math.min(116, width * 0.1, height * 0.24));
  const signature = `${width}|${height}|${fontSize.toFixed(2)}|${family}`;
  if (signature === glyphLayoutSignature && glyphAgents.length === GLYPH_COUNT) return;

  const previous = glyphAgents;
  glyphFontSize = fontSize;
  glyphFontFamily = family;
  context.font = `800 ${glyphFontSize}px ${glyphFontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const metrics = GLYPHS.map((character) => context.measureText(character));
  const widths = metrics.map((metric) => metric.width);
  const tracking = glyphFontSize * 0.055;
  const totalWidth = widths.reduce((total, value) => total + value, 0) + tracking * Math.max(0, GLYPH_COUNT - 1);
  let cursorX = (width - totalWidth) / 2;
  const homeY = height * 0.48;
  const scatterX = Math.min(width * 0.13, glyphFontSize * 1.55);
  const scatterY = Math.min(height * 0.18, glyphFontSize * 0.9);

  glyphAgents = GLYPHS.map((character, index) => {
    const measuredWidth = widths[index] ?? glyphFontSize * 0.55;
    const homeX = cursorX + measuredWidth / 2;
    cursorX += measuredWidth + tracking;
    const oldAgent = previous[index];
    const phase = index * 2.399963229728653;
    const offsetX = oldAgent ? oldAgent.x - oldAgent.homeX : Math.cos(phase) * scatterX;
    const offsetY = oldAgent ? oldAgent.y - oldAgent.homeY : Math.sin(phase * 1.27) * scatterY;
    return {
      character,
      index,
      phase,
      width: measuredWidth,
      homeX,
      homeY,
      x: homeX + offsetX,
      y: homeY + offsetY,
      vx: oldAgent?.vx ?? Math.sin(phase + 0.7) * 16,
      vy: oldAgent?.vy ?? Math.cos(phase + 0.3) * 16,
      rotation: oldAgent?.rotation ?? Math.cos(phase) * 5,
      trail: [],
    };
  });
  glyphLayoutSignature = signature;
}

function applyGlyphSteering(
  agent: KineticGlyphAgent,
  body: SteeringAgent,
  neighbours: readonly SteeringAgent[],
  frame: StageFrame,
  deltaSeconds: number,
): void {
  const config = frame.config;
  const scaledTime = frame.phase * config.timeScale;
  const targetY = agent.homeY + Math.sin(scaledTime * 0.82 + agent.phase) * (1.2 + config.springElasticity * 1.7);
  const target = { x: agent.homeX, y: targetY };
  const distanceToHome = distanceBetween(body, target);
  const desiredSpeed = Math.min(MAX_GLYPH_SPEED, distanceToHome * (2.25 + config.springElasticity * 2.4));
  const seekForce = seek(body, target, { maxSpeed: desiredSpeed, maxForce: MAX_GLYPH_FORCE });
  const forces: WeightedSteeringForce[] = [
    { force: seekForce },
    { force: { x: 0, y: (config.gravity - 9.81) * 1.25 } },
  ];

  // The shared separation behavior replaces the former per-glyph neighbour loop.
  const separationRadius = Math.max(10, Math.min(glyphFontSize * 0.42, agent.width * 0.58));
  const separation = separate(body, neighbours, {
    distance: separationRadius,
    maxSpeed: MAX_GLYPH_SPEED,
    maxForce: MAX_GLYPH_FORCE * 0.78,
  });
  forces.push({ force: separation });

  // The smoothed pointer comes from RetargetableMotion; flee is shared with the DOM demo.
  if (frame.pointer) {
    const pointer = { x: frame.pointer.x * frame.size.width, y: frame.pointer.y * frame.size.height };
    const pointerDistance = distanceBetween(body, pointer);
    const fleeRadius = Math.min(172, Math.max(94, frame.size.width * 0.2));
    if (pointerDistance < fleeRadius) {
      const influence = 1 - pointerDistance / fleeRadius;
      const fleeForce = influence * influence * (390 + config.springElasticity * 480);
      const escape = flee(body, pointer, { radius: fleeRadius, maxSpeed: MAX_GLYPH_SPEED, maxForce: fleeForce });
      forces.push({ force: escape });
      if (pointerDistance <= 0.001) forces.push({ force: vectorFromAngle(agent.phase, fleeForce) });
      forces.push({ force: {
        x: Math.cos(scaledTime * 1.4 + agent.phase) * influence * 18,
        y: Math.sin(scaledTime * 1.25 + agent.phase) * influence * 18,
      } });
    }
  }

  const steeringForce = combineSteering(forces, MAX_GLYPH_FORCE * 1.8);
  const next = stepSteeringAgent(body, steeringForce, deltaSeconds, {
    maxSpeed: MAX_GLYPH_SPEED,
    linearDamping: 2.5 + config.airDrag * 18,
    maxDeltaSeconds: 0.04,
  });
  agent.x = next.x;
  agent.y = next.y;
  agent.vx = next.vx;
  agent.vy = next.vy;
  agent.rotation = Math.max(-8, Math.min(8, agent.vx * 0.035 + (agent.x - agent.homeX) * 0.085));

  if (Math.hypot(agent.vx, agent.vy) > 5 || frame.pointer) {
    agent.trail.push({ x: agent.x, y: agent.y });
    if (agent.trail.length > 8) agent.trail.shift();
  } else if (agent.trail.length > 0) {
    agent.trail.shift();
  }
}

function drawKineticTypography(context: CanvasRenderingContext2D, frame: StageFrame, rawDeltaSeconds: number): void {
  const { width, height } = frame.size;
  if (width <= 0 || height <= 0) return;
  ensureGlyphLayout(context, width, height);
  const deltaSeconds = Math.min(0.04, Math.max(0.001, rawDeltaSeconds)) * frame.config.timeScale;

  context.clearRect(0, 0, width, height);
  const backgroundLayer = ensureBubbleBackground(width, height);
  if (backgroundLayer) context.drawImage(backgroundLayer, 0, 0, width, height);
  const scenePhase = frame.phase * frame.config.timeScale;
  drawBubbleChamberMotion(context, width, height, scenePhase, backgroundSeed, palette);
  drawBubbleChamberDrift(context, width, height, scenePhase, backgroundSeed, palette);

  // Every agent reads the same per-frame snapshot, so steering is independent of iteration order.
  const steeringBodies: SteeringAgent[] = glyphAgents.map((agent) => ({
    x: agent.x,
    y: agent.y,
    vx: agent.vx,
    vy: agent.vy,
  }));
  for (let index = 0; index < glyphAgents.length; index += 1) {
    const agent = glyphAgents[index];
    const body = steeringBodies[index];
    if (!agent || !body) continue;
    applyGlyphSteering(agent, body, steeringBodies, frame, deltaSeconds);
  }

  // Motion trails make the typography read as a moving system, not a static title with transforms.
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const agent of glyphAgents) {
    if (agent.trail.length < 2) continue;
    const color = agent.index % 3 === 0 ? palette.violet : palette.cyan;
    for (let index = agent.trail.length - 1; index > 0; index -= 1) {
      const from = agent.trail[index];
      const to = agent.trail[index - 1];
      if (!from || !to) continue;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.strokeStyle = alphaColor(color, 0.045 + (agent.trail.length - index) * 0.022);
      context.lineWidth = 0.65 + (agent.trail.length - index) * 0.08;
      context.stroke();
    }
  }

  context.font = `800 ${glyphFontSize}px ${glyphFontFamily}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  glyphAgents.forEach((agent) => {
    const accent = agent.index === 2 || agent.index === 5 ? palette.cyan : agent.index % 3 === 0 ? palette.violet : '#eef3ff';
    context.save();
    context.translate(agent.x, agent.y);
    context.rotate(agent.rotation * Math.PI / 180);
    context.shadowColor = accent;
    context.shadowBlur = frame.pointer ? 17 : 8;
    context.globalAlpha = 0.24;
    context.lineWidth = Math.max(1, glyphFontSize * 0.018);
    context.strokeStyle = accent;
    context.strokeText(agent.character, 0, 0);
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    context.fillStyle = accent;
    context.fillText(agent.character, 0, 0);
    context.restore();
  });

  if (frame.pointer) {
    const pointerX = frame.pointer.x * width;
    const pointerY = frame.pointer.y * height;
    context.beginPath();
    context.arc(pointerX, pointerY, 7 + frame.config.springElasticity * 5, 0, Math.PI * 2);
    context.strokeStyle = alphaColor(palette.cyan, 0.3);
    context.lineWidth = 1;
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
    nodeCount: GLYPH_COUNT,
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

function replayTypography(): void {
  backgroundSeed = createBackgroundSeed(backgroundSeed);
  bubbleBackgroundLayer = null;
  bubbleBackgroundSignature = '';
  glyphAgents = [];
  glyphLayoutSignature = '';
  lastFrameAt = 0;
  smoothedFps = 0;
  latestDrawTimeMs = 0;
  isPointerActive.value = false;
  latestPointer = null;
  pointerSubject.next(null);
  xMotion?.to(-1);
  yMotion?.to(-1);
  phaseTween?.seek(0);
  if (isVisible.value && !prefersReducedMotion.value) void phaseTween?.play().catch(() => undefined);
}

defineExpose({ resetCenter, replayTypography });

watch(() => ({ ...props.config }), (config) => {
  configSubject.next(config);
  if (xMotion && yMotion && latestPointer) retargetPointer(latestPointer.x, latestPointer.y);
}, { deep: true });

onMounted(() => {
  if (!canvas.value) return;
  palette = {
    cyan: getColor('--rx-color-accent-cyan-rgb', '#67e8f9'),
    violet: getColor('--rx-theme-primary', '#a78bfa'),
    background: getColor('--rx-color-canvas-night-deep', '#080b16'),
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
    const deltaSeconds = lastFrameAt > 0 ? Math.min(0.04, Math.max(0.001, (before - lastFrameAt) / 1000)) : 1 / 60;
    latestPointer = frame.pointer;
    drawKineticTypography(context, frame, deltaSeconds);
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
  bubbleBackgroundLayer = null;
  bubbleBackgroundSignature = '';
  glyphAgents = [];
  glyphLayoutSignature = '';
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
    :aria-label="copy.staticText.interactiveKineticTypographyCanvas"
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
