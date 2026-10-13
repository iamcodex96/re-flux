<script setup lang="ts">
const features = [
  {
    number: '01',
    status: 'Implemented · hardening ongoing',
    icon: 'mdi-gesture-tap',
    title: 'First-class gesture physics',
    summary: 'Turn pointer input into typed motion streams, with drag inertia and following motion as composable RxJS operators.',
    problem: 'Drag implementations often mix event listeners, velocity calculations, mutable state, and cleanup in one component.',
    approach: 'Keep DOM event normalization optional and put the physics in pure operators that emit position, velocity, and timestamps.',
    api: "import { map, share } from 'rxjs';\nimport { pointerGestures$, dragInertia, slideFollow } from '@re-code/flux';\n\nconst drag$ = pointerGestures$(element).pipe(\n  dragInertia({ friction: 5.5, minVelocity: 8 }),\n  share(),\n);\n\nconst follower$ = drag$.pipe(\n  map(({ x, y }) => ({ x, y })),\n  slideFollow({ stiffness: 220, damping: 28 }),\n);",
    criteria: ['Time-based physics behaves consistently across frame rates.', 'Pointer cancellation and unsubscription clean up all listeners.', 'Core operators emit data and never write to the DOM.'],
  },
  {
    number: '02',
    status: 'smoothStream and adaptiveTween implemented',
    icon: 'mdi-access-point-network',
    title: 'Real-time stream smoothing',
    summary: 'Smooth irregular WebSocket, SSE, telemetry, and GPS samples with fixed-latency buffering or cadence-adaptive transition duration.',
    problem: 'Rendering each arriving network sample immediately makes motion jump when packet timing varies.',
    approach: 'Sample timestamped values against the shared frame clock. smoothStream uses fixed display latency; adaptiveTween estimates input cadence and adjusts the duration between successive targets. Neither operator predicts future data.',
    api: `import { adaptiveTween, smoothStream } from '@re-code/flux';

const fixed$ = serverSamples$.pipe(
  smoothStream({ targetLatency: 100, interpolate: lerp }),
);
const adaptive$ = serverSamples$.pipe(
  adaptiveTween({ minDuration: 20, maxDuration: 220, durationFactor: 1.5, interpolate: lerp }),
);`,
    criteria: ['Frame-aligned interpolation and bounded memory are implemented.', 'Duplicate/out-of-order, stale, invalid and finite-source behavior have unit tests.', 'adaptiveTween adapts transition duration to cadence; prediction remains intentionally separate.'],
  },
  {
    number: '03',
    status: 'Implemented · test hardening ongoing',
    icon: 'mdi-swap-horizontal',
    title: 'Seamless interruption and retargeting',
    summary: 'Switch animation targets without snapping back to the original start value or discarding momentum.',
    problem: 'Interrupting a tween can cause visual jumps or force applications to implement cancellation and continuity manually.',
    approach: 'Carry the current value, velocity, and timestamp into the next target transition. The operator owns one motion per subscription and waits for the last target to settle after source completion.',
    api: `import { retargetMotion } from '@re-code/flux';

const motion$ = targets$.pipe(
  retargetMotion({ initialValue: 0, stiffness: 260, damping: 30 }),
);`,
    criteria: ['Retargeting starts from the latest sampled value and velocity.', 'Source completion waits for the final target to settle; unsubscribe cancels work.', 'Rapid target changes and stream errors remain leak-free.'],
  },
  {
    number: '04',
    status: 'Implemented · integration tests ongoing',
    icon: 'mdi-sync',
    title: 'Frame coordinator',
    summary: 'Coalesce library work into one frame-aligned coordinator with explicit read and write phases.',
    problem: 'Independent updates can repeat work or interleave layout reads and DOM writes, causing avoidable layout thrashing.',
    approach: 'Reuse RxJS animationFrameScheduler where suitable and add only the library-specific batching coordinator we need.',
    api: "frameCoordinator.scheduleRead(measureLayout);\nframeCoordinator.scheduleWrite(applyStyles);",
    criteria: ['One pending coordinator RAF while work is queued.', 'A shared timestamp is passed to every task in a frame.', 'Read/write ordering and cancellation semantics are deterministic.'],
  },
  {
    number: '05',
    status: 'DOM / SVG / Canvas / Three.js adapters implemented',
    icon: 'mdi-layers-triple-outline',
    title: 'Headless rendering adapters',
    summary: 'Connect the same motion streams to DOM, SVG, Canvas, Three.js, or framework state without coupling the core to them.',
    problem: 'DOM-first engines make it harder to reuse the same motion logic in Canvas, WebGL, or server-side contexts.',
    approach: 'Keep the core headless and publish thin opt-in adapters that own their subscriptions and restore original target state on teardown.',
    api: `import { bindStyle } from '@re-code/flux/dom';
import { bindSvgAttributes } from '@re-code/flux/svg';
import { bindCanvas } from '@re-code/flux/canvas';
import { bindThreeObject } from '@re-code/flux/three';`,
    criteria: ['DOM/SVG adapters restore original styles or attributes on unsubscribe.', 'Canvas drawing is coalesced through the shared frame write phase.', 'The Three.js adapter uses structural types and adds no Three.js dependency to the core.'],
  },
  {
    number: '06',
    status: 'Implemented · API integration hardening ongoing',
    icon: 'mdi-code-braces',
    title: 'Typed keyframes and DOM targeting',
    summary: 'Compose multi-stage values with typed keyframes, animate CSS selectors or element collections, and coordinate targets with stagger.',
    problem: 'Low-level progress controls are flexible but verbose for common UI tasks, while selector helpers should not force DOM dependencies into the core.',
    approach: 'Keep Keyframes<T> headless in the root package and expose animate() from the optional @re-code/flux/dom entry point. A returned DOMAnimation coordinates all targets in one Timeline and restores original inline styles on dispose.',
    api: `import { keyframes } from '@re-code/flux';
import { animate } from '@re-code/flux/dom';

const sequence = keyframes({
  duration: 600,
  keyframes: [
    { value: 0, offset: 0 },
    { value: 80, offset: 0.4, easing: 'easeOutCubic' },
    { value: 240, offset: 1 },
  ],
});

const entrance = animate('.card', {
  properties: { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0px)'] },
  duration: 450,
  stagger: 60,
});`,
    criteria: ['Keyframes normalizes offsets and supports per-segment easing and custom interpolators.', 'animate() accepts a selector, one Element, or an iterable of Elements.', 'All targets are coordinated in one Timeline and dispose() restores inline styles and releases subscriptions.'],
  },
];

const principles = [
  { title: 'Observable-first', text: 'Motion, time, and velocity are values in streams—not hidden mutable globals.' },
  { title: 'Headless by default', text: 'Rendering is an adapter concern. Core logic produces values and timestamps.' },
  { title: 'Deterministic tests', text: 'Clock-dependent behavior must be testable with an injected or virtual clock.' },
  { title: 'Honest performance', text: 'Frame alignment reduces redundant work, but cannot guarantee 60 or 120 FPS under browser throttling.' },
];
</script>

<template>
  <v-container max-width="1240" class="py-8 py-md-12 px-4 px-md-8">
    <v-row align="center" class="mb-10" dense>
      <v-col cols="12" md="8">
        <div class="text-overline text-primary mb-2">PRODUCT DIRECTION</div>
        <h1 class="text-h4 text-md-h3 font-weight-bold mb-3">The re;Flux roadmap<span class="text-primary">.</span></h1>
        <p class="text-body-1 text-medium-emphasis" style="max-width: 760px">
          Reactive motion primitives for typed keyframes, selector-based authoring, gestures, real-time data, seamless interruption, frame scheduling, and any rendering target.
          Gesture operators, frame coordination, declarative retargeting, fixed and cadence-adaptive stream smoothing, and optional DOM/SVG/Canvas/Three.js adapters are available in the source API. Gesture edge-case hardening, stress testing and richer rendering examples remain in progress.
        </p>
        <v-btn class="mt-4" to="/api" color="primary" variant="flat" append-icon="mdi-arrow-right">Explore keyframes & DOM API</v-btn>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-md-end mt-4 mt-md-0">
        <v-chip color="secondary" variant="tonal" prepend-icon="mdi-map-outline">Gesture operators available · More planned</v-chip>
      </v-col>
    </v-row>

    <v-row class="mb-10">
      <v-col v-for="principle in principles" :key="principle.title" cols="12" sm="6" md="3">
        <v-card variant="tonal" color="surface-variant" rounded="lg" height="100%">
          <v-card-text class="pa-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">{{ principle.title }}</div>
            <p class="text-body-2 text-medium-emphasis">{{ principle.text }}</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col v-for="feature in features" :key="feature.number" cols="12" lg="6">
        <v-card variant="outlined" rounded="lg" height="100%">
          <v-card-text class="pa-4 pa-md-6">
            <div class="d-flex align-start ga-3 mb-4">
              <v-avatar color="primary" variant="tonal" size="48" rounded="lg">
                <v-icon :icon="feature.icon" size="24" />
              </v-avatar>
              <div class="flex-grow-1">
                <div class="d-flex align-center flex-wrap ga-2 mb-1">
                  <span class="text-overline text-medium-emphasis">FEATURE {{ feature.number }}</span>
                  <v-chip size="x-small" :color="feature.status.toLowerCase().includes('planned') ? 'warning' : feature.status.toLowerCase().includes('implemented') ? 'success' : 'default'" variant="tonal">{{ feature.status }}</v-chip>
                </div>
                <h2 class="text-h6 text-md-h5 font-weight-bold">{{ feature.title }}</h2>
              </div>
            </div>
            <p class="text-body-2 mb-5">{{ feature.summary }}</p>

            <v-row dense class="mb-4">
              <v-col cols="12" sm="6">
                <v-sheet rounded="lg" color="surface-variant" class="pa-3 h-100">
                  <div class="text-overline text-medium-emphasis mb-1">PROBLEM</div>
                  <p class="text-body-2">{{ feature.problem }}</p>
                </v-sheet>
              </v-col>
              <v-col cols="12" sm="6">
                <v-sheet rounded="lg" color="surface-variant" class="pa-3 h-100">
                  <div class="text-overline text-medium-emphasis mb-1">DIRECTION</div>
                  <p class="text-body-2">{{ feature.approach }}</p>
                </v-sheet>
              </v-col>
            </v-row>

            <div class="text-overline text-primary mb-2">{{ feature.status.toLowerCase().includes('implemented') && feature.status.toLowerCase().includes('planned') ? 'IMPLEMENTED API / FOLLOW-UP PLANNED' : feature.status.toLowerCase().includes('planned') ? 'PROPOSED API' : 'API / USAGE EXAMPLE' }}</div>
            <v-card variant="tonal" color="surface-variant" class="mb-5" rounded="lg">
              <pre class="pa-4 text-body-2 overflow-x-auto"><code>{{ feature.api }}</code></pre>
            </v-card>

            <div class="text-subtitle-2 font-weight-bold mb-2">Acceptance criteria</div>
            <v-list density="compact" class="bg-transparent pa-0">
              <v-list-item v-for="criterion in feature.criteria" :key="criterion" prepend-icon="mdi-check-circle-outline" class="px-0" min-height="36">
                <v-list-item-title class="text-body-2 text-wrap">{{ criterion }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card variant="tonal" color="primary" rounded="lg" class="mt-8">
      <v-card-text class="pa-5 pa-md-7">
        <div class="text-overline mb-2">IMPLEMENTATION ORDER</div>
        <h2 class="text-h5 font-weight-bold mb-3">Stabilize the clock before adding more motion.</h2>
        <p class="text-body-2 mb-0" style="max-width: 850px">
          The current sequence is: harden gesture/frame contracts → validate retargeting and stream smoothing against real dependencies → strengthen adapter integration coverage → add stress tests and examples for real-time data. The core operators, retargetMotion(), smoothStream(), adaptiveTween(), DOM/SVG/Canvas/Three.js bindings, typed Keyframes, and selector-based animate() helper are now present in source. API integration tests and real-dependency release checks remain ongoing.
        </p>
        <v-btn class="mt-4" color="primary" variant="flat" href="https://rxjs.dev/api/index/const/animationFrameScheduler" target="_blank" rel="noreferrer" append-icon="mdi-open-in-new">
          RxJS frame scheduler reference
        </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>
