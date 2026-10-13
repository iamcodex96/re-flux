<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { dragInertia, pointerGestures$, slideFollow, type Point2D } from '@lib';
import { map, Subject, type Subscription } from 'rxjs';
import MetricTile from '../../MetricTile.vue';

const gestureStage = ref<HTMLElement | null>(null);
const gestureHandle = ref<HTMLButtonElement | null>(null);
const dragX = ref(180);
const dragY = ref(110);
const followerX = ref(180);
const followerY = ref(110);
const dragPhase = ref<'idle' | 'dragging' | 'inertia' | 'rest'>('idle');
const gestureAxis = ref<'both' | 'x' | 'y'>('both');
const dragVelocity = ref(0);
const followerTargets = new Subject<Point2D>();
let dragSubscription: Subscription | null = null;
let followerSubscription: Subscription | null = null;
let gestureBounds = { width: 360, height: 230 };
let boundGestureStage: HTMLElement | null = null;
let boundGestureHandle: HTMLButtonElement | null = null;
let gestureResizeObserver: ResizeObserver | null = null;

function initializeGestureDemo(stage: HTMLElement, handle: HTMLButtonElement): void {
  if (boundGestureStage === stage && boundGestureHandle === handle && dragSubscription && followerSubscription) return;
  if (stage.clientWidth <= 0 || stage.clientHeight <= 0) {
    waitForGestureLayout(stage, handle);
    return;
  }

  stopGestureBindings();
  boundGestureStage = stage;
  boundGestureHandle = handle;
  syncGestureDimensions(stage);
  dragX.value = gestureBounds.width / 2;
  dragY.value = gestureBounds.height / 2;
  followerX.value = dragX.value;
  followerY.value = dragY.value;

  followerSubscription = followerTargets.pipe(slideFollow({
    initialValue: { x: followerX.value, y: followerY.value },
    stiffness: 220,
    damping: 28,
  })).subscribe((sample) => {
    followerX.value = sample.x;
    followerY.value = sample.y;
  });

  bindDragStream(stage, handle);
  observeGestureStage(stage, handle);
}

function waitForGestureLayout(stage: HTMLElement, handle: HTMLButtonElement): void {
  if (typeof ResizeObserver === 'undefined') return;
  gestureResizeObserver?.disconnect();
  gestureResizeObserver = new ResizeObserver(() => {
    if (stage.clientWidth <= 0 || stage.clientHeight <= 0) return;
    gestureResizeObserver?.disconnect();
    gestureResizeObserver = null;
    initializeGestureDemo(stage, handle);
  });
  gestureResizeObserver.observe(stage);
}

function observeGestureStage(stage: HTMLElement, handle: HTMLButtonElement): void {
  if (typeof ResizeObserver === 'undefined') return;
  gestureResizeObserver?.disconnect();
  gestureResizeObserver = new ResizeObserver(() => {
    if (boundGestureStage !== stage) return;
    syncGestureDimensions(stage);
    const halfWidth = handle.offsetWidth / 2;
    const halfHeight = handle.offsetHeight / 2;
    const maxX = Math.max(halfWidth, gestureBounds.width - halfWidth);
    const maxY = Math.max(halfHeight, gestureBounds.height - halfHeight);
    const nextX = Math.min(maxX, Math.max(halfWidth, dragX.value));
    const nextY = Math.min(maxY, Math.max(halfHeight, dragY.value));
    if (nextX !== dragX.value || nextY !== dragY.value) {
      dragX.value = nextX;
      dragY.value = nextY;
      followerTargets.next({ x: nextX, y: nextY });
    }
  });
  gestureResizeObserver.observe(stage);
}

function stopGestureBindings(): void {
  gestureResizeObserver?.disconnect();
  gestureResizeObserver = null;
  dragSubscription?.unsubscribe();
  dragSubscription = null;
  followerSubscription?.unsubscribe();
  followerSubscription = null;
  boundGestureStage = null;
  boundGestureHandle = null;
}

function stopGestureDemo(): void {
  stopGestureBindings();
  dragPhase.value = 'idle';
  dragVelocity.value = 0;
}

function syncGestureDimensions(stage: HTMLElement): void {
  gestureBounds = { width: stage.clientWidth, height: stage.clientHeight };
}

function bindDragStream(stage: HTMLElement, handle: HTMLButtonElement): void {
  dragSubscription?.unsubscribe();
  let grabOffsetX = 0;
  let grabOffsetY = 0;

  dragSubscription = pointerGestures$(handle).pipe(
    map((event) => {
      const stageRect = stage.getBoundingClientRect();
      const originX = stageRect.left + stage.clientLeft;
      const originY = stageRect.top + stage.clientTop;
      if (event.type === 'down') {
        const handleRect = handle.getBoundingClientRect();
        grabOffsetX = event.x - (handleRect.left + handleRect.width / 2);
        grabOffsetY = event.y - (handleRect.top + handleRect.height / 2);
      }
      return {
        ...event,
        x: event.x - originX - grabOffsetX,
        y: event.y - originY - grabOffsetY,
      };
    }),
    dragInertia({
      friction: 5.5,
      minVelocity: 10,
      axis: gestureAxis.value,
      velocitySmoothing: 0.55,
      getBounds: () => {
        syncGestureDimensions(stage);
        const halfWidth = handle.offsetWidth / 2;
        const halfHeight = handle.offsetHeight / 2;
        return {
          minX: halfWidth,
          maxX: Math.max(halfWidth, gestureBounds.width - halfWidth),
          minY: halfHeight,
          maxY: Math.max(halfHeight, gestureBounds.height - halfHeight),
        };
      },
    }),
  ).subscribe((sample) => {
    dragX.value = sample.x;
    dragY.value = sample.y;
    dragPhase.value = sample.phase;
    dragVelocity.value = Math.hypot(sample.vx, sample.vy);
    followerTargets.next({ x: dragX.value, y: dragY.value });
  });
}

function resetGesture(): void {
  const stage = gestureStage.value;
  const handle = gestureHandle.value;
  if (!stage || !handle) return;
  syncGestureDimensions(stage);
  const halfWidth = handle.offsetWidth / 2;
  const halfHeight = handle.offsetHeight / 2;
  dragX.value = Math.max(halfWidth, gestureBounds.width / 2);
  dragY.value = Math.max(halfHeight, gestureBounds.height / 2);
  dragPhase.value = 'idle';
  dragVelocity.value = 0;
  followerTargets.next({ x: dragX.value, y: dragY.value });
  bindDragStream(stage, handle);
}

function moveHandleWithKeyboard(event: KeyboardEvent): void {
  const stage = gestureStage.value;
  const handle = gestureHandle.value;
  if (!stage || !handle) return;
  syncGestureDimensions(stage);
  const step = event.shiftKey ? 20 : 8;
  let moved = true;
  switch (event.key) {
    case 'ArrowLeft': dragX.value -= step; break;
    case 'ArrowRight': dragX.value += step; break;
    case 'ArrowUp': dragY.value -= step; break;
    case 'ArrowDown': dragY.value += step; break;
    default: moved = false;
  }
  if (!moved) return;
  event.preventDefault();
  const halfWidth = handle.offsetWidth / 2;
  const halfHeight = handle.offsetHeight / 2;
  dragX.value = Math.min(Math.max(halfWidth, gestureBounds.width - halfWidth), Math.max(halfWidth, dragX.value));
  dragY.value = Math.min(Math.max(halfHeight, gestureBounds.height - halfHeight), Math.max(halfHeight, dragY.value));
  dragPhase.value = 'rest';
  dragVelocity.value = 0;
  followerTargets.next({ x: dragX.value, y: dragY.value });
}

watch(gestureAxis, () => {
  const stage = gestureStage.value;
  const handle = gestureHandle.value;
  if (stage && handle && boundGestureStage === stage) bindDragStream(stage, handle);
});

const gestureCode = `import { map, share } from 'rxjs';
import { dragInertia, pointerGestures$, slideFollow } from '@re-code/flux';

let grabOffset = { x: 0, y: 0 };
const drag$ = pointerGestures$(handle).pipe(
  map((event) => {
    const rect = stage.getBoundingClientRect();
    if (event.type === 'down') {
      const handleRect = handle.getBoundingClientRect();
      grabOffset = {
        x: event.x - (handleRect.left + handleRect.width / 2),
        y: event.y - (handleRect.top + handleRect.height / 2),
      };
    }
    return {
      ...event,
      x: event.x - rect.left - stage.clientLeft - grabOffset.x,
      y: event.y - rect.top - stage.clientTop - grabOffset.y,
    };
  }),
  dragInertia({ friction: 5.5, minVelocity: 10, axis: 'both',
    getBounds: () => ({
      minX: handle.offsetWidth / 2,
      maxX: Math.max(handle.offsetWidth / 2, stage.clientWidth - handle.offsetWidth / 2),
      minY: handle.offsetHeight / 2,
      maxY: Math.max(handle.offsetHeight / 2, stage.clientHeight - handle.offsetHeight / 2),
    }),
  }),
  share(),
);

const follower$ = drag$.pipe(
  map(({ x, y }) => ({ x, y })),
  slideFollow({ stiffness: 220, damping: 28 }),
);

drag$.subscribe(renderHandle);
follower$.subscribe(renderFollower);`;

onMounted(async () => {
  await nextTick();
  if (gestureStage.value && gestureHandle.value) initializeGestureDemo(gestureStage.value, gestureHandle.value);
});
onBeforeUnmount(() => {
  stopGestureDemo();
  followerTargets.complete();
});
</script>

<template>
  <v-card variant="outlined" class="motion-playground-card">
    <v-card-title class="pa-4">
      <div class="text-overline text-secondary">04 / GESTURE PHYSICS</div>
      <h2 class="text-h6 ma-0">Drag inertia &amp; slide follow</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">Drag the handle with a mouse, touch, or pen and release to see inertia. The outlined follower uses a spring to track the same point; the handle also supports arrow-key movement.</p>
    </v-card-title>
    <v-divider />
    <v-card-text class="pa-4 pa-md-5">
      <div class="d-flex flex-wrap align-center ga-2 mb-3">
        <span class="text-body-2 font-weight-medium">Drag axis</span>
        <v-btn-toggle v-model="gestureAxis" density="compact" color="primary" mandatory variant="outlined" aria-label="Drag axis lock" @update:model-value="resetGesture">
          <v-btn value="both" size="small">Both</v-btn>
          <v-btn value="x" size="small">Horizontal</v-btn>
          <v-btn value="y" size="small">Vertical</v-btn>
        </v-btn-toggle>
        <v-chip size="small" variant="tonal" color="secondary">Pointer capture on</v-chip>
      </div>
      <div ref="gestureStage" class="gesture-stage mb-4" role="group" aria-label="Interactive drag and spring-follow stage">
        <div class="gesture-stage__follower" :style="{ left: `${followerX}px`, top: `${followerY}px` }" aria-hidden="true"></div>
        <button
          ref="gestureHandle"
          type="button"
          class="gesture-stage__handle"
          :style="{ left: `${dragX}px`, top: `${dragY}px` }"
          aria-label="Drag the motion handle. Use the arrow keys to move it, or hold Shift for larger steps."
          aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
          @keydown="moveHandleWithKeyboard"
        >Drag me</button>
        <div class="gesture-stage__follower-label" aria-hidden="true">SOLID = DRAG + INERTIA · OUTLINE = SPRING FOLLOW</div>
      </div>
      <v-row dense class="mb-4">
        <v-col cols="4"><MetricTile label="Gesture phase" :value="dragPhase" /></v-col>
        <v-col cols="4"><MetricTile label="Speed" :value="`${dragVelocity.toFixed(0)} px/s`" /></v-col>
        <v-col cols="4"><MetricTile label="Follower" :value="`${Math.round(followerX)}, ${Math.round(followerY)}`" /></v-col>
      </v-row>
      <div class="d-flex flex-wrap align-center ga-2 mb-4">
        <v-chip size="small" variant="tonal" color="primary">pointerdown / move / up</v-chip>
        <v-chip size="small" variant="tonal" color="secondary">Exponential inertia</v-chip>
        <v-chip size="small" variant="tonal">Spring follower</v-chip>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-restore" @click="resetGesture">Reset positions</v-btn>
      </div>
      <v-expansion-panels variant="accordion">
        <v-expansion-panel title="View the TypeScript">
          <v-expansion-panel-text><pre class="motion-code"><code>{{ gestureCode }}</code></pre></v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>

</template>
