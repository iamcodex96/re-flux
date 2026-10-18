<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { map } from 'rxjs';
import { MotionPreferences, Tween } from '@lib';
import { bindCanvas, resizeCanvas } from '@lib/canvas';
import { animateText } from '@lib/dom';
import { bindSvgAttributes, bindSvgPathDrawing, bindSvgPathMorph } from '@lib/svg';
import { drawParticleConstellation } from '@demos/canvas';
import VisualLabShaderPreview from './VisualLabShaderPreview.vue';
import type { VisualExperimentCategory, VisualExperimentKind, VisualLabShaderKind } from './visualLabTypes';

const props = defineProps<{
  code: string;
  title: string;
  eyebrow: string;
  description: string;
  category: VisualExperimentCategory;
  kind: VisualExperimentKind;
  tags: readonly string[];
  to: string;
  preferences: MotionPreferences;
}>();

const root = ref<HTMLElement | null>(null);
const typographyTarget = ref<HTMLElement | null>(null);
const morphPath = ref<SVGPathElement | null>(null);
const strokePath = ref<SVGPathElement | null>(null);
const liquidTurbulence = ref<SVGFETurbulenceElement | null>(null);
const motionTarget = ref<SVGGElement | null>(null);
const canvasTarget = ref<HTMLCanvasElement | null>(null);
const isActive = ref(false);
const canvasReady = ref(false);
const canvasUnavailable = ref(false);
const motionReduced = ref(props.preferences.snapshot.reducedMotion);

const shaderKinds: readonly VisualLabShaderKind[] = ['dispersion', 'shader-aurora', 'shader-spectrum'];
const canvasKinds: readonly VisualExperimentKind[] = [
  'particles', 'cloth', 'swarm', 'lattice', 'spring-follower', 'inertia', 'soft-body', 'frequency', 'radial',
];
const svgKinds: readonly VisualExperimentKind[] = ['spline', 'path-draw', 'liquid-svg', 'motion-path', 'morph-grid'];
const isShaderKind = computed(() => shaderKinds.includes(props.kind as VisualLabShaderKind));
const shaderKind = computed<VisualLabShaderKind>(() => isShaderKind.value ? props.kind as VisualLabShaderKind : 'dispersion');
const isCanvasKind = computed(() => canvasKinds.includes(props.kind));
const isSvgKind = computed(() => svgKinds.includes(props.kind));

const shapeStart = 'M 34 79 C 63 14 92 129 124 69 S 188 24 211 79 S 252 120 274 60';
const shapeEnd = 'M 34 82 C 68 38 91 110 123 74 S 184 44 210 86 S 247 111 274 63';
const gridStart = 'M 24 42 C 74 42 84 128 132 84 S 214 36 286 112';
const gridEnd = 'M 24 112 C 68 22 106 32 144 90 S 222 138 286 40';
const linePath = 'M 22 128 C 68 28 96 30 129 92 S 193 148 228 72 S 270 38 288 49';
const cleanups: Array<() => void> = [];
let pointerWithin = false;
let focusWithin = false;
let textAnimation: ReturnType<typeof animateText> | null = null;
let sceneTween: Tween<number> | null = null;
let resizeObserver: ResizeObserver | null = null;
let canvasSize = { width: 1, height: 1 };
let canvasContext: CanvasRenderingContext2D | null = null;
let latestCanvasPhase = 0;
let latestPalette = { cyan: '#67e8f9', violet: '#a78bfa', magenta: '#e879f9', amber: '#f6b96e' };
let preferenceSubscription: { unsubscribe(): void } | null = null;

function colorToken(name: string, fallback: string): string {
  const source = root.value ?? document.documentElement;
  const channels = getComputedStyle(source).getPropertyValue(name).trim();
  return channels ? `rgb(${channels})` : fallback;
}

function withAlpha(color: string, opacity: number): string {
  const rgb = color.match(/^rgb\(([^)]+)\)$/i);
  if (rgb?.[1]) return `rgba(${rgb[1]}, ${opacity})`;
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) {
    const value = hex[1];
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
  }
  return color;
}

function readPalette(): void {
  latestPalette = {
    cyan: colorToken('--rx-color-accent-cyan-rgb', '#67e8f9'),
    violet: colorToken('--rx-theme-primary', '#a78bfa'),
    magenta: colorToken('--rx-color-accent-magenta-rgb', '#e879f9'),
    amber: colorToken('--rx-color-accent-amber-rgb', '#f6b96e'),
  };
}

function drawCloth(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const columns = 16;
  const rows = 7;
  const left = width * 0.07;
  const top = height * 0.16;
  const usableWidth = width * 0.86;
  const usableHeight = height * 0.68;
  const pointAt = (column: number, row: number) => {
    const x = left + usableWidth * column / (columns - 1);
    const y = top + usableHeight * row / (rows - 1);
    const envelope = Math.sin(Math.PI * column / (columns - 1));
    const wave = Math.sin(phase * 1.1 + column * 0.38 + row * 0.2);
    return { x, y: y + wave * envelope * 13 + Math.cos(phase + row * 0.5) * 3 };
  };
  context.lineWidth = 1;
  for (let row = 0; row < rows; row += 1) {
    context.beginPath();
    for (let column = 0; column < columns; column += 1) {
      const point = pointAt(column, row);
      if (column === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = row % 2 === 0 ? withAlpha(latestPalette.cyan, 0.53) : withAlpha(latestPalette.violet, 0.53);
    context.stroke();
  }
  for (let column = 0; column < columns; column += 1) {
    context.beginPath();
    for (let row = 0; row < rows; row += 1) {
      const point = pointAt(column, row);
      if (row === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = withAlpha(latestPalette.violet, 0.34);
    context.stroke();
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = pointAt(column, row);
      context.beginPath();
      context.arc(point.x, point.y, column % 3 === 0 ? 1.6 : 1.05, 0, Math.PI * 2);
      context.fillStyle = (row + column) % 5 === 0 ? latestPalette.cyan : latestPalette.violet;
      context.fill();
    }
  }
}

function drawSwarm(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const centerX = width * (0.5 + Math.sin(phase * 0.34) * 0.08);
  const centerY = height * (0.5 + Math.cos(phase * 0.28) * 0.08);
  const points = Array.from({ length: 38 }, (_, index) => {
    const seed = index * 2.399963229728653;
    const orbit = 0.08 + (index % 9) * 0.037;
    const angle = seed + phase * (0.22 + (index % 5) * 0.035);
    return {
      x: centerX + Math.cos(angle) * width * orbit,
      y: centerY + Math.sin(angle * 1.1) * height * orbit * 0.7,
      accent: index % 6 === 0,
    };
  });
  context.lineWidth = 0.8;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    if (!next) return;
    context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(next.x, next.y);
    context.strokeStyle = withAlpha(latestPalette.cyan, 0.18); context.stroke();
  });
  points.forEach((point) => {
    context.beginPath(); context.arc(point.x, point.y, point.accent ? 2.4 : 1.5, 0, Math.PI * 2);
    context.fillStyle = point.accent ? latestPalette.violet : latestPalette.cyan; context.fill();
  });
  context.beginPath(); context.arc(centerX, centerY, 4.5, 0, Math.PI * 2);
  context.fillStyle = latestPalette.amber; context.fill();
}

function drawLattice(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const columns = 13;
  const rows = 7;
  const points: Array<Array<{ x: number; y: number }>> = [];
  for (let row = 0; row < rows; row += 1) {
    const line: Array<{ x: number; y: number }> = [];
    for (let column = 0; column < columns; column += 1) {
      const x = width * (0.08 + column / (columns - 1) * 0.84);
      const y = height * (0.12 + row / (rows - 1) * 0.76);
      line.push({ x, y: y + Math.sin(phase + column * 0.35 + row * 0.32) * 5 });
    }
    points.push(line);
  }
  context.lineWidth = 0.8;
  for (let row = 0; row < rows; row += 1) {
    const line = points[row];
    if (!line) continue;
    context.beginPath();
    line.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
    context.strokeStyle = withAlpha(latestPalette.cyan, 0.35); context.stroke();
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const first = points[row]?.[column]; const nextRow = points[row + 1];
      const diagonal = nextRow?.[column + 1];
      if (!first || !diagonal) continue;
      context.beginPath(); context.moveTo(first.x, first.y); context.lineTo(diagonal.x, diagonal.y);
      context.strokeStyle = withAlpha(latestPalette.violet, 0.25); context.stroke();
    }
  }
  points.flat().forEach((point, index) => {
    context.beginPath(); context.arc(point.x, point.y, index % 6 === 0 ? 2 : 1.2, 0, Math.PI * 2);
    context.fillStyle = index % 6 === 0 ? latestPalette.cyan : latestPalette.violet; context.fill();
  });
}

function drawSpringFollower(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const centerY = height * 0.52;
  const count = 7;
  context.beginPath();
  for (let index = 0; index < count; index += 1) {
    const x = width * (0.1 + index / (count - 1) * 0.8);
    const y = centerY + Math.sin(phase * 1.25 - index * 0.7) * (6 + index * 1.3);
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.strokeStyle = withAlpha(latestPalette.cyan, 0.48); context.lineWidth = 2; context.stroke();
  for (let index = 0; index < count; index += 1) {
    const x = width * (0.1 + index / (count - 1) * 0.8);
    const y = centerY + Math.sin(phase * 1.25 - index * 0.7) * (6 + index * 1.3);
    context.beginPath(); context.arc(x, y, index === Math.floor(count / 2) ? 4 : 2.1, 0, Math.PI * 2);
    context.fillStyle = index % 2 ? latestPalette.cyan : latestPalette.violet; context.fill();
  }
}

function drawInertia(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const cx = width * 0.5; const cy = height * 0.5;
  for (let index = 0; index < 5; index += 1) {
    context.beginPath();
    context.ellipse(cx, cy, width * (0.12 + index * 0.075), height * (0.12 + index * 0.11), phase * 0.08, 0, Math.PI * 2);
    context.strokeStyle = withAlpha(index % 2 ? latestPalette.cyan : latestPalette.violet, 0.18 + index * 0.045);
    context.lineWidth = 1; context.stroke();
  }
  for (let index = 0; index < 26; index += 1) {
    const angle = phase * (0.15 + index * 0.002) + index * 2.399963;
    const radius = 0.08 + (index % 13) / 13 * 0.36;
    const x = cx + Math.cos(angle) * width * radius;
    const y = cy + Math.sin(angle) * height * radius * 0.65;
    context.beginPath(); context.arc(x, y, index % 6 === 0 ? 2.5 : 1.3, 0, Math.PI * 2);
    context.fillStyle = index % 6 === 0 ? latestPalette.amber : latestPalette.cyan; context.fill();
  }
}

function drawSoftBody(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const cx = width * 0.5; const cy = height * 0.5;
  const count = 30;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const radius = Math.min(width, height) * (0.22 + Math.sin(phase * 1.1 + angle * 3) * 0.027 + Math.cos(phase * 0.7 + angle * 5) * 0.015);
    return { x: cx + Math.cos(angle) * radius * 1.35, y: cy + Math.sin(angle) * radius * 0.76 };
  });
  context.beginPath();
  points.forEach((point, index) => index === 0 ? context.moveTo(point.x, point.y) : context.lineTo(point.x, point.y));
  context.closePath(); context.fillStyle = withAlpha(latestPalette.violet, 0.08); context.fill();
  context.strokeStyle = withAlpha(latestPalette.cyan, 0.75); context.lineWidth = 1.4; context.stroke();
  points.forEach((point, index) => {
    context.beginPath(); context.moveTo(cx, cy); context.lineTo(point.x, point.y);
    context.strokeStyle = withAlpha(index % 3 ? latestPalette.violet : latestPalette.cyan, 0.22); context.stroke();
    context.beginPath(); context.arc(point.x, point.y, index % 5 === 0 ? 2.1 : 1.2, 0, Math.PI * 2);
    context.fillStyle = index % 5 === 0 ? latestPalette.cyan : latestPalette.violet; context.fill();
  });
}

function drawFrequency(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const count = 38;
  const gap = width * 0.009;
  const barWidth = (width * 0.84 - gap * (count - 1)) / count;
  const baseY = height * 0.78;
  for (let index = 0; index < count; index += 1) {
    const x = width * 0.08 + index * (barWidth + gap);
    const envelope = Math.sin(Math.PI * index / (count - 1));
    const wave = 0.18 + Math.abs(Math.sin(phase * 1.4 + index * 0.34) * Math.cos(phase * 0.55 + index * 0.16)) * 0.72;
    const barHeight = height * 0.62 * envelope * wave;
    const gradient = context.createLinearGradient(0, baseY - barHeight, 0, baseY);
    gradient.addColorStop(0, latestPalette.violet); gradient.addColorStop(1, latestPalette.cyan);
    context.fillStyle = gradient; context.fillRect(x, baseY - barHeight, barWidth, barHeight);
  }
}

function drawRadial(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  const { width, height } = size;
  const cx = width * 0.5; const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.19;
  for (let index = 0; index < 80; index += 1) {
    const angle = index / 80 * Math.PI * 2;
    const wave = 0.24 + Math.abs(Math.sin(phase * 1.1 + index * 0.24)) * 0.55;
    const inner = radius + 3;
    const outer = inner + Math.min(width, height) * wave * 0.2;
    context.beginPath(); context.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    context.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    context.strokeStyle = index % 5 === 0 ? latestPalette.violet : latestPalette.cyan;
    context.globalAlpha = 0.45 + wave * 0.5; context.lineWidth = index % 5 === 0 ? 2 : 1; context.stroke();
  }
  context.globalAlpha = 1;
  context.beginPath(); context.arc(cx, cy, radius * 0.7, 0, Math.PI * 2);
  context.strokeStyle = withAlpha(latestPalette.violet, 0.42); context.lineWidth = 1; context.stroke();
}

function drawCanvasPreview(context: CanvasRenderingContext2D, phase: number, size: { width: number; height: number }): void {
  context.clearRect(0, 0, size.width, size.height);
  if (props.kind === 'particles') {
    drawParticleConstellation(context, phase, size, {
      count: 28,
      connectionDistance: 42,
      nodeColor: latestPalette.cyan,
      accentColor: latestPalette.violet,
      linkColor: withAlpha(latestPalette.cyan, 0.34),
    });
  } else if (props.kind === 'cloth') drawCloth(context, phase, size);
  else if (props.kind === 'swarm') drawSwarm(context, phase, size);
  else if (props.kind === 'lattice') drawLattice(context, phase, size);
  else if (props.kind === 'spring-follower') drawSpringFollower(context, phase, size);
  else if (props.kind === 'inertia') drawInertia(context, phase, size);
  else if (props.kind === 'soft-body') drawSoftBody(context, phase, size);
  else if (props.kind === 'frequency') drawFrequency(context, phase, size);
  else if (props.kind === 'radial') drawRadial(context, phase, size);
}

function setupSvgPreview(): void {
  if (props.kind === 'spline' || props.kind === 'morph-grid') {
    if (!morphPath.value) return;
    const start = props.kind === 'morph-grid' ? gridStart : shapeStart;
    const end = props.kind === 'morph-grid' ? gridEnd : shapeEnd;
    sceneTween = new Tween({
      from: 0, to: 1, duration: 1500, easing: 'easeInOutSine', repeat: Infinity, yoyo: true,
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void sceneTween.catch(() => undefined);
    const binding = bindSvgPathMorph(morphPath.value, sceneTween.value$, start, end);
    cleanups.push(() => binding.unsubscribe());
    return;
  }

  if (props.kind === 'path-draw' && strokePath.value) {
    sceneTween = new Tween({
      from: 1, to: 0, duration: 1000, easing: 'easeOutCubic',
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void sceneTween.catch(() => undefined);
    const binding = bindSvgPathDrawing(strokePath.value, sceneTween.value$.pipe(map((value) => 1 - value)));
    cleanups.push(() => binding.unsubscribe());
    return;
  }

  if (props.kind === 'liquid-svg' && liquidTurbulence.value) {
    sceneTween = new Tween({
      from: 0, to: 1, duration: 1400, easing: 'easeInOutSine', repeat: Infinity, yoyo: true,
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void sceneTween.catch(() => undefined);
    const binding = bindSvgAttributes(liquidTurbulence.value, sceneTween.value$.pipe(map((value) => ({
      baseFrequency: `${(0.008 + value * 0.022).toFixed(3)} ${(0.014 + value * 0.04).toFixed(3)}`,
    }))));
    cleanups.push(() => binding.unsubscribe());
    return;
  }

  if (props.kind === 'motion-path' && motionTarget.value) {
    sceneTween = new Tween({
      from: 0, to: 1, duration: 1900, easing: 'linear', repeat: Infinity,
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void sceneTween.catch(() => undefined);
    const binding = bindSvgAttributes(motionTarget.value, sceneTween.value$.pipe(map((progress) => {
      const x = 28 + progress * 252;
      const y = 92 - Math.sin(progress * Math.PI * 2) * 46;
      const angle = Math.cos(progress * Math.PI * 2) * 28;
      return { transform: `translate(${x} ${y}) rotate(${angle})` };
    })));
    cleanups.push(() => binding.unsubscribe());
  }
}

function setupCanvasPreview(): void {
  if (!canvasTarget.value) return;
  try {
    const initial = resizeCanvas(canvasTarget.value);
    canvasSize = { width: initial.width, height: initial.height };
    canvasContext = initial.context;
    readPalette();
    sceneTween = new Tween({
      from: 0, to: Math.PI * 2, duration: 2800, easing: 'linear', repeat: Infinity,
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void sceneTween.catch(() => undefined);
    const binding = bindCanvas(canvasContext, sceneTween.value$, (context, phase) => {
      latestCanvasPhase = phase;
      drawCanvasPreview(context, phase, canvasSize);
    }, { clearOnUnsubscribe: true });
    cleanups.push(() => binding.unsubscribe());
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (!canvasTarget.value) return;
        const resized = resizeCanvas(canvasTarget.value);
        canvasSize = { width: resized.width, height: resized.height };
        if (canvasContext) drawCanvasPreview(canvasContext, latestCanvasPhase, canvasSize);
      });
      resizeObserver.observe(canvasTarget.value);
    }
    canvasReady.value = true;
  } catch (error) {
    canvasUnavailable.value = true;
    console.warn(`Visual Lab preview "${props.title}" could not initialize Canvas 2D.`, error);
  }
}

function playPreview(): void {
  if (motionReduced.value || isShaderKind.value) return;
  if (props.kind === 'typography') {
    const target = typographyTarget.value;
    if (!target) return;
    textAnimation?.dispose();
    textAnimation = animateText(target, {
      duration: 720,
      stagger: 30,
      splitBy: 'graphemes',
      fromOpacity: 0,
      fromTransform: 'translateY(0.75em) rotate(6deg)',
      easing: 'easeOutCubic',
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void textAnimation.catch(() => undefined);
    textAnimation.play();
    return;
  }
  if (sceneTween) void sceneTween.restart().catch(() => undefined);
}

function resetPreview(): void {
  if (props.kind === 'typography') {
    textAnimation?.dispose();
    textAnimation = null;
    return;
  }
  sceneTween?.stop();
}

function syncActivation(): void {
  const next = pointerWithin || focusWithin;
  if (next === isActive.value) return;
  isActive.value = next;
  if (next) playPreview();
  else resetPreview();
}

function onPointerEnter(): void { pointerWithin = true; syncActivation(); }
function onPointerLeave(): void { pointerWithin = false; syncActivation(); }
function onFocusIn(): void { focusWithin = true; syncActivation(); }
function onFocusOut(event: FocusEvent): void {
  if (event.relatedTarget instanceof Node && root.value?.contains(event.relatedTarget)) return;
  focusWithin = false;
  syncActivation();
}

function onReducedMotionChange(reduced: boolean): void {
  motionReduced.value = reduced;
  if (reduced) {
    isActive.value = false;
    resetPreview();
  } else if (pointerWithin || focusWithin) {
    isActive.value = true;
    playPreview();
  }
}

onMounted(async () => {
  await nextTick();
  preferenceSubscription = props.preferences.state$.subscribe((state) => onReducedMotionChange(state.reducedMotion));
  if (isSvgKind.value) setupSvgPreview();
  else if (isCanvasKind.value) setupCanvasPreview();
});

onBeforeUnmount(() => {
  preferenceSubscription?.unsubscribe();
  preferenceSubscription = null;
  pointerWithin = false;
  focusWithin = false;
  textAnimation?.dispose();
  textAnimation = null;
  sceneTween?.stop();
  sceneTween = null;
  resizeObserver?.disconnect();
  resizeObserver = null;
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});
</script>

<template>
  <article
    ref="root"
    class="experiment-card"
    :class="[`experiment-card--${kind}`, { 'is-active': isActive, 'is-static': motionReduced }]"
    @pointerenter="onPointerEnter"
    @pointerleave="onPointerLeave"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <div class="experiment-card__art" :class="{ 'is-ready': canvasReady }" aria-hidden="true">
      <div v-if="kind === 'typography'" class="experiment-art experiment-art--typography">
        <span class="experiment-art__eyebrow">STREAM-DRIVEN GLYPHS</span>
        <div ref="typographyTarget" class="experiment-art__kinetic-word">KINETIC</div>
        <span class="experiment-art__metric">Δv · STAGGER</span>
      </div>

      <VisualLabShaderPreview
        v-else-if="isShaderKind"
        :kind="shaderKind"
        :active="isActive"
        :preferences="preferences"
      />

      <svg v-else-if="isSvgKind" class="experiment-art experiment-art--svg" viewBox="0 0 310 170" role="img" :aria-label="`${title} SVG animation preview`">
        <defs>
          <linearGradient :id="`spline-gradient-${code}`" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="var(--rx-color-accent-cyan-bright)" />
            <stop offset="1" stop-color="var(--rx-theme-primary)" />
          </linearGradient>
          <filter :id="`liquid-filter-${code}`">
            <feTurbulence ref="liquidTurbulence" type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="11" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>

        <g v-if="kind === 'path-draw'">
          <path d="M 22 128 C 68 28 96 30 129 92 S 193 148 228 72 S 270 38 288 49" class="experiment-art__spline-shadow" />
          <path ref="strokePath" :d="linePath" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" :stroke="`url(#spline-gradient-${code})`" class="experiment-art__spline-path" />
        </g>

        <g v-else-if="kind === 'spline'">
          <path d="M 20 105 C 60 40 93 122 132 85 S 203 47 232 90 S 275 105 292 55" class="experiment-art__spline-shadow" />
          <path ref="morphPath" :d="shapeStart" :stroke="`url(#spline-gradient-${code})`" class="experiment-art__spline-path" />
          <circle cx="132" cy="85" r="4" class="experiment-art__spline-node" />
        </g>

        <g v-else-if="kind === 'morph-grid'">
          <path d="M 24 42 C 74 42 84 128 132 84 S 214 36 286 112" class="experiment-art__spline-shadow" />
          <path ref="morphPath" :d="gridStart" :stroke="`url(#spline-gradient-${code})`" class="experiment-art__spline-path" />
          <circle cx="144" cy="84" r="3.5" class="experiment-art__spline-node" />
        </g>

        <g v-else-if="kind === 'liquid-svg'" :filter="`url(#liquid-filter-${code})`">
          <path d="M 65 86 C 44 42 98 20 129 48 S 181 38 204 61 S 271 52 265 98 S 194 132 153 112 S 91 145 65 86Z" fill="rgba(var(--rx-theme-primary), 0.14)" :stroke="`url(#spline-gradient-${code})`" stroke-width="2.4" />
          <circle cx="156" cy="82" r="17" fill="rgba(var(--rx-color-accent-cyan-rgb), 0.14)" />
        </g>

        <g v-else-if="kind === 'motion-path'">
          <path :d="linePath" class="experiment-art__spline-shadow" />
          <path :d="linePath" :stroke="`url(#spline-gradient-${code})`" class="experiment-art__motion-track" />
          <g ref="motionTarget" transform="translate(28 92) rotate(28)">
            <path d="M -7 -4 L 8 0 L -7 4 Z" fill="var(--rx-color-accent-cyan-bright)" />
            <circle r="5" fill="rgba(var(--rx-theme-primary), 0.25)" stroke="var(--rx-theme-primary)" />
          </g>
        </g>
      </svg>

      <template v-else-if="isCanvasKind">
        <canvas
          v-if="!canvasUnavailable"
          ref="canvasTarget"
          class="experiment-art__canvas"
          :class="{ 'is-ready': canvasReady }"
        />
        <div v-else class="experiment-art__canvas-fallback" role="img" :aria-label="`${title} preview is unavailable because Canvas 2D is unsupported`">
          <span>CANVAS 2D UNAVAILABLE</span>
          <strong>{{ title }}</strong>
        </div>
      </template>

      <span class="experiment-card__interaction-hint">{{ motionReduced ? 'REDUCED MOTION' : isActive ? 'PLAYING' : 'HOVER TO PLAY' }}</span>
    </div>

    <div class="experiment-card__body">
      <div class="experiment-card__meta">
        <span class="experiment-card__eyebrow">{{ eyebrow }}</span>
        <span class="experiment-card__code">{{ code }}</span>
      </div>
      <h3>{{ title }}</h3>
      <p>{{ description }}</p>
      <div class="experiment-card__footer">
        <div class="experiment-card__tags"><span v-for="tag in tags" :key="tag">{{ tag }}</span></div>
        <RouterLink class="experiment-card__launch" :to="to">Launch view <span aria-hidden="true">↗</span></RouterLink>
      </div>
    </div>
  </article>
</template>
