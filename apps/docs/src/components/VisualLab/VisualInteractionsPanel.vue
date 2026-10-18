<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { MotionPreferences, cubicBezier } from '@lib';
import { animateNumber, animateText, draggable, flip, type DraggableHandle } from '@lib/dom';

const draggableStage = ref<HTMLElement | null>(null);
const draggableOrb = ref<HTMLElement | null>(null);
const kineticTitle = ref<HTMLElement | null>(null);
const counterPanel = ref<HTMLElement | null>(null);
const countSamples = ref<HTMLElement | null>(null);
const countLatency = ref<HTMLElement | null>(null);
const countUptime = ref<HTMLElement | null>(null);
const layoutTarget = ref<HTMLElement | null>(null);
const preferences = new MotionPreferences();
const cleanups: Array<() => void> = [];
let layoutAnimation: ReturnType<typeof flip> | null = null;
let kineticTextAnimation: ReturnType<typeof animateText> | null = null;
let counterAnimations: Array<ReturnType<typeof animateNumber>> = [];
let countersStarted = false;
let draggableHandle: DraggableHandle | null = null;
let draggableCleanupRegistered = false;
const layoutReversed = ref(false);

function setupKineticText(): void {
  const target = kineticTitle.value;
  if (!target) return;
  const textAnimation = animateText(target, {
    duration: 720,
    stagger: 26,
    splitBy: 'graphemes',
    fromOpacity: 0.08,
    fromTransform: 'translateY(0.7em) rotate(5deg)',
    easing: cubicBezier(0.16, 1, 0.3, 1),
    motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  });
  kineticTextAnimation = textAnimation;
  textAnimation.play();
  cleanups.push(() => {
    kineticTextAnimation?.dispose();
    kineticTextAnimation = null;
  });
}

function replayKineticText(): void {
  kineticTextAnimation?.restart();
}

function setupDraggable(): void {
  const stage = draggableStage.value;
  const orb = draggableOrb.value;
  if (!stage || !orb) return;
  draggableHandle?.destroy();
  stage.classList.remove('is-dragging');
  draggableHandle = draggable(orb, {
    axis: 'both',
    initialPosition: { x: 22, y: 22 },
    friction: 5.5,
    minVelocity: 15,
    velocitySmoothing: 0.72,
    snapTo: 12,
    snapDuration: 320,
    getBounds: () => ({
      minX: 0,
      minY: 0,
      maxX: Math.max(0, stage.clientWidth - orb.offsetWidth),
      maxY: Math.max(0, stage.clientHeight - orb.offsetHeight),
    }),
    onStart: () => stage.classList.add('is-dragging'),
    onEnd: () => stage.classList.remove('is-dragging'),
    onError: (error) => console.error('re;Flux draggable demo failed:', error),
  });
  if (!draggableCleanupRegistered) {
    draggableCleanupRegistered = true;
    cleanups.push(() => {
      draggableHandle?.destroy();
      draggableHandle = null;
      stage.classList.remove('is-dragging');
      draggableCleanupRegistered = false;
    });
  }
}

function resetDraggable(): void {
  setupDraggable();
}

function setupCounters(): void {
  if (!countSamples.value || !countLatency.value || !countUptime.value || !counterPanel.value) return;
  const counters = [
    animateNumber(countSamples.value, {
      from: 0, to: 12840, duration: 2200, easing: 'easeOutExpo',
      format: (value) => Math.round(value).toLocaleString('en-US'),
      motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    }),
    animateNumber(countLatency.value, {
      from: 980, to: 16, duration: 1900, easing: 'easeOutCubic',
      format: (value) => `${Math.max(0, Math.round(value))} ms`,
      motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    }),
    animateNumber(countUptime.value, {
      from: 0, to: 99.98, duration: 2400, easing: 'easeOutExpo',
      format: (value) => `${value.toFixed(2)}%`,
      motion: { preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    }),
  ];
  counterAnimations = counters;
  countersStarted = false;
  const startCounters = (): void => {
    if (countersStarted) return;
    countersStarted = true;
    counters.forEach((counter) => counter.play());
  };
  let observer: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        startCounters();
        observer?.disconnect();
        observer = null;
      }
    }, { threshold: 0.18 });
    observer.observe(counterPanel.value);
  } else {
    startCounters();
  }
  cleanups.push(() => {
    observer?.disconnect();
    counters.forEach((counter) => counter.dispose());
    counterAnimations = [];
    countersStarted = false;
  });
}

function replayCounters(): void {
  if (counterAnimations.length === 0) return;
  countersStarted = true;
  counterAnimations.forEach((counter) => counter.restart());
}

function toggleLayout(): void {
  if (!layoutTarget.value) return;
  layoutAnimation?.dispose();
  layoutReversed.value = !layoutReversed.value;
  layoutAnimation = flip(layoutTarget.value.querySelectorAll<HTMLElement>('.layout-tile'), () => {
    const tiles = Array.from(layoutTarget.value!.querySelectorAll<HTMLElement>('.layout-tile'));
    tiles.forEach((tile, index) => {
      tile.style.order = String(layoutReversed.value ? tiles.length - index : index + 1);
    });
  }, { duration: 640, easing: 'easeOutCubic', stagger: 35 });
  layoutAnimation.play();
}

onMounted(async () => {
  await nextTick();
  setupDraggable();
  setupKineticText();
  setupCounters();
});

onBeforeUnmount(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  layoutAnimation?.dispose();
  layoutAnimation = null;
  preferences.destroy();
});
</script>

<template>
  <UiRow class="visual-demo-grid">
    <UiCol cols="12">
        <UiCard class="visual-card visual-card--counters" variant="outlined">
          <UiCardText class="pa-5 pa-md-6">
            <div class="visual-card__heading"><UiChip size="small" variant="tonal" color="success">05 / Data</UiChip><span class="text-caption text-medium-emphasis">Numeric interpolation</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Values can be the animation.</h3>
            <p class="text-body-2 text-medium-emphasis">Count-ups and metric transitions are driven by the same timeline engine. This scene starts when it enters the viewport, then cleans up its text bindings on teardown.</p>
            <div ref="counterPanel" class="counter-board">
              <div class="counter-tile"><span>Reactive samples</span><strong ref="countSamples">0</strong><small>processed</small></div>
              <div class="counter-tile"><span>Frame latency</span><strong ref="countLatency">980 ms</strong><small>to 16 ms</small></div>
              <div class="counter-tile"><span>Availability</span><strong ref="countUptime">0.00%</strong><small>target reached</small></div>
            </div>
            <div class="d-flex justify-space-between align-center mt-4 ga-3"><span class="text-caption text-medium-emphasis">animateNumber(element, { from, to, format })</span><div class="d-flex align-center ga-2"><UiButton color="success" variant="tonal" size="small" aria-label="Replay metric counters" @click="replayCounters"><UiIcon start>mdi-replay</UiIcon>Replay</UiButton><UiIcon color="success">mdi-counter</UiIcon></div></div>
          </UiCardText>
        </UiCard>
      </UiCol>

<UiCol cols="12">
        <UiCard class="visual-card visual-card--drag" variant="outlined">
          <UiCardText class="pa-5 pa-md-6">
            <div class="visual-card__heading"><UiChip size="small" variant="tonal" color="warning">06 / Interaction</UiChip><span class="text-caption text-medium-emphasis">Pointer physics</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Drag it. Release it. Let physics finish.</h3>
            <p class="text-body-2 text-medium-emphasis">This interaction combines pointer capture, filtered velocity, dynamic bounds, inertial release, eased snap-to-grid and keyboard arrows. Try dragging quickly, then use the arrow keys.</p>
            <div ref="draggableStage" class="draggable-stage">
              <div class="draggable-stage__grid" aria-hidden="true"></div>
              <div ref="draggableOrb" class="draggable-orb" role="group" aria-label="Draggable reactive orb. Use arrow keys to move it."><UiIcon size="28">mdi-atom-variant</UiIcon></div>
              <span class="draggable-stage__hint">DRAG / ARROW KEYS</span>
            </div>
            <div class="d-flex align-center justify-space-between mt-4 ga-3"><span class="text-caption text-medium-emphasis">draggable(element, { getBounds, friction })</span><UiButton size="small" variant="tonal" color="primary" @click="resetDraggable">Reset <UiIcon end>mdi-restore</UiIcon></UiButton></div>
          </UiCardText>
        </UiCard>
      </UiCol>

<UiCol cols="12">
        <UiCard class="visual-card" variant="outlined">
          <UiCardText class="pa-5 pa-md-6">
            <div class="visual-card__heading"><UiChip size="small" variant="tonal" color="success">13 / Typography</UiChip><span class="text-caption text-medium-emphasis">Staggered characters</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Let type become a visual element.</h3>
            <p class="text-body-2 text-medium-emphasis">Character-level timing, rotation and opacity produce a reveal that feels more tactile than a single translation.</p>
            <div ref="kineticTitle" class="kinetic-stage">Reactive motion.</div>
            <div class="d-flex justify-space-between align-center mt-4 ga-3"><span class="text-caption text-medium-emphasis">animateText(element, { splitBy, stagger, easing })</span><UiButton color="primary" variant="tonal" size="small" aria-label="Replay staggered typography animation" @click="replayKineticText"><UiIcon start>mdi-replay</UiIcon>Replay</UiButton></div>
          </UiCardText>
        </UiCard>
      </UiCol>

<UiCol cols="12">
        <UiCard class="visual-card" variant="outlined">
          <UiCardText class="pa-5 pa-md-6">
            <div class="visual-card__heading"><UiChip size="small" variant="tonal" color="warning">14 / Layout</UiChip><span class="text-caption text-medium-emphasis">FLIP transition</span></div>
            <h3 class="text-h6 font-weight-bold mt-4 mb-2">Animate layout changes, not just transforms.</h3>
            <p class="text-body-2 text-medium-emphasis">Reorder these tiles. FLIP measures their old and new geometry, then animates the inverse transform back to identity.</p>
            <div ref="layoutTarget" class="layout-stage">
              <div v-for="number in [1, 2, 3, 4]" :key="number" class="layout-tile" :data-tile="number"><span>0{{ number }}</span><UiIcon size="18">{{ ['mdi-shape-outline', 'mdi-hexagon-outline', 'mdi-circle-outline', 'mdi-triangle-outline'][number - 1] }}</UiIcon></div>
            </div>
            <div class="d-flex align-center justify-space-between mt-4 ga-3"><span class="text-caption text-medium-emphasis">flip(elements, mutate, options)</span><UiButton color="primary" variant="tonal" size="small" @click="toggleLayout">{{ layoutReversed ? 'Restore order' : 'Reorder tiles' }}<UiIcon end>mdi-swap-horizontal</UiIcon></UiButton></div>
          </UiCardText>
        </UiCard>
      </UiCol>
  </UiRow>
</template>
