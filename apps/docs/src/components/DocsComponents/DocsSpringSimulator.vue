<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RetargetableMotion } from '@lib';
import type { Subscription } from 'rxjs';
import { useAppStore } from '../../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const text = computed(() => copy.value.springSimulator);
const stage = ref<HTMLElement | null>(null);
const stiffness = ref(280);
const damping = ref(26);
const mass = ref(1.2);
const x = ref(0);
const y = ref(0);
const velocityX = ref(0);
const velocityY = ref(0);
const isDragging = ref(false);
const activeStreamCount = ref(0);
const reducedMotion = ref(false);
const copied = ref(false);
const motionState = ref<'idle' | 'running' | 'paused' | 'settled'>('idle');
let xMotion: RetargetableMotion | null = null;
let yMotion: RetargetableMotion | null = null;
let xValueSub: Subscription | undefined;
let yValueSub: Subscription | undefined;
let xVelocitySub: Subscription | undefined;
let yVelocitySub: Subscription | undefined;
let xStateSub: Subscription | undefined;
let yStateSub: Subscription | undefined;
let mediaQuery: MediaQueryList | undefined;
let resizeObserver: ResizeObserver | undefined;
let pointerId: number | null = null;
let copyFeedbackTimeout: number | undefined;

const orbStyle = computed(() => ({ transform: `translate(calc(-50% + ${x.value}px), calc(-50% + ${y.value}px))` }));
const displacement = computed(() => Math.hypot(x.value, y.value));
const velocity = computed(() => Math.hypot(velocityX.value, velocityY.value));
type DampingRegime = 'under' | 'critical' | 'over';
const dampingRegimes: DampingRegime[] = ['under', 'critical', 'over'];
const regime = computed<DampingRegime>(() => {
  const criticalDamping = 2 * Math.sqrt(stiffness.value * mass.value);
  const ratio = damping.value / criticalDamping;
  if (Math.abs(ratio - 1) <= 0.08) return 'critical';
  return ratio < 1 ? 'under' : 'over';
});
const configCode = computed(() => `new RetargetableMotion({\n  initialValue: 0,\n  stiffness: ${stiffness.value},\n  damping: ${damping.value},\n  mass: ${mass.value.toFixed(1)},\n});`);

function getOptions() {
  return { stiffness: stiffness.value, damping: damping.value, mass: mass.value };
}

function stopSubscriptions(): void {
  xValueSub?.unsubscribe();
  yValueSub?.unsubscribe();
  xVelocitySub?.unsubscribe();
  yVelocitySub?.unsubscribe();
  xStateSub?.unsubscribe();
  yStateSub?.unsubscribe();
  xValueSub = yValueSub = xVelocitySub = yVelocitySub = xStateSub = yStateSub = undefined;
}

function createMotions(initialX = x.value, initialY = y.value): void {
  stopSubscriptions();
  xMotion?.dispose();
  yMotion?.dispose();
  xMotion = new RetargetableMotion({ initialValue: initialX, ...getOptions() });
  yMotion = new RetargetableMotion({ initialValue: initialY, ...getOptions() });
  xValueSub = xMotion.value$.subscribe((value) => { x.value = value; });
  yValueSub = yMotion.value$.subscribe((value) => { y.value = value; });
  xVelocitySub = xMotion.velocity$.subscribe((value) => { velocityX.value = value; });
  yVelocitySub = yMotion.velocity$.subscribe((value) => { velocityY.value = value; });
  xStateSub = xMotion.state$.subscribe(updateState);
  yStateSub = yMotion.state$.subscribe(updateState);
}

function updateState(): void {
  const states = [xMotion?.state$.value, yMotion?.state$.value];
  if (states.includes('running')) motionState.value = 'running';
  else if (states.includes('paused')) motionState.value = 'paused';
  else if (states.includes('completed')) motionState.value = 'settled';
  else motionState.value = 'idle';
  activeStreamCount.value = Number(Boolean(xMotion)) + Number(Boolean(yMotion));
}

function moveTo(targetX: number, targetY: number): void {
  if (!xMotion || !yMotion) return;
  const bounds = stage.value?.getBoundingClientRect();
  const maxX = Math.max(0, (bounds?.width ?? 600) / 2 - 24);
  const maxY = Math.max(0, (bounds?.height ?? 420) / 2 - 24);
  const nextX = Math.min(maxX, Math.max(-maxX, targetX));
  const nextY = Math.min(maxY, Math.max(-maxY, targetY));
  const targetUnchanged = Math.abs(nextX - xMotion.target$.value) < 0.5
    && Math.abs(nextY - yMotion.target$.value) < 0.5;
  const alreadyAtTarget = Math.abs(nextX - x.value) < 0.5 && Math.abs(nextY - y.value) < 0.5;
  if (targetUnchanged && alreadyAtTarget && motionState.value !== 'running') return;
  if (reducedMotion.value) {
    xMotion.stop();
    yMotion.stop();
    x.value = nextX;
    y.value = nextY;
    velocityX.value = 0;
    velocityY.value = 0;
    motionState.value = 'idle';
    return;
  }
  xMotion.to(nextX, getOptions());
  yMotion.to(nextY, getOptions());
  updateState();
}

function resetCenter(): void {
  isDragging.value = false;
  pointerId = null;
  moveTo(0, 0);
}

function setDampingRegime(next: DampingRegime): void {
  const criticalDamping = 2 * Math.sqrt(stiffness.value * mass.value);
  const multiplier = next === 'under' ? 0.55 : next === 'critical' ? 1 : 1.4;
  damping.value = Math.min(120, Math.round(criticalDamping * multiplier));
}

function triggerImpulse(): void {
  const currentTargetX = xMotion?.target$.value ?? x.value;
  const currentTargetY = yMotion?.target$.value ?? y.value;
  const goOut = Math.hypot(currentTargetX, currentTargetY) < 30;
  moveTo(goOut ? 132 : 0, goOut ? -76 : 0);
}

function startDrag(event: PointerEvent): void {
  if (!stage.value || event.button !== 0) return;
  pointerId = event.pointerId;
  isDragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  moveFromPointer(event);
  event.preventDefault();
}

function moveFromPointer(event: PointerEvent): void {
  if (!stage.value || pointerId !== event.pointerId || !isDragging.value) return;
  const rect = stage.value.getBoundingClientRect();
  moveTo(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
}

function endDrag(event: PointerEvent): void {
  if (pointerId !== event.pointerId) return;
  pointerId = null;
  isDragging.value = false;
}

function onOrbClick(event: MouseEvent): void {
  if (event.detail === 0) triggerImpulse();
}

function onOrbKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 24 : 10;
  const next = { x: x.value, y: y.value };
  if (event.key === 'ArrowLeft') next.x -= step;
  else if (event.key === 'ArrowRight') next.x += step;
  else if (event.key === 'ArrowUp') next.y -= step;
  else if (event.key === 'ArrowDown') next.y += step;
  else return;
  event.preventDefault();
  moveTo(next.x, next.y);
}

async function copyConfig(): Promise<void> {
  try {
    await navigator.clipboard.writeText(`import { RetargetableMotion } from '@re-code/flux';\n\nconst motion = ${configCode.value}`);
    copied.value = true;
    window.clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = window.setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    copied.value = false;
  }
}

function readReducedMotion(): void {
  reducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

watch(reducedMotion, () => {
  createMotions(x.value, y.value);
});

watch([stiffness, damping, mass], () => {
  if (xMotion && yMotion && motionState.value === 'running') {
    xMotion.to(xMotion.target$.value, getOptions());
    yMotion.to(yMotion.target$.value, getOptions());
  }
});

onMounted(() => {
  readReducedMotion();
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  mediaQuery.addEventListener('change', readReducedMotion);
  createMotions(0, 0);
  if (stage.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      moveTo(x.value, y.value);
    });
    resizeObserver.observe(stage.value);
  }
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', readReducedMotion);
  resizeObserver?.disconnect();
  window.clearTimeout(copyFeedbackTimeout);
  stopSubscriptions();
  xMotion?.dispose();
  yMotion?.dispose();
});
</script>

<template>
  <section id="live-spring-simulator" class="docs-anchor docs-spring-simulator">
    <header class="docs-demo-heading">
      <div class="docs-demo-heading__title"><UiIcon icon="mdi-tune-variant" size="20" /><h2>{{ text.title }}</h2><span class="docs-demo-status">{{ motionState === 'running' ? text.running : motionState === 'settled' ? text.settled : text.staged }}</span></div>
      <p class="docs-demo-heading__hint">{{ text.hint }}</p>
    </header>

    <div class="docs-spring-console">
      <div ref="stage" role="group" class="docs-spring-stage" :class="{ 'docs-spring-stage--dragging': isDragging }" :aria-label="text.stageAriaLabel" @pointermove="moveFromPointer" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag">
        <div class="docs-spring-stage__telemetry">
          <span class="docs-spring-stage__state"><i /> {{ text.activeStream }}: <strong>{{ motionState === 'running' ? text.running : text.idle }}</strong></span>
          <span>{{ text.solver }}: <strong>semi-implicit Euler</strong></span>
          <span>{{ text.coordinate }}: <strong>X {{ x.toFixed(1) }}, Y {{ y.toFixed(1) }}</strong></span>
        </div>
        <button class="docs-spring-orb" :class="{ 'docs-spring-orb--dragging': isDragging }" :style="orbStyle" type="button" :aria-label="text.orbAriaLabel" @pointerdown="startDrag" @keydown="onOrbKeydown" @click="onOrbClick"><UiIcon icon="mdi-target" size="22" /></button>
        <div class="docs-spring-stage__metrics">
          <div><span>{{ text.velocity }}</span><strong>{{ velocity.toFixed(1) }} px/s</strong></div>
          <div><span>{{ text.displacement }}</span><strong>{{ displacement.toFixed(2) }} px</strong></div>
          <div><span>{{ text.streams }}</span><strong>{{ activeStreamCount }} {{ text.active }}</strong></div>
          <div><span>{{ text.gcLabel }}</span><strong>{{ text.notMeasured }}</strong></div>
        </div>
      </div>

      <aside class="docs-spring-controls" :aria-label="text.controlsAriaLabel">
        <div class="docs-spring-controls__topline"><span>{{ text.tuning }}</span><span class="docs-spring-controls__regime">{{ text.regime }}: <strong>{{ text.regimes[regime] }}</strong></span></div>
        <label class="docs-spring-control">
          <span><span>{{ text.stiffness }}</span><output>{{ stiffness }}</output></span>
          <input v-model.number="stiffness" type="range" min="50" max="600" step="10" :aria-label="text.stiffness" />
          <small><span>{{ text.loose }}</span><span>{{ text.snappy }}</span></small>
        </label>
        <label class="docs-spring-control docs-spring-control--violet">
          <span><span>{{ text.damping }}</span><output>{{ damping }}</output></span>
          <input v-model.number="damping" type="range" min="0" max="120" step="1" :aria-label="text.damping" />
          <small><span>{{ text.oscillate }}</span><span>{{ text.overdamped }}</span></small>
        </label>
        <label class="docs-spring-control docs-spring-control--violet">
          <span><span>{{ text.mass }}</span><output>{{ mass.toFixed(1) }}</output></span>
          <input v-model.number="mass" type="range" min="0.2" max="5" step="0.1" :aria-label="text.mass" />
          <small><span>{{ text.feather }}</span><span>{{ text.inertial }}</span></small>
        </label>
        <div class="docs-spring-regime-control">
          <span class="docs-spring-regime-control__label">{{ text.regimeControlLabel }}</span>
          <div class="docs-spring-regime-control__options" role="group" :aria-label="text.regimeControlLabel">
            <button v-for="item in dampingRegimes" :key="item" type="button" :aria-pressed="regime === item" :class="{ 'is-active': regime === item }" @click="setDampingRegime(item)">{{ text.regimes[item] }}</button>
          </div>
        </div>
        <div class="docs-spring-controls__actions">
          <button class="docs-spring-button docs-spring-button--primary" type="button" @click="triggerImpulse"><UiIcon icon="mdi-lightning-bolt" size="18" /> {{ text.triggerImpulse }}</button>
          <div class="docs-spring-controls__secondary">
            <button class="docs-spring-button" type="button" @click="resetCenter"><UiIcon icon="mdi-refresh" size="16" /> {{ text.resetCenter }}</button>
            <button class="docs-spring-button" type="button" @click="copyConfig"><UiIcon :icon="copied ? 'mdi-check' : 'mdi-content-copy'" size="16" /> {{ copied ? copy.ui.copied : text.copyConfig }}</button>
          </div>
          <p v-if="reducedMotion" class="docs-spring-controls__note">{{ text.reducedMotionNote }}</p>
        </div>
      </aside>
    </div>
  </section>
</template>
