<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { Subject, type Subscription } from 'rxjs';
import {
  RetargetableMotion,
  Tween,
  adaptiveTween,
  smoothStream,
  type TimestampedValue,
} from '@lib';
import { animate, type DOMAnimation } from '@lib/dom';
import { bindCanvas } from '@lib/canvas';
import { useAppStore } from '../../stores/app';

export type DocsVisualVariant =
  | 'basic'
  | 'timing'
  | 'repeat-yoyo'
  | 'callbacks'
  | 'offsets'
  | 'nested'
  | 'keyframes'
  | 'reactivity'
  | 'await'
  | 'easing'
  | 'easing-gallery'
  | 'retarget-motion'
  | 'smooth-stream'
  | 'adaptive-tween'
  | 'render-adapters'
  | 'keyframes-dom';

const props = defineProps<{
  variant: DocsVisualVariant;
  code: string;
  codeTitle: string;
}>();

const appStore = useAppStore();
const ui = computed(() => appStore.app.view.docs.ui);
const stage = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const demoMessage = ref('');
const animations = shallowRef<DOMAnimation[]>([]);
let observer: IntersectionObserver | null = null;
let visible = false;
let manuallyPaused = false;
let retargetMotion: RetargetableMotion | null = null;
let retargetSubscription: Subscription | null = null;
let retargetTimer: number | null = null;
let retargetIndex = 0;
let streamSource: Subject<TimestampedValue<number>> | null = null;
let streamSubscription: Subscription | null = null;
let streamTimer: number | null = null;
let canvasTween: Tween<number> | null = null;
let canvasBinding: Subscription | null = null;

const reduceMotionRequested = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function targets(selector: string): Element[] {
  return stage.value ? Array.from(stage.value.querySelectorAll(selector)) : [];
}

function addAnimation(selector: string, options: Parameters<typeof animate>[1]): void {
  const selected = targets(selector);
  if (selected.length === 0) return;
  animations.value.push(animate(selected, options));
}

function buildAnimations(): void {
  animations.value = [];
  const looping = { repeat: Infinity, yoyo: true } as const;

  switch (props.variant) {
    case 'basic':
      addAnimation('.docs-demo-orb', {
        duration: 1850,
        easing: 'easeInOutCubic',
        properties: {
          left: { keyframes: [
            { value: '8%', offset: 0 },
            { value: '84%', offset: 0.68, easing: 'easeOutCubic' },
            { value: '8%', offset: 1 },
          ] },
          transform: { keyframes: [
            { value: 'translateY(-50%) rotate(0deg) scale(0.86)', offset: 0 },
            { value: 'translateY(-50%) rotate(210deg) scale(1.12)', offset: 0.68, easing: 'easeOutElastic' },
            { value: 'translateY(-50%) rotate(360deg) scale(0.86)', offset: 1 },
          ] },
          opacity: [0.6, 1],
        },
        ...looping,
      });
      break;
    case 'timing':
      addAnimation('.docs-demo-orb', {
        duration: 800,
        delay: 200,
        repeat: 2,
        yoyo: true,
        easing: 'easeInOutCubic',
        properties: {
          left: ['8%', '84%'],
          transform: ['translateY(-50%) rotate(0deg) scale(0.9)', 'translateY(-50%) rotate(155deg) scale(1.08)'],
          opacity: [0.42, 1],
        },
      });
      break;
    case 'callbacks':
    case 'await':
      addAnimation('.docs-demo-orb', {
        duration: props.variant === 'await' ? 1350 : 1100,
        delay: 100,
        easing: 'easeOutCubic',
        properties: {
          left: ['8%', '84%'],
          transform: ['translateY(-50%) rotate(0deg) scale(0.8)', 'translateY(-50%) rotate(180deg) scale(1.12)'],
          opacity: [0.3, 1],
        },
        onStart: () => { demoMessage.value = props.variant === 'await' ? ui.value.demoPromisePending : ui.value.demoCallbackStarted; },
        onPause: () => { demoMessage.value = ui.value.demoPaused; },
        onComplete: () => {
          demoMessage.value = props.variant === 'await' ? ui.value.demoPromiseResolved : ui.value.demoCallbackCompleted;
          stage.value?.classList.add('docs-demo-stage--complete');
        },
      });
      break;
    case 'repeat-yoyo':
      addAnimation('.docs-demo-pulse', {
        duration: 880,
        easing: 'easeInOutCubic',
        properties: {
          transform: ['translate(-50%, -50%) scale(0.72)', 'translate(-50%, -50%) scale(1.18)'],
          opacity: [0.48, 1],
          borderRadius: ['12px', '22px'],
        },
        repeat: Infinity,
        yoyo: true,
      });
      break;
    case 'keyframes':
      addAnimation('.docs-demo-orb', {
        duration: 2100,
        properties: {
          left: { keyframes: [
            { value: '8%', offset: 0, easing: 'easeOutCubic' },
            { value: '46%', offset: 0.38, easing: 'easeOutElastic' },
            { value: '72%', offset: 0.68, easing: 'easeInOutQuad' },
            { value: '84%', offset: 1 },
          ] },
          transform: { keyframes: [
            { value: 'translateY(-50%) rotate(0deg) scale(0.78)', offset: 0 },
            { value: 'translateY(-50%) rotate(140deg) scale(1.15)', offset: 0.38, easing: 'easeOutElastic' },
            { value: 'translateY(-50%) rotate(250deg) scale(0.95)', offset: 0.68 },
            { value: 'translateY(-50%) rotate(360deg) scale(1)', offset: 1 },
          ] },
          opacity: [0.5, 1],
        },
        ...looping,
      });
      break;
    case 'offsets':
      addAnimation('.docs-demo-item', {
        duration: 780,
        easing: 'easeInOutCubic',
        stagger: (index) => [0, 245, 90, 360][index] ?? index * 100,
        properties: {
          transform: ['translateY(15px) scale(0.78)', 'translateY(-6px) scale(1.08)'],
          opacity: [0.3, 1],
        },
        ...looping,
      });
      break;
    case 'nested':
      addAnimation('.docs-demo-item', {
        duration: 640,
        easing: 'easeOutBack',
        stagger: (index) => index < 2 ? index * 230 : 460 + (index - 2) * 130,
        properties: {
          transform: ['translateX(-12px) scale(0.86)', 'translateX(12px) scale(1.04)'],
          opacity: [0.35, 1],
        },
        ...looping,
      });
      break;
    case 'keyframes-dom':
      addAnimation('.docs-demo-item', {
        duration: 680,
        easing: 'easeOutCubic',
        stagger: (index) => index * 105,
        properties: {
          transform: { keyframes: [
            { value: 'translateY(18px) scale(0.82)', offset: 0, easing: 'easeOutCubic' },
            { value: 'translateY(-5px) scale(1.08)', offset: 0.68, easing: 'easeInOutQuad' },
            { value: 'translateY(0px) scale(1)', offset: 1 },
          ] },
          opacity: [0.3, 1],
          backgroundColor: ['rgb(63, 58, 123)', 'rgb(117, 101, 239)'],
        },
        ...looping,
      });
      break;
    case 'easing':
      addAnimation('.docs-demo-easing-focus-dot', {
        duration: 1850,
        easing: 'easeOutBounce',
        properties: { left: ['8%', '84%'], transform: ['scale(0.78)', 'scale(1.12)'] },
        ...looping,
      });
      break;
    case 'easing-gallery': {
      const curves = ['linear', 'easeOutElastic', 'easeOutBounce'] as const;
      targets('.docs-demo-easing-dot').forEach((target, index) => {
        animations.value.push(animate(target, {
          duration: 1650,
          easing: curves[index] ?? 'easeInOutCubic',
          properties: {
            left: ['8%', '84%'],
            transform: ['scale(0.82)', 'scale(1.08)'],
          },
          ...looping,
        }));
      });
      break;
    }
    case 'reactivity':
      targets('.docs-demo-meter-fill').forEach((target, index) => {
        animations.value.push(animate(target, {
          duration: 950 + index * 220,
          delay: index * 120,
          easing: ['easeInOutCubic', 'easeOutElastic', 'easeOutBounce'][index] ?? 'easeInOutCubic',
          properties: { width: ['14%', '96%'], opacity: [0.55, 1] },
          ...looping,
        }));
      });
      break;
  }
}

const targetSequence = [88, 24, 74, 38, 63, 14];
function startRetargetDemo(): void {
  if (!retargetMotion) return;
  if (retargetMotion.state$.value === 'paused') retargetMotion.resume();
  if (retargetMotion.state$.value !== 'running') {
    retargetMotion.to(targetSequence[retargetIndex++ % targetSequence.length] ?? 88);
  }
  if (retargetTimer !== null) window.clearInterval(retargetTimer);
  retargetTimer = window.setInterval(() => {
    if (!retargetMotion) return;
    retargetMotion.to(targetSequence[retargetIndex++ % targetSequence.length] ?? 88);
  }, 920);
}

function stopRetargetDemo(): void {
  if (retargetTimer !== null) window.clearInterval(retargetTimer);
  retargetTimer = null;
  retargetMotion?.pause();
}

function startSampleStream(): void {
  if (streamSource) return;
  const source = new Subject<TimestampedValue<number>>();
  streamSource = source;
  const interpolator = (from: number, to: number, progress: number): number => from + (to - from) * progress;
  const updateStreamDot = (value: number): void => {
    const dot = stage.value?.querySelector<HTMLElement>('.docs-demo-stream-dot');
    if (dot) dot.style.left = `${8 + (Math.max(0, Math.min(100, value)) / 100) * 84}%`;
  };
  const onStreamError = (): void => { demoMessage.value = ui.value.demoStreamStopped; };
  if (props.variant === 'smooth-stream') {
    streamSubscription = source.pipe(smoothStream<number>({ targetLatency: 55, staleAfter: 1_400, interpolate: interpolator }))
      .subscribe({ next: (sample) => updateStreamDot(sample.value), error: onStreamError });
  } else {
    streamSubscription = source.pipe(adaptiveTween<number>({ minDuration: 90, maxDuration: 360, durationFactor: 1.15, interpolate: interpolator, easing: 'easeOutCubic' }))
      .subscribe({ next: (sample) => updateStreamDot(sample.value), error: onStreamError });
  }
  const values = [12, 91, 27, 73, 39, 86, 18, 62, 46, 80];
  const gaps = [185, 330, 95, 270, 130, 385, 190, 115, 300, 145];
  let index = 0;
  const emit = (): void => {
    if (!streamSource) return;
    source.next({ value: values[index % values.length] ?? 50, timestamp: performance.now() });
    const wait = gaps[index % gaps.length] ?? 180;
    index += 1;
    streamTimer = window.setTimeout(emit, wait);
  };
  emit();
}

function stopSampleStream(): void {
  if (streamTimer !== null) window.clearTimeout(streamTimer);
  streamTimer = null;
  streamSource?.complete();
  streamSubscription?.unsubscribe();
  streamSource = null;
  streamSubscription = null;
}

function setupCanvasDemo(): void {
  const element = canvas.value;
  const context = element?.getContext('2d');
  if (!element || !context) return;
  canvasTween = new Tween({ from: 0, to: 1, duration: 1750, easing: 'easeInOutCubic', repeat: Infinity, yoyo: true });
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--rx-theme-primary').trim() || '124, 104, 245';
  canvasBinding = bindCanvas(context, canvasTween.value$, (ctx, value) => {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.fillStyle = `rgba(${primary}, .055)`;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = `rgba(${primary}, .28)`;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(20, height / 2);
    ctx.lineTo(width - 20, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgb(${primary})`;
    ctx.shadowColor = `rgba(${primary}, .42)`;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(26 + value * (width - 52), height / 2, 15 + value * 4, 0, Math.PI * 2);
    ctx.fill();
  }, { clearBeforeDraw: true, clearOnUnsubscribe: true });
}

function playDemo(fromUser = true): void {
  if (fromUser) manuallyPaused = false;
  if (props.variant === 'retarget-motion') {
    startRetargetDemo();
    return;
  }
  if (props.variant === 'smooth-stream' || props.variant === 'adaptive-tween') {
    startSampleStream();
    return;
  }
  if (props.variant === 'render-adapters') {
    if (canvasTween?.state$.value === 'completed') canvasTween.restart();
    else canvasTween?.play();
    return;
  }
  for (const animation of animations.value) {
    if (animation.state$.value === 'completed') animation.restart();
    else animation.play();
  }
  demoMessage.value = ui.value.demoPlaying;
}

function pauseDemo(fromUser = true): void {
  if (fromUser) manuallyPaused = true;
  if (props.variant === 'retarget-motion') {
    stopRetargetDemo();
    return;
  }
  if (props.variant === 'smooth-stream' || props.variant === 'adaptive-tween') {
    stopSampleStream();
    return;
  }
  if (props.variant === 'render-adapters') {
    canvasTween?.pause();
    return;
  }
  animations.value.forEach((animation) => animation.pause());
  demoMessage.value = ui.value.demoPaused;
}

onMounted(() => {
  buildAnimations();

  if (props.variant === 'retarget-motion') {
    retargetMotion = new RetargetableMotion({ initialValue: 8, stiffness: 230, damping: 22, restDelta: 0.1, restSpeed: 0.1 });
    retargetSubscription = retargetMotion.value$.subscribe((value) => {
      const dot = stage.value?.querySelector<HTMLElement>('.docs-demo-retarget-dot');
      if (dot) dot.style.left = `${8 + (Math.max(0, Math.min(100, value)) / 100) * 84}%`;
    });
  }
  if (props.variant === 'render-adapters') setupCanvasDemo();

  if ('IntersectionObserver' in window && stage.value) {
    observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      visible = Boolean(entry?.isIntersecting && entry.intersectionRatio > 0.1);
      if (visible && !manuallyPaused && !reduceMotionRequested()) playDemo(false);
      else if (!visible) pauseDemo(false);
    }, { threshold: [0, 0.1, 0.4] });
    observer.observe(stage.value);
  } else if (!reduceMotionRequested()) {
    playDemo(false);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  pauseDemo(false);
  animations.value.forEach((animation) => animation.dispose());
  retargetSubscription?.unsubscribe();
  retargetMotion?.dispose();
  canvasBinding?.unsubscribe();
  canvasTween?.stop();
});
</script>

<template>
  <UiCard variant="outlined" rounded="lg" class="docs-visual-example my-4">
    <UiCardText class="pa-3 pa-sm-4">
      <div class="docs-visual-example__workspace" :class="{ 'docs-visual-example__workspace--with-code': Boolean(code) }">
        <div class="docs-visual-example__preview">
          <div class="docs-visual-example__pane-header">
            <span class="docs-visual-example__pane-title"><i aria-hidden="true" />{{ ui.liveExample }}</span>
            <span class="docs-visual-example__pane-meta">LIVE PREVIEW</span>
          </div>
          <div ref="stage" role="group" class="docs-visual-stage" :class="`docs-visual-stage--${variant}`" :aria-label="ui.visualExampleAriaLabel">
            <div class="docs-visual-grid" aria-hidden="true" />

            <template v-if="['basic', 'timing', 'callbacks', 'await', 'keyframes'].includes(variant)">
              <div class="docs-visual-rail" aria-hidden="true" />
              <div class="docs-demo-orb"><span>re;</span></div>
              <div v-if="variant === 'callbacks' || variant === 'await'" class="docs-demo-status" aria-live="polite">{{ demoMessage }}</div>
              <div v-if="variant === 'keyframes'" class="docs-demo-keyframe-markers" aria-hidden="true"><span>0%</span><span>38%</span><span>68%</span><span>100%</span></div>
            </template>

            <div v-else-if="variant === 'repeat-yoyo'" class="docs-demo-pulse-stage">
              <div class="docs-demo-pulse-halo" aria-hidden="true" />
              <div class="docs-demo-pulse">re;</div>
              <span class="docs-demo-pulse-caption">{{ ui.repeatYoyoDemoCaption }}</span>
            </div>

            <div v-else-if="['offsets', 'nested', 'keyframes-dom'].includes(variant)" class="docs-demo-lanes">
              <div v-for="index in 4" :key="index" class="docs-demo-lane">
                <span class="docs-demo-lane-label">{{ String(index).padStart(2, '0') }}</span>
                <div class="docs-demo-lane-track"><div class="docs-demo-item">{{ ['A', 'B', 'C', 'D'][index - 1] }}</div></div>
              </div>
            </div>

            <div v-else-if="variant === 'easing'" class="docs-demo-easing-focus">
              <div class="docs-demo-easing-focus-track"><div class="docs-demo-easing-focus-dot">B</div></div>
              <div class="docs-demo-easing-focus-labels"><span>0</span><strong>easeOutBounce</strong><span>1</span></div>
            </div>

            <div v-else-if="variant === 'easing-gallery'" class="docs-demo-easing-list">
              <div v-for="curve in ['linear', 'elastic', 'bounce']" :key="curve" class="docs-demo-easing-row">
                <span>{{ curve }}</span><div class="docs-demo-easing-track"><div class="docs-demo-easing-dot">{{ curve === 'linear' ? 'L' : curve === 'elastic' ? 'E' : 'B' }}</div></div>
              </div>
            </div>

            <div v-else-if="variant === 'reactivity'" class="docs-demo-meters">
              <div v-for="label in ['progress$', 'state$', 'value$']" :key="label" class="docs-demo-meter">
                <span>{{ label }}</span><div class="docs-demo-meter-track"><div class="docs-demo-meter-fill" /></div>
              </div>
            </div>

            <div v-else-if="variant === 'retarget-motion'" class="docs-demo-target-track">
              <span class="docs-demo-target docs-demo-target--a">A</span><span class="docs-demo-target docs-demo-target--b">B</span><span class="docs-demo-target docs-demo-target--c">C</span>
              <div class="docs-demo-retarget-dot">re;</div>
              <span class="docs-demo-target-caption">{{ ui.retargetDemoCaption }}</span>
            </div>

            <div v-else-if="variant === 'smooth-stream' || variant === 'adaptive-tween'" class="docs-demo-stream-stage">
              <div class="docs-demo-stream-y-axis" /><div class="docs-demo-stream-x-axis" />
              <div class="docs-demo-stream-sample docs-demo-stream-sample--1" /><div class="docs-demo-stream-sample docs-demo-stream-sample--2" /><div class="docs-demo-stream-sample docs-demo-stream-sample--3" /><div class="docs-demo-stream-sample docs-demo-stream-sample--4" /><div class="docs-demo-stream-sample docs-demo-stream-sample--5" />
              <div class="docs-demo-stream-dot" />
              <span class="docs-demo-stream-caption">{{ variant === 'smooth-stream' ? ui.smoothStreamDemoCaption : ui.adaptiveTweenDemoCaption }}</span>
            </div>

            <div v-else-if="variant === 'render-adapters'" class="docs-demo-canvas-wrap">
              <canvas ref="canvas" width="720" height="190" :aria-label="ui.canvasDemoAriaLabel" />
              <div class="docs-demo-adapter-tags"><span>DOM</span><span>SVG</span><span>Canvas 2D</span></div>
            </div>
          </div>

          <div class="docs-visual-example__controls">
            <UiButton color="primary" variant="flat" size="small" prepend-icon="mdi-play" @click="playDemo()">{{ ui.play }}</UiButton>
            <UiButton color="primary" variant="outlined" size="small" prepend-icon="mdi-pause" @click="pauseDemo()">{{ ui.pause }}</UiButton>
          </div>
        </div>

        <section v-if="code" class="docs-visual-example__code" :aria-label="`${codeTitle} TypeScript source`">
          <div class="docs-visual-example__pane-header">
            <span class="docs-visual-example__pane-title"><i aria-hidden="true" />{{ codeTitle }}</span>
            <span class="docs-visual-example__pane-meta">TypeScript</span>
          </div>
          <pre class="docs-code-block" tabindex="0" :aria-label="`${codeTitle} TypeScript source code`"><code>{{ code }}</code></pre>
        </section>
      </div>
    </UiCardText>
  </UiCard>
</template>

<style scoped lang="scss" src="../../styles/components/docs-visual-example.scss"></style>
