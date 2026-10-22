<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MotionPreferences, cubicBezier } from '@lib';
import { animateNumber, animateText, draggable, flip, type DraggableHandle } from '@lib/dom';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';

type InteractionKind = 'counters' | 'drag' | 'typography' | 'layout';

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
let kineticTextAnimation: ReturnType<typeof animateText> | null = null;
let counterAnimations: Array<ReturnType<typeof animateNumber>> = [];
let countersStarted = false;
let draggableHandle: DraggableHandle | null = null;
let draggableCleanupRegistered = false;
const layoutReversed = ref(false);

const scenes: readonly VisualLabSceneDefinition[] = [
  {
    id: 'drag', category: '06 / INTERACTION', title: 'Drag it. Release it. Let physics finish.',
    description: 'This interaction combines pointer capture, filtered velocity, dynamic bounds, inertial release, eased snap-to-grid and keyboard arrows. Try dragging quickly, then use the arrow keys.',
    stageLabel: 'INTERACTIVE DOM STAGE', fileLabel: 'draggable.ts', stageTag: 'POINTER + VELOCITY + BOUNDS', ariaLabel: 'Drag the reactive orb or use the arrow keys',
    snippet: `import { draggable } from '@re-code/flux/dom';\n\nconst handle = draggable(element, {\n  axis: 'both',\n  friction: 5.5,\n  velocitySmoothing: 0.72,\n  snapTo: 12,\n  snapDuration: 320,\n  getBounds: () => ({\n    minX: 0, minY: 0,\n    maxX: stage.clientWidth - element.offsetWidth,\n    maxY: stage.clientHeight - element.offsetHeight,\n  }),\n});\n\n// Dispose pointer listeners and motion state on teardown.\nreturn () => handle.destroy();`,
  },
  {
    id: 'counters', category: '05 / DATA', title: 'Values can be the animation.',
    description: 'Count-ups and metric transitions are driven by the same timeline engine. This scene starts when it enters the viewport, then cleans up its text bindings on teardown.',
    stageLabel: 'LIVE DOM STAGE', fileLabel: 'number-interpolation.ts', stageTag: 'NUMBER + FORMAT STREAMS', ariaLabel: 'Three animated performance metric counters',
    snippet: `import { animateNumber } from '@re-code/flux/dom';\n\nconst samples = animateNumber(sampleNode, {\n  from: 0, to: 12840, duration: 2200,\n  easing: 'easeOutExpo',\n  format: (value) => Math.round(value).toLocaleString('en-US'),\n});\nconst latency = animateNumber(latencyNode, {\n  from: 980, to: 16, duration: 1900,\n  format: (value) => \`\${Math.round(value)} ms\`,\n});\n\nvoid samples.play().catch(() => undefined);\nvoid latency.play().catch(() => undefined);\nreturn () => { samples.dispose(); latency.dispose(); };`,
  },
  {
    id: 'typography', category: '13 / TYPOGRAPHY', title: 'Let type become a visual element.',
    description: 'Character-level timing, rotation and opacity produce a reveal that feels more tactile than a single translation.',
    stageLabel: 'KINETIC TYPE STAGE', fileLabel: 'staggered-text.ts', stageTag: 'GRAPHEME-LEVEL TIMING', ariaLabel: 'Animated kinetic typography reading Reactive motion',
    snippet: `import { cubicBezier } from '@re-code/flux';
import { animateText } from '@re-code/flux/dom';\n\nconst text = animateText(element, {\n  duration: 720,\n  stagger: 26,\n  splitBy: 'graphemes',\n  fromOpacity: 0.08,\n  fromTransform: 'translateY(0.7em) rotate(5deg)',\n  easing: cubicBezier(0.16, 1, 0.3, 1),\n});\n\nvoid text.play().catch(() => undefined);\n// Replaying restarts the same character sequence.\ntext.restart();\nreturn () => text.dispose();`,
  },
  {
    id: 'layout', category: '14 / LAYOUT', title: 'Animate layout changes, not just transforms.',
    description: 'Reorder these tiles. FLIP measures their old and new geometry, then animates the inverse transform back to identity.',
    stageLabel: 'FLIP LAYOUT STAGE', fileLabel: 'layout-transition.ts', stageTag: 'FIRST · LAST · INVERT · PLAY', ariaLabel: 'Four tiles whose visual order can be changed with a FLIP animation',
    snippet: `import { flip } from '@re-code/flux/dom';\n\nconst transition = flip(container.querySelectorAll('.tile'), () => {\n  // Apply the state change first; FLIP measures the result.\n  reorderTiles();\n}, {\n  duration: 640,\n  easing: 'easeOutCubic',\n  stagger: 35,\n});\n\nvoid transition.play().catch(() => undefined);\nreturn () => transition.dispose();`,
  },
];

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
  void textAnimation.play().catch(() => undefined);
  activeCleanups.push(() => {
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
    eyebrow="DOM / INTERACTION"
    heading="Motion beyond transforms"
    description="Explore the same animation engine through numbers, pointer physics, typography and layout. Each tab mounts one live interaction and shows its public API pattern."
    :scenes="scenes"
  >
    <template #stage="{ scene }">
      <div v-if="scene.id === 'counters'" ref="counterPanel" class="counter-board visual-scene-explorer__counter-board">
        <div class="counter-tile"><span>Reactive samples</span><strong ref="countSamples">0</strong><small>processed</small></div>
        <div class="counter-tile"><span>Frame latency</span><strong ref="countLatency">980 ms</strong><small>to 16 ms</small></div>
        <div class="counter-tile"><span>Availability</span><strong ref="countUptime">0.00%</strong><small>target reached</small></div>
        <div class="visual-scene-explorer__scene-controls"><UiButton color="success" variant="tonal" size="small" aria-label="Replay metric counters" @click="replayCounters"><UiIcon start>mdi-replay</UiIcon>Replay counters</UiButton></div>
      </div>
      <div v-else-if="scene.id === 'drag'" ref="draggableStage" class="draggable-stage visual-scene-explorer__drag-stage">
        <div class="draggable-stage__grid" aria-hidden="true"></div>
        <div ref="draggableOrb" class="draggable-orb" role="group" aria-label="Draggable reactive orb. Use arrow keys to move it."><UiIcon size="28">mdi-atom-variant</UiIcon></div>
        <span class="draggable-stage__hint">DRAG / ARROW KEYS</span>
        <UiButton class="visual-scene-explorer__stage-action" size="small" variant="tonal" color="primary" @click="resetDraggable">Reset <UiIcon end>mdi-restore</UiIcon></UiButton>
      </div>
      <div v-else-if="scene.id === 'typography'" ref="kineticTitle" class="kinetic-stage">Reactive motion.</div>
      <div v-else-if="scene.id === 'layout'" class="layout-stage visual-scene-explorer__layout-stage">
        <div ref="layoutTarget" class="visual-scene-explorer__layout-target">
          <div v-for="number in [1, 2, 3, 4]" :key="number" class="layout-tile" :data-tile="number"><span>0{{ number }}</span><UiIcon size="18">{{ ['mdi-shape-outline', 'mdi-hexagon-outline', 'mdi-circle-outline', 'mdi-triangle-outline'][number - 1] }}</UiIcon></div>
        </div>
        <div class="visual-scene-explorer__scene-controls"><UiButton color="primary" variant="tonal" size="small" @click="toggleLayout">{{ layoutReversed ? 'Restore order' : 'Reorder tiles' }}<UiIcon end>mdi-swap-horizontal</UiIcon></UiButton></div>
      </div>
    </template>
  </VisualLabSceneExplorer>
</template>
