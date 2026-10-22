<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { onBeforeUnmount, onMounted, ref , computed} from 'vue';
import { animate, type DOMAnimation } from '@lib/dom';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.landingTelemetryStage);
const root = ref<HTMLElement | null>(null);
const nodePositions = [
  { x: '12%', y: '49%', delay: 0 },
  { x: '29%', y: '31%', delay: 140 },
  { x: '43%', y: '63%', delay: 270 },
  { x: '58%', y: '41%', delay: 420 },
  { x: '74%', y: '28%', delay: 560 },
  { x: '88%', y: '55%', delay: 700 },
];

let animations: DOMAnimation[] = [];
let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;
let visible = false;
let prefersReducedMotion = false;

function syncPlayback(): void {
  const canPlay = visible && !prefersReducedMotion && document.visibilityState === 'visible';
  for (const animation of animations) {
    if (canPlay && animation.state$.value !== 'running') animation.play();
    else if (!canPlay && animation.state$.value === 'running') animation.pause();
  }
}

function handleMotionPreference(event: MediaQueryListEvent): void {
  prefersReducedMotion = event.matches;
  syncPlayback();
}

function handleVisibilityChange(): void {
  syncPlayback();
}

onMounted(() => {
  const element = root.value;
  if (!element) return;

  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion = motionQuery.matches;
  motionQuery.addEventListener('change', handleMotionPreference);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const nodes = Array.from(element.querySelectorAll<HTMLElement>('[data-telemetry-node]'));
  animations = nodes.map((node, index) => animate(node, {
    properties: {
      transform: {
        values: ['translate(-50%, -50%) scale(0.7)', 'translate(-50%, -50%) scale(1.18)'],
        duration: 1050 + (index % 3) * 240,
        easing: 'easeInOutCubic',
        repeat: Infinity,
        yoyo: true,
      },
      opacity: {
        values: [0.35, 1],
        duration: 850 + (index % 2) * 180,
        easing: 'easeInOutQuad',
        repeat: Infinity,
        yoyo: true,
      },
    },
    delay: nodePositions[index]?.delay ?? 0,
  }));

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      syncPlayback();
    }, { threshold: 0.08 });
    observer.observe(element);
  } else {
    visible = true;
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
  <section ref="root" class="telemetry-stage" aria-labelledby="telemetry-stage-title">
    <header class="telemetry-stage__header">
      <h2 id="telemetry-stage-title"><span class="telemetry-stage__live-dot" aria-hidden="true" /> {{ copy.staticText.telemetrySTAGE }} <span aria-hidden="true">//</span> {{ copy.staticText.reactiveVECTORGRAPH }}</h2>
      <div class="telemetry-stage__meta" :aria-label="copy.staticText.illustrativeMotionPipelineAriaLabel">
        <span><b>{{ copy.staticText.input }}</b> {{ copy.staticText.value }}</span>
        <span><b>{{ copy.staticText.model }}</b> {{ copy.staticText.spring }}</span>
        <span><b>{{ copy.staticText.output }}</b> {{ copy.staticText.render }}</span>
        <span class="telemetry-stage__node-count">{{ copy.staticText.nodes06 }}</span>
      </div>
    </header>

    <div class="telemetry-stage__canvas" role="img" :aria-label="copy.staticText.animatedVectorPipelineAriaLabel">
      <div class="telemetry-stage__grid" aria-hidden="true" />
      <svg class="telemetry-stage__traces" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="telemetry-violet" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#8f72ff" stop-opacity="0" />
            <stop offset="0.42" stop-color="#a78bfa" stop-opacity="0.8" />
            <stop offset="1" stop-color="#a78bfa" stop-opacity="0.05" />
          </linearGradient>
          <linearGradient id="telemetry-cyan" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#14c8dd" stop-opacity="0.05" />
            <stop offset="0.55" stop-color="#14c8dd" stop-opacity="0.82" />
            <stop offset="1" stop-color="#14c8dd" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path class="telemetry-stage__trace telemetry-stage__trace--violet" d="M0 166 C95 166 104 122 188 137 S300 212 392 161 S510 108 592 146 S720 205 804 157 S922 125 1000 163" />
        <path class="telemetry-stage__trace telemetry-stage__trace--cyan" d="M0 142 C103 196 140 212 224 164 S340 84 424 146 S548 215 628 163 S766 91 850 147 S946 197 1000 145" />
        <path class="telemetry-stage__trace telemetry-stage__trace--ghost" d="M0 186 C110 142 155 160 240 184 S378 185 468 151 S601 126 684 176 S820 208 900 174 S963 161 1000 182" />
        <path class="telemetry-stage__trace telemetry-stage__trace--dashed" d="M0 151 C116 88 173 106 267 161 S420 235 507 162 S670 86 756 151 S897 225 1000 147" />
      </svg>

      <span
        v-for="(node, index) in nodePositions"
        :key="index"
        class="telemetry-stage__node"
        :class="`telemetry-stage__node--${index + 1}`"
        :style="{ '--node-x': node.x, '--node-y': node.y }"
        data-telemetry-node
        aria-hidden="true"
      />

      <div class="telemetry-stage__pipeline" aria-hidden="true">
        <span class="telemetry-stage__pipeline-step">{{ copy.staticText.value }}</span>
        <i />
        <span class="telemetry-stage__pipeline-step">{{ copy.staticText.spring2 }}</span>
        <i />
        <span class="telemetry-stage__pipeline-step">{{ copy.staticText.frameCoordination }}</span>
        <i />
        <span class="telemetry-stage__pipeline-step telemetry-stage__pipeline-step--active">{{ copy.staticText.render }}</span>
      </div>

      <p class="telemetry-stage__readout"><span>{{ copy.staticText.flow }}</span> {{ copy.staticText.observableMotionOutput }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss" src="../styles/components/landing-telemetry-stage.scss"></style>
