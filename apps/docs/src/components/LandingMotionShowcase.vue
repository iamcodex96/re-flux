<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { animate, type DOMAnimation } from '@lib/dom';
import { stagger } from '@lib';
import { useAppStore } from '../stores/app';

const root = ref<HTMLElement | null>(null);
const store = useAppStore();
const copy = computed(() => store.app.view.home.showcase);
const isPlaying = ref(false);
const prefersReducedMotion = ref(false);
const visible = ref(false);
let animations: DOMAnimation[] = [];
let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let userPaused = false;

function syncPlayback(): void {
  const canPlay = visible.value
    && !userPaused
    && !prefersReducedMotion.value
    && document.visibilityState === 'visible';

  for (const animation of animations) {
    if (canPlay && animation.state$.value !== 'running') animation.play();
    else if (!canPlay && animation.state$.value === 'running') animation.pause();
  }
  isPlaying.value = canPlay;
}

function togglePlayback(): void {
  userPaused = isPlaying.value;
  syncPlayback();
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

  prefersReducedMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', handleMotionPreference);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const staggerTargets = Array.from(element.querySelectorAll<HTMLElement>('[data-motion="stagger-target"]'));
  const orbitTarget = element.querySelector<HTMLElement>('[data-motion="keyframe-target"]');
  const timelineBars = Array.from(element.querySelectorAll<HTMLElement>('[data-motion="timeline-bar"]'));

  if (staggerTargets.length) {
    animations.push(animate(staggerTargets, {
      properties: {
        transform: {
          values: ['translateY(9px) scale(0.92)', 'translateY(-9px) scale(1.04)'],
          duration: 760,
          easing: 'easeInOutCubic',
          repeat: Infinity,
          yoyo: true,
        },
        opacity: {
          values: [0.46, 1],
          duration: 620,
          easing: 'easeInOutQuad',
          repeat: Infinity,
          yoyo: true,
        },
      },
      stagger: stagger(115, { from: 'center', easing: 'easeOutCubic' }),
    }));
  }

  if (orbitTarget) {
    animations.push(animate(orbitTarget, {
      properties: {
        transform: {
          values: ['translateX(-48px) rotate(-14deg) scale(0.92)', 'translateX(48px) rotate(14deg) scale(1.08)'],
          duration: 1800,
          easing: 'easeInOutCubic',
          repeat: Infinity,
          yoyo: true,
        },
        borderRadius: {
          values: ['13px', '25px'],
          duration: 1800,
          easing: 'easeInOutCubic',
          repeat: Infinity,
          yoyo: true,
        },
      },
    }));
  }

  if (timelineBars.length) {
    animations.push(animate(timelineBars, {
      properties: {
        width: {
          values: ['22%', '91%'],
          duration: 1600,
          easing: 'easeInOutCubic',
          repeat: Infinity,
          yoyo: true,
        },
        opacity: {
          values: [0.5, 1],
          duration: 1000,
          easing: 'easeInOutQuad',
          repeat: Infinity,
          yoyo: true,
        },
      },
      stagger: stagger(160, { from: 'first' }),
    }));
  }

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible.value = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.16 });
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
});
</script>

<template>
  <section ref="root" class="landing-motion-showcase mb-12 mb-md-16" :aria-label="copy.ariaLabel">
    <div class="d-flex flex-column flex-sm-row align-start align-sm-end justify-space-between ga-4 mb-5">
      <div class="min-w-0">
        <div class="text-overline text-primary mb-2">{{ copy.eyebrow }}</div>
        <h2 class="text-h4 font-weight-bold mb-2">{{ copy.title }}</h2>
        <p class="text-body-2 text-medium-emphasis landing-motion-showcase__intro">{{ copy.description }}</p>
      </div>
      <div class="d-flex flex-column align-start align-sm-end ga-2 flex-shrink-0">
        <v-chip size="small" :color="isPlaying ? 'secondary' : 'default'" variant="tonal" role="status" aria-live="polite">
          <v-icon start size="13">{{ isPlaying ? 'mdi-pulse' : 'mdi-pause-circle-outline' }}</v-icon>
          {{ isPlaying ? copy.playing : (prefersReducedMotion ? copy.reduced : copy.paused) }}
        </v-chip>
        <v-btn
          size="small"
          variant="outlined"
          color="primary"
          :disabled="prefersReducedMotion"
          :prepend-icon="isPlaying ? 'mdi-pause' : 'mdi-play'"
          @click="togglePlayback"
        >
          {{ isPlaying ? copy.pause : copy.play }}
        </v-btn>
      </div>
    </div>

    <v-row dense>
      <v-col cols="12" md="4">
        <v-card variant="outlined" rounded="lg" class="landing-motion-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-1">
              <v-icon size="18" color="primary">mdi-view-grid-outline</v-icon>
              <h3 class="text-subtitle-1 font-weight-bold">{{ copy.cascadeTitle }}</h3>
            </div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.cascadeDescription }}</p>
            <div class="landing-motion-stage landing-motion-stage--dots" :aria-label="copy.cascadeAriaLabel">
              <span v-for="index in 7" :key="index" data-motion="stagger-target" class="landing-motion-dot">{{ String(index).padStart(2, '0') }}</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" rounded="lg" class="landing-motion-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-1">
              <v-icon size="18" color="secondary">mdi-vector-curve</v-icon>
              <h3 class="text-subtitle-1 font-weight-bold">{{ copy.keyframesTitle }}</h3>
            </div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.keyframesDescription }}</p>
            <div class="landing-motion-stage landing-motion-stage--orbit" :aria-label="copy.keyframesAriaLabel">
              <div class="landing-motion-orbit" />
              <div class="landing-motion-orbit landing-motion-orbit--inner" />
              <div data-motion="keyframe-target" class="landing-motion-keyframe">re;</div>
              <span class="landing-motion-tag">keyframes / yoyo</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card variant="outlined" rounded="lg" class="landing-motion-card h-100">
          <v-card-text class="pa-4">
            <div class="d-flex align-center ga-2 mb-1">
              <v-icon size="18" color="secondary">mdi-timeline-text-outline</v-icon>
              <h3 class="text-subtitle-1 font-weight-bold">{{ copy.timelineTitle }}</h3>
            </div>
            <p class="text-caption text-medium-emphasis mb-4">{{ copy.timelineDescription }}</p>
            <div class="landing-motion-stage landing-motion-stage--timeline" :aria-label="copy.timelineAriaLabel">
              <div v-for="index in 3" :key="index" class="landing-motion-track">
                <span class="landing-motion-track__label">{{ ['A', 'B', 'C'][index - 1] }}</span>
                <span class="landing-motion-track__rail"><span data-motion="timeline-bar" class="landing-motion-track__bar" :class="`landing-motion-track__bar--${index}`" /></span>
              </div>
              <span class="landing-motion-timeline-caption">shared frame clock</span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>
