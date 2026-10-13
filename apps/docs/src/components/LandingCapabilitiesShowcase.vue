<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { interval, map, type Subscription } from 'rxjs';
import { animate, type DOMAnimation } from '@lib/dom';
import { RetargetableMotion, smoothStream, stagger } from '@lib';
import { useAppStore } from '../stores/app';

const root = ref<HTMLElement | null>(null);
const store = useAppStore();
const copy = computed(() => store.app.view.home.capabilities);
const prefersReducedMotion = ref(false);
const visible = ref(false);
const springPosition = ref(0.1);
const springTargetPosition = ref(0.82);
const streamValues = ref<number[]>(Array.from({ length: 36 }, (_, index) => 0.48 + Math.sin(index * 0.33) * 0.12));
const streamPolyline = computed(() => streamValues.value
  .map((value, index) => `${(index / Math.max(1, streamValues.value.length - 1)) * 300},${88 - value * 76}`)
  .join(' '));

let animations: DOMAnimation[] = [];
let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let spring: RetargetableMotion | null = null;
let springSubscription: Subscription | null = null;
let streamSubscription: Subscription | null = null;
let springTimer: number | null = null;
let springTargetIndex = 0;
let springStarted = false;

const springTargets = [0.82, 0.25, 0.68, 0.12, 0.9];

function retargetSpring(): void {
  if (!spring) return;
  springTargetIndex = (springTargetIndex + 1) % springTargets.length;
  springTargetPosition.value = springTargets[springTargetIndex] ?? 0.82;
  spring.to(springTargetPosition.value);
}

function shouldAnimate(): boolean {
  return visible.value
    && !prefersReducedMotion.value
    && document.visibilityState === 'visible';
}

function startSpring(): void {
  if (!spring) return;
  if (!springStarted) {
    springStarted = true;
    springTargetPosition.value = springTargets[springTargetIndex] ?? 0.82;
    spring.to(springTargetPosition.value);
  } else if (spring.state$.value === 'paused') {
    spring.resume();
  } else if (spring.state$.value === 'completed' || spring.state$.value === 'idle') {
    retargetSpring();
  }

  if (springTimer === null) {
    springTimer = window.setInterval(retargetSpring, 1450);
  }
}

function stopSpring(): void {
  if (springTimer !== null) {
    window.clearInterval(springTimer);
    springTimer = null;
  }
  if (spring?.state$.value === 'running') spring.pause();
}

function startStream(): void {
  if (streamSubscription && !streamSubscription.closed) return;
  let sampleIndex = 0;
  // The source deliberately emits irregular-looking values at a steady cadence; smoothStream renders
  // the values on the library's shared frame clock with a small display latency.
  streamSubscription = interval(260).pipe(
    map(() => {
      sampleIndex += 1;
      return {
        timestamp: performance.now(),
        value: Math.min(0.94, Math.max(0.06,
          0.5 + Math.sin(sampleIndex * 0.63) * 0.3 + Math.sin(sampleIndex * 0.19) * 0.1)),
      };
    }),
    smoothStream<number>({
      targetLatency: 90,
      staleAfter: 1400,
      interpolate: (from, to, progress) => from + (to - from) * progress,
    }),
  ).subscribe({
    next: (sample) => {
      streamValues.value = [...streamValues.value.slice(1), sample.value];
    },
  });
}

function stopStream(): void {
  streamSubscription?.unsubscribe();
  streamSubscription = null;
}

function syncPlayback(): void {
  const play = shouldAnimate();
  for (const animation of animations) {
    if (play && animation.state$.value !== 'running') animation.play();
    else if (!play && animation.state$.value === 'running') animation.pause();
  }
  if (play) {
    startSpring();
    startStream();
  } else {
    stopSpring();
    stopStream();
  }
}

function handleMotionPreference(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches;
  syncPlayback();
}

function handleVisibilityChange(): void {
  syncPlayback();
}

onMounted(() => {
  const element = root.value;
  if (!element) return;

  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = motionQuery.matches;
  motionQuery.addEventListener('change', handleMotionPreference);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const cascade = Array.from(element.querySelectorAll<HTMLElement>('[data-capability-motion="cascade"]'));
  const propertyTarget = element.querySelector<HTMLElement>('[data-capability-motion="property"]');
  const timelineBars = Array.from(element.querySelectorAll<HTMLElement>('[data-capability-motion="timeline"]'));
  const streamCursor = element.querySelector<HTMLElement>('[data-capability-motion="stream-cursor"]');

  if (cascade.length) {
    animations.push(animate(cascade, {
      properties: {
        transform: { values: ['translateY(7px) scale(0.82)', 'translateY(-5px) scale(1.06)'], duration: 790, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true },
        opacity: { values: [0.38, 1], duration: 540, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
      stagger: stagger(115, { from: 'center', easing: 'easeOutCubic' }),
    }));
  }

  if (propertyTarget) {
    animations.push(animate(propertyTarget, {
      properties: {
        transform: { values: ['translateY(8px) rotate(-12deg) scale(0.88)', 'translateY(-8px) rotate(18deg) scale(1.08)'], duration: 1450, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true },
        borderRadius: { values: ['9px', '24px'], duration: 920, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true },
        opacity: { values: [0.72, 1], duration: 560, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
    }));
  }

  if (timelineBars.length) {
    animations.push(animate(timelineBars, {
      properties: {
        width: { values: ['18%', '88%'], duration: 1450, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true },
        opacity: { values: [0.48, 1], duration: 950, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
      stagger: stagger(180, { from: 'first' }),
    }));
  }

  if (streamCursor) {
    animations.push(animate(streamCursor, {
      properties: {
        transform: { values: ['translateX(0px)', 'translateX(230px)'], duration: 1700, easing: 'linear', repeat: Infinity, yoyo: true },
        opacity: { values: [0.55, 1], duration: 850, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
    }));
  }

  spring = new RetargetableMotion({ initialValue: 0.1, stiffness: 250, damping: 22, mass: 0.9, restDelta: 0.0015, restSpeed: 0.01 });
  springSubscription = spring.value$.subscribe((value) => { springPosition.value = Math.min(0.94, Math.max(0.06, value)); });

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible.value = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.08 });
    observer.observe(element);
  } else {
    visible.value = true;
    syncPlayback();
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  motionQuery?.removeEventListener('change', handleMotionPreference);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  for (const animation of animations) animation.dispose();
  animations = [];
  stopSpring();
  springSubscription?.unsubscribe();
  spring?.dispose();
  stopStream();
});
</script>

<template>
  <section ref="root" class="landing-capabilities mb-12 mb-md-16" :aria-label="copy.ariaLabel">
    <div class="mb-5">
      <div class="text-overline text-secondary mb-2">{{ copy.eyebrow }}</div>
      <h2 class="text-h4 font-weight-bold mb-2">{{ copy.title }}</h2>
      <p class="text-body-2 text-medium-emphasis landing-capabilities__description">{{ copy.description }}</p>
    </div>

    <v-row dense>
      <v-col cols="12" sm="6" lg="3">
        <v-card variant="outlined" class="landing-capability-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-2"><v-icon color="primary" size="18">mdi-animation-outline</v-icon><h3 class="text-subtitle-1 font-weight-bold">{{ copy.cascadeTitle }}</h3></div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.cascadeDescription }}</p>
            <div class="landing-capability-stage landing-capability-stage--cascade" role="img" :aria-label="copy.cascadeAriaLabel">
              <span v-for="index in 7" :key="index" data-capability-motion="cascade" class="landing-capability-dot">{{ String(index).padStart(2, '0') }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" lg="3">
        <v-card variant="outlined" class="landing-capability-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-2"><v-icon color="secondary" size="18">mdi-tune-variant</v-icon><h3 class="text-subtitle-1 font-weight-bold">{{ copy.propertyTitle }}</h3></div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.propertyDescription }}</p>
            <div class="landing-capability-stage landing-capability-stage--property" role="img" :aria-label="copy.propertyAriaLabel">
              <div class="landing-capability-property-orbit" />
              <div data-capability-motion="property" class="landing-capability-property-shape">re;</div>
              <span class="landing-capability-tag">transform · opacity · radius</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" lg="3">
        <v-card variant="outlined" class="landing-capability-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-2"><v-icon color="primary" size="18">mdi-motion</v-icon><h3 class="text-subtitle-1 font-weight-bold">{{ copy.springTitle }}</h3></div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.springDescription }}</p>
            <div class="landing-capability-stage landing-capability-stage--spring" role="img" :aria-label="copy.springAriaLabel">
              <div class="landing-capability-spring-track"><span :style="{ left: `${springTargetPosition * 100}%` }" class="landing-capability-spring-target" /><span class="landing-capability-spring-dot" :style="{ left: `${springPosition * 100}%` }" /></div>
              <div class="landing-capability-spring-ruler"><span>{{ copy.springPositionLabel }}</span><span>{{ copy.springRetargetLabel }}</span><span>{{ copy.springVelocityLabel }}</span></div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <v-col cols="12" sm="6" lg="3">
        <v-card variant="outlined" class="landing-capability-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-2"><v-icon color="secondary" size="18">mdi-chart-timeline-variant</v-icon><h3 class="text-subtitle-1 font-weight-bold">{{ copy.streamTitle }}</h3></div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.streamDescription }}</p>
            <div class="landing-capability-stage landing-capability-stage--stream" role="img" :aria-label="copy.streamAriaLabel">
              <svg viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true">
                <path class="landing-capability-stream-grid" d="M0 25H300 M0 50H300 M0 75H300" />
                <polyline class="landing-capability-stream-line" :points="streamPolyline" />
              </svg>
              <span data-capability-motion="stream-cursor" class="landing-capability-stream-cursor" />
              <span class="landing-capability-tag">{{ copy.streamTag }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>
