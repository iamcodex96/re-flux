<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { animate, type DOMAnimation } from '@lib/dom';
import { useAppStore } from '../stores/app';

const root = ref<HTMLElement | null>(null);
const store = useAppStore();
const copy = computed(() => store.app.view.home.heroVisual);
const prefersReducedMotion = ref(false);
const visible = ref(false);
let animations: DOMAnimation[] = [];
let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;

function syncPlayback(): void {
  const canPlay = visible.value
    && !prefersReducedMotion.value
    && document.visibilityState === 'visible';

  for (const animation of animations) {
    if (canPlay && animation.state$.value !== 'running') animation.play();
    else if (!canPlay && animation.state$.value === 'running') animation.pause();
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

  const cube = element.querySelector<HTMLElement>('[data-hero-motion="cube"]');
  const orbitA = element.querySelector<HTMLElement>('[data-hero-motion="orbit-a"]');
  const orbitB = element.querySelector<HTMLElement>('[data-hero-motion="orbit-b"]');
  const labels = Array.from(element.querySelectorAll<HTMLElement>('[data-hero-motion="label"]'));
  const ticks = Array.from(element.querySelectorAll<HTMLElement>('[data-hero-motion="tick"]'));
  const lines = Array.from(element.querySelectorAll<HTMLElement>('[data-hero-motion="line"]'));

  if (cube) {
    animations.push(animate(cube, {
      properties: {
        transform: {
          values: [
            'translate(-50%, -50%) rotate(-12deg) scale(0.94)',
            'translate(-50%, -50%) rotate(12deg) scale(1.06)',
          ],
          duration: 2200,
          easing: 'easeInOutCubic',
          repeat: Infinity,
          yoyo: true,
        },
        opacity: { values: [0.82, 1], duration: 1300, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
    }));
  }

  if (orbitA) {
    animations.push(animate(orbitA, {
      properties: {
        transform: {
          values: ['translate(-50%, -50%) rotate(-23deg)', 'translate(-50%, -50%) rotate(337deg)'],
          duration: 18000,
          easing: 'linear',
          repeat: Infinity,
          yoyo: true,
        },
        opacity: { values: [0.45, 1], duration: 2400, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
    }));
  }

  if (orbitB) {
    animations.push(animate(orbitB, {
      properties: {
        transform: {
          values: ['translate(-50%, -50%) rotate(35deg)', 'translate(-50%, -50%) rotate(-325deg)'],
          duration: 23000,
          easing: 'linear',
          repeat: Infinity,
          yoyo: true,
        },
        opacity: { values: [0.35, 0.8], duration: 3100, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
    }));
  }

  if (labels.length) {
    animations.push(animate(labels, {
      properties: {
        transform: { values: ['translateY(5px)', 'translateY(-5px)'], duration: 1800, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true },
        opacity: { values: [0.68, 1], duration: 1500, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
      stagger: (index) => index * 160,
    }));
  }

  if (ticks.length) {
    animations.push(animate(ticks, {
      properties: {
        transform: { values: ['scale(0.75)', 'scale(1.45)'], duration: 1000, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true },
        opacity: { values: [0.35, 1], duration: 1000, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
      stagger: 260,
    }));
  }

  if (lines.length) {
    animations.push(animate(lines, {
      properties: {
        opacity: { values: [0.2, 0.9], duration: 1400, easing: 'easeInOutQuad', repeat: Infinity, yoyo: true },
      },
      stagger: 280,
    }));
  }

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible.value = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.12 });
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
  <div ref="root" class="hero-visual" role="img" :aria-label="copy.ariaLabel">
    <div class="visual-grid" aria-hidden="true" />
    <div data-hero-motion="orbit-a" class="orbit orbit-a" aria-hidden="true" />
    <div data-hero-motion="orbit-b" class="orbit orbit-b" aria-hidden="true" />
    <div data-hero-motion="line" class="visual-line line-a" aria-hidden="true" />
    <div data-hero-motion="line" class="visual-line line-b" aria-hidden="true" />
    <div data-hero-motion="cube" class="hero-cube" aria-hidden="true"><span>re;</span></div>
    <div data-hero-motion="label" class="floating-label label-top"><span>{{ copy.clockLabel }}</span><b aria-hidden="true">●</b></div>
    <div data-hero-motion="label" class="floating-label label-bottom"><b>{{ copy.flowLabel }}</b><span aria-hidden="true">→</span>{{ copy.timelineLabel }}</div>
    <div data-hero-motion="tick" class="visual-tick tick-a" aria-hidden="true" />
    <div data-hero-motion="tick" class="visual-tick tick-b" aria-hidden="true" />
  </div>
</template>
