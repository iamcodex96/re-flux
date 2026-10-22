<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Tween } from '@lib';
import type { Subscription } from 'rxjs';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.landingPrincipleVisual);
export type LandingPrincipleVisualKind = 'stream' | 'frames' | 'adapters' | 'lifecycle';

const props = defineProps<{
  kind: LandingPrincipleVisualKind;
  title: string;
}>();

const root = ref<HTMLElement | null>(null);
const progress = ref(0);
const prefersReducedMotion = ref(false);
let tween: Tween<number> | null = null;
let valueSubscription: Subscription | null = null;
let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let visible = false;
let documentVisible = true;

const lifecycleStep = computed(() => Math.min(3, Math.floor(progress.value * 4)));
const frameWidths = computed(() => [
  `${26 + progress.value * 62}%`,
  `${65 - progress.value * 32}%`,
  `${32 + Math.sin(progress.value * Math.PI) * 44}%`,
]);

function syncPlayback(): void {
  if (!tween) return;
  const canRun = visible && documentVisible && !prefersReducedMotion.value;
  if (canRun && tween.state$.value !== 'running') tween.play();
  else if (!canRun && tween.state$.value === 'running') tween.pause();
}

function handleMotionPreference(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches;
  syncPlayback();
}

function handleDocumentVisibility(): void {
  documentVisible = document.visibilityState === 'visible';
  syncPlayback();
}

onMounted(() => {
  tween = new Tween({
    from: 0,
    to: 1,
    duration: 2100,
    easing: 'easeInOutCubic',
    repeat: Infinity,
    yoyo: true,
  });
  valueSubscription = tween.value$.subscribe((value) => { progress.value = value; });
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = motionQuery.matches;
  documentVisible = document.visibilityState === 'visible';
  motionQuery.addEventListener('change', handleMotionPreference);
  document.addEventListener('visibilitychange', handleDocumentVisibility);

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.12 });
    if (root.value) observer.observe(root.value);
  } else {
    visible = true;
  }
  syncPlayback();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  motionQuery?.removeEventListener('change', handleMotionPreference);
  document.removeEventListener('visibilitychange', handleDocumentVisibility);
  valueSubscription?.unsubscribe();
  valueSubscription = null;
  tween?.stop();
  tween = null;
});
</script>

<template>
  <div ref="root" class="landing-principle-visual" :class="`landing-principle-visual--${kind}`" role="img" :aria-label="copy.staticText.animatedTechnicalIllustrationAriaLabel.replace('{title}', title)">
    <template v-if="kind === 'stream'">
      <svg viewBox="0 0 320 58" preserveAspectRatio="none" aria-hidden="true">
        <path class="landing-principle-visual__guide" d="M0 29 H320" />
        <path class="landing-principle-visual__wave" d="M0 33 C28 5 45 53 76 28 S123 5 157 31 S206 50 237 26 S284 8 320 30" />
        <circle v-for="(point, index) in [28, 76, 125, 173, 222, 270]" :key="point" :cx="point" :cy="29 + Math.sin((progress * 2 + index * 0.5) * Math.PI) * 8" :r="index === 2 ? 3.5 : 2.4" :class="index % 2 === 0 ? 'landing-principle-visual__point' : 'landing-principle-visual__point landing-principle-visual__point--violet'" />
      </svg>
      <span class="landing-principle-visual__caption">{{ copy.staticText.input }} <i /> {{ copy.staticText.transform }} <i /> {{ copy.staticText.output }}</span>
    </template>

    <template v-else-if="kind === 'frames'">
      <div class="landing-principle-visual__frame-labels"><span>{{ copy.staticText.read }}</span><span>{{ copy.staticText.update }}</span><span>{{ copy.staticText.render }}</span></div>
      <div v-for="(width, index) in frameWidths" :key="index" class="landing-principle-visual__frame-row">
        <span :class="`landing-principle-visual__frame-dot landing-principle-visual__frame-dot--${index}`" />
        <i><b :style="{ width }" /></i>
        <code>{{ ['INPUT', 'STATE', 'PAINT'][index] }}</code>
      </div>
      <span class="landing-principle-visual__caption">{{ copy.staticText.sharedFrameCoordination }}</span>
    </template>

    <template v-else-if="kind === 'adapters'">
      <div class="landing-principle-visual__adapter-rail"><i :style="{ transform: `scaleX(${progress})` }" /></div>
      <div class="landing-principle-visual__adapter-nodes">
        <span v-for="(name, index) in ['DOM', 'SVG', 'Canvas', 'Three']" :key="name" :class="{ 'is-active': Math.abs(progress * 3 - index) < 0.7 }">{{ name }}</span>
      </div>
      <span class="landing-principle-visual__adapter-pulse" :style="{ left: `${progress * 100}%` }" />
      <span class="landing-principle-visual__caption">{{ copy.staticText.oneMotionModelMultipleRenderers }}</span>
    </template>

    <template v-else>
      <div class="landing-principle-visual__lifecycle">
        <span v-for="(label, index) in ['ACQUIRE', 'ACTIVE', 'PAUSED', 'RELEASE']" :key="label" :class="{ 'is-current': lifecycleStep === index }">
          <i>{{ String(index + 1).padStart(2, '0') }}</i>
          <b>{{ label }}</b>
        </span>
      </div>
      <div class="landing-principle-visual__lifecycle-track"><i :style="{ transform: `scaleX(${progress})` }" /></div>
      <span class="landing-principle-visual__caption">{{ prefersReducedMotion ? 'motion paused by preference' : 'illustrative resource lifecycle' }}</span>
    </template>
  </div>
</template>

<style scoped lang="scss" src="../styles/components/landing-principle-visual.scss"></style>
