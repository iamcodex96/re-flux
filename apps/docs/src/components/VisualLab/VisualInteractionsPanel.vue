<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { nextTick, onBeforeUnmount, onMounted, ref, watch, computed } from 'vue';
import { MotionPreferences } from '@lib';
import { animateNumber, draggable, flip, type DraggableHandle } from '@lib/dom';
import { createKineticTypography, type KineticTypographyHandle } from './kineticTypographyMotion';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';

type InteractionKind = 'counters' | 'drag' | 'typography' | 'layout';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualInteractionsPanel);

const activeScene = ref<string>('drag');
const draggableStage = ref<HTMLElement | null>(null);
const draggableOrb = ref<HTMLElement | null>(null);
const kineticTitle = ref<HTMLElement | null>(null);
const counterPanel = ref<HTMLElement | null>(null);
const countSamples = ref<HTMLElement | null>(null);
const countLatency = ref<HTMLElement | null>(null);
const countUptime = ref<HTMLElement | null>(null);
const layoutTarget = ref<HTMLElement | null>(null);
const preferences = new MotionPreferences();
const activeCleanups: Array<() => void> = [];
let layoutAnimation: ReturnType<typeof flip> | null = null;
let kineticTypography: KineticTypographyHandle | null = null;
let counterAnimations: Array<ReturnType<typeof animateNumber>> = [];
let countersStarted = false;
let draggableHandle: DraggableHandle | null = null;
let draggableCleanupRegistered = false;
const layoutReversed = ref(false);

const scenes: readonly VisualLabSceneDefinition[] = [
  {
    id: 'drag', category: '06 / INTERACTION', title: copy.value.staticText.dragItReleaseItLetPhysicsFinish,
    description: copy.value.staticText.thisInteractionCombinesPointerCaptureFilteredVelocityc24aab,
    stageLabel: copy.value.staticText.interactiveDOMSTAGE, fileLabel: copy.value.staticText.draggableTs, stageTag: copy.value.staticText.pointerVELOCITYBOUNDS, ariaLabel: copy.value.staticText.dragTheReactiveOrbOrUseTheArrowKeys,
    snippet: `import { draggable } from '@re-code/flux/dom';\n\nconst handle = draggable(element, {\n  axis: 'both',\n  friction: 5.5,\n  velocitySmoothing: 0.72,\n  snapTo: 12,\n  snapDuration: 320,\n  getBounds: () => ({\n    minX: 0, minY: 0,\n    maxX: stage.clientWidth - element.offsetWidth,\n    maxY: stage.clientHeight - element.offsetHeight,\n  }),\n});\n\n// Dispose pointer listeners and motion state on teardown.\nreturn () => handle.destroy();`,
  },
  {
    id: 'counters', category: '05 / DATA', title: copy.value.staticText.valuesCanBeTheAnimation,
    description: copy.value.staticText.countUpsAndMetricTransitionsAreDriven572888,
    stageLabel: copy.value.staticText.liveDOMSTAGE, fileLabel: copy.value.staticText.numberInterpolationTs, stageTag: copy.value.staticText.numberFORMATSTREAMS, ariaLabel: copy.value.staticText.threeAnimatedPerformanceMetricCounters,
    snippet: `import { animateNumber } from '@re-code/flux/dom';\n\nconst samples = animateNumber(sampleNode, {\n  from: 0, to: 12840, duration: 2200,\n  easing: 'easeOutExpo',\n  format: (value) => Math.round(value).toLocaleString('en-US'),\n});\nconst latency = animateNumber(latencyNode, {\n  from: 980, to: 16, duration: 1900,\n  format: (value) => \`\${Math.round(value)} ms\`,\n});\n\nvoid samples.play().catch(() => undefined);\nvoid latency.play().catch(() => undefined);\nreturn () => { samples.dispose(); latency.dispose(); };`,
  },
  {
    id: 'typography', category: '13 / TYPOGRAPHY', title: copy.value.staticText.letTypeBecomeAVisualElement,
    description: copy.value.staticText.characterLevelTimingRotationAndOpacityProduceb687bb,
    stageLabel: copy.value.staticText.kineticTYPESTAGE, fileLabel: copy.value.staticText.staggeredTextTs, stageTag: copy.value.staticText.graphemeLEVELTIMING, ariaLabel: copy.value.staticText.animatedKineticTypographyReadingReactiveMotion,
    snippet: `interface GlyphAgent {
  x: number; y: number;
  vx: number; vy: number;
  homeX: number; homeY: number;
}

function stepGlyph(glyph: GlyphAgent, dt: number): void {
  // SEEK: steer towards the glyph's home position.
  const dx = glyph.homeX - glyph.x;
  const dy = glyph.homeY - glyph.y;
  const distance = Math.hypot(dx, dy);
  const speed = Math.min(164, distance * 5.2);
  const desiredX = distance > 0 ? dx / distance * speed : 0;
  const desiredY = distance > 0 ? dy / distance * speed : 0;
  const forceX = desiredX - glyph.vx;
  const forceY = desiredY - glyph.vy;

  // Add SEPARATION and pointer FLEE forces before integration.
  glyph.vx = (glyph.vx + forceX * dt) * Math.exp(-2.7 * dt);
  glyph.vy = (glyph.vy + forceY * dt) * Math.exp(-2.7 * dt);
  glyph.x += glyph.vx * dt;
  glyph.y += glyph.vy * dt;
}

// Apply once per frame; cap accumulated force and velocity.`,
  },
  {
    id: 'layout', category: '14 / LAYOUT', title: copy.value.staticText.animateLayoutChangesNotJustTransforms,
    description: copy.value.staticText.reorderTheseTilesFLIPMeasuresTheirOldfd3e11,
    stageLabel: copy.value.staticText.flipLAYOUTSTAGE, fileLabel: copy.value.staticText.layoutTransitionTs, stageTag: copy.value.staticText.firstLASTINVERTPLAY, ariaLabel: copy.value.staticText.fourTilesWhoseVisualOrderCanBeChangedWithAFLIPAnimation,
    snippet: `import { flip } from '@re-code/flux/dom';\n\nconst transition = flip(container.querySelectorAll('.tile'), () => {\n  // Apply the state change first; FLIP measures the result.\n  reorderTiles();\n}, {\n  duration: 640,\n  easing: 'easeOutCubic',\n  stagger: 35,\n});\n\nvoid transition.play().catch(() => undefined);\nreturn () => transition.dispose();`,
  },
];

function setupKineticText(): void {
  const target = kineticTitle.value;
  if (!target) return;
  const handle = createKineticTypography(target);
  kineticTypography = handle;
  let lastReducedMotion: boolean | null = null;
  const motionSubscription = preferences.state$.subscribe((state) => {
    if (state.reducedMotion === lastReducedMotion) return;
    lastReducedMotion = state.reducedMotion;
    if (state.reducedMotion) handle.settle(true);
    else handle.play();
  });
  activeCleanups.push(() => {
    motionSubscription.unsubscribe();
    handle.dispose();
    if (kineticTypography === handle) kineticTypography = null;
  });
}

function replayKineticText(): void {
  if (preferences.snapshot.reducedMotion) return;
  kineticTypography?.play();
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
    activeCleanups.push(() => {
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
    counters.forEach((counter) => { void counter.play().catch(() => undefined); });
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
  activeCleanups.push(() => {
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
  void layoutAnimation.play().catch(() => undefined);
}

function cleanupActiveScene(): void {
  for (const cleanup of activeCleanups.splice(0).reverse()) cleanup();
  layoutAnimation?.dispose();
  layoutAnimation = null;
  layoutReversed.value = false;
}

async function mountActiveScene(kind: string): Promise<void> {
  await nextTick();
  if (kind !== activeScene.value) return;
  switch (kind as InteractionKind) {
    case 'counters': setupCounters(); break;
    case 'drag': setupDraggable(); break;
    case 'typography': setupKineticText(); break;
    case 'layout': break;
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
    id-prefix="interaction-scene"
    :eyebrow="copy.staticText.domINTERACTION"
    heading="Motion beyond transforms"
    :description="copy.staticText.exploreTheSameAnimationEngineThroughNumbers921e90"
    :scenes="scenes"
  >
    <template #stage="{ scene }">
      <div v-if="scene.id === 'counters'" ref="counterPanel" class="counter-board visual-scene-explorer__counter-board">
        <div class="counter-tile"><span>{{ copy.staticText.reactiveSamples }}</span><strong ref="countSamples">0</strong><small>{{ copy.staticText.processed }}</small></div>
        <div class="counter-tile"><span>{{ copy.staticText.frameLatency }}</span><strong ref="countLatency">{{ copy.staticText.text980Ms }}</strong><small>{{ copy.staticText.to16Ms }}</small></div>
        <div class="counter-tile"><span>{{ copy.staticText.availability }}</span><strong ref="countUptime">0.00%</strong><small>{{ copy.staticText.targetReached }}</small></div>
        <div class="visual-scene-explorer__scene-controls"><UiButton color="success" variant="tonal" size="small" :aria-label="copy.staticText.replayMetricCounters" @click="replayCounters"><UiIcon start>mdi-replay</UiIcon>{{ copy.staticText.replayCounters }}</UiButton></div>
      </div>
      <div v-else-if="scene.id === 'drag'" ref="draggableStage" class="draggable-stage visual-scene-explorer__drag-stage">
        <div class="draggable-stage__grid" aria-hidden="true"></div>
        <div ref="draggableOrb" class="draggable-orb" role="group" :aria-label="copy.staticText.draggableReactiveOrbUseArrowKeysToMoveIt"><UiIcon size="28">mdi-atom-variant</UiIcon></div>
        <span class="draggable-stage__hint">{{ copy.staticText.dragARROWKEYS }}</span>
        <UiButton class="visual-scene-explorer__stage-action" size="small" variant="tonal" color="primary" @click="resetDraggable">{{ copy.staticText.reset }} <UiIcon end>mdi-restore</UiIcon></UiButton>
      </div>
      <div v-else-if="scene.id === 'typography'" class="kinetic-type-demo">
        <div ref="kineticTitle" class="kinetic-stage">{{ copy.staticText.reactiveMotion }}</div>
        <div class="kinetic-type-demo__footer">
          <span>{{ copy.staticText.seekSeparateFlee }}</span>
          <UiButton color="primary" variant="tonal" size="small" :disabled="preferences.snapshot.reducedMotion" @click="replayKineticText">
            <UiIcon start>mdi-replay</UiIcon>{{ copy.staticText.replayKineticTypography }}
          </UiButton>
        </div>
      </div>
      <div v-else-if="scene.id === 'layout'" class="layout-stage visual-scene-explorer__layout-stage">
        <div ref="layoutTarget" class="visual-scene-explorer__layout-target">
          <div v-for="number in [1, 2, 3, 4]" :key="number" class="layout-tile" :data-tile="number"><span>0{{ number }}</span><UiIcon size="18">{{ ['mdi-shape-outline', 'mdi-hexagon-outline', 'mdi-circle-outline', 'mdi-triangle-outline'][number - 1] }}</UiIcon></div>
        </div>
        <div class="visual-scene-explorer__scene-controls"><UiButton color="primary" variant="tonal" size="small" @click="toggleLayout">{{ layoutReversed ? copy.staticText.restoreOrder : copy.staticText.reorderTiles }}<UiIcon end>mdi-swap-horizontal</UiIcon></UiButton></div>
      </div>
    </template>
  </VisualLabSceneExplorer>
</template>
