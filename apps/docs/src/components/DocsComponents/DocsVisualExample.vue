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
  | 'timeline'
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
    case 'timeline':
      addAnimation('.docs-demo-item', {
        duration: 680,
        easing: 'easeOutCubic',
        stagger: (index) => index * 170,
        properties: {
          transform: ['translateY(12px) scale(0.82)', 'translateY(-8px) scale(1.06)'],
          opacity: [0.38, 1],
          backgroundColor: ['rgb(70, 62, 136)', 'rgb(125, 108, 246)'],
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
  const primary = getComputedStyle(document.documentElement).getPropertyValue('--v-theme-primary').trim() || '124, 104, 245';
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
  <v-card variant="outlined" rounded="lg" class="docs-visual-example my-4">
    <v-card-text class="pa-3 pa-sm-4">
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

        <div v-else-if="['timeline', 'offsets', 'nested', 'keyframes-dom'].includes(variant)" class="docs-demo-lanes">
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

      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn color="primary" variant="flat" size="small" prepend-icon="mdi-play" @click="playDemo()">{{ ui.play }}</v-btn>
        <v-btn color="primary" variant="outlined" size="small" prepend-icon="mdi-pause" @click="pauseDemo()">{{ ui.pause }}</v-btn>
      </div>

      <v-expansion-panels v-if="code" variant="accordion" class="mt-3 docs-visual-code">
        <v-expansion-panel :title="ui.viewExampleCode">
          <v-expansion-panel-text>
            <div class="text-overline text-medium-emphasis mb-2">{{ codeTitle }}</div>
            <pre class="docs-code-block"><code>{{ code }}</code></pre>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.docs-visual-stage {
  position: relative;
  min-width: 0;
  height: clamp(145px, 20vw, 205px);
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-on-surface), .16);
  border-radius: 8px;
  background: radial-gradient(circle at 18% 20%, rgba(var(--v-theme-primary), .13), transparent 43%), radial-gradient(circle at 85% 82%, rgba(var(--v-theme-secondary), .12), transparent 40%), rgb(var(--v-theme-surface-sunken));
  isolation: isolate;
}
.docs-visual-stage--timeline,
.docs-visual-stage--offsets,
.docs-visual-stage--nested,
.docs-visual-stage--keyframes-dom,
.docs-visual-stage--easing-gallery,
.docs-visual-stage--render-adapters { height: clamp(176px, 20vw, 205px); }
.docs-visual-grid {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image: linear-gradient(to right, rgba(var(--v-theme-on-surface), .06) 1px, transparent 1px), linear-gradient(to bottom, rgba(var(--v-theme-on-surface), .04) 1px, transparent 1px);
  background-size: 8% 100%, 100% 24px;
  pointer-events: none;
}
.docs-visual-rail { position: absolute; top: 50%; left: 7%; right: 7%; border-top: 1px dashed rgba(var(--v-theme-on-surface), .34); }
.docs-demo-orb {
  position: absolute; top: 50%; left: 8%; width: 43px; height: 43px; display: grid; place-items: center;
  border: 1px solid rgba(var(--v-theme-on-primary), .28); border-radius: 12px; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 8px 26px rgba(var(--v-theme-primary), .3); transform: translateY(-50%); font-size: 12px; font-weight: 750;
}
.docs-demo-status { position: absolute; top: 12px; right: 14px; color: rgb(var(--v-theme-secondary)); font: 600 11px/1.4 var(--mono, monospace); }
.docs-demo-keyframe-markers { position: absolute; bottom: 10px; left: 8%; right: 8%; display: flex; justify-content: space-between; color: rgb(var(--v-theme-on-surface)); opacity: .6; font-size: 10px; }
.docs-demo-lanes { display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 14px 16px; height: 100%; }
.docs-demo-lane { display: flex; align-items: center; gap: 12px; min-width: 0; }
.docs-demo-lane-label { width: 23px; color: rgb(var(--v-theme-on-surface)); opacity: .6; font: 10px var(--mono, monospace); }
.docs-demo-lane-track { position: relative; height: 27px; min-width: 0; flex: 1; border-bottom: 1px dashed rgba(var(--v-theme-on-surface), .17); }
.docs-demo-item { position: absolute; left: 8%; top: 0; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 8px; border: 1px solid rgba(var(--v-theme-on-primary), .26); background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); box-shadow: 0 5px 14px rgba(var(--v-theme-primary), .24); font-size: 10px; font-weight: 700; }
.docs-demo-pulse-stage { position: absolute; inset: 0; display: grid; place-items: center; }
.docs-demo-pulse-halo { position: absolute; width: 86px; height: 86px; border: 1px solid rgba(var(--v-theme-primary), .35); border-radius: 50%; box-shadow: 0 0 38px rgba(var(--v-theme-primary), .15); }
.docs-demo-pulse { position: absolute; top: 50%; left: 50%; width: 54px; height: 54px; display: grid; place-items: center; border: 1px solid rgba(var(--v-theme-on-primary), .3); border-radius: 12px; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); box-shadow: 0 8px 28px rgba(var(--v-theme-primary), .32); transform: translate(-50%, -50%); font-size: 12px; font-weight: 750; }
.docs-demo-pulse-caption { position: absolute; right: 14px; bottom: 12px; color: rgb(var(--v-theme-on-surface)); opacity: .68; font: 10px var(--mono, monospace); }
.docs-demo-easing-focus { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 12px; padding: 16px 20px; }
.docs-demo-easing-focus-track { position: relative; height: 34px; border-bottom: 1px dashed rgba(var(--v-theme-on-surface), .24); }
.docs-demo-easing-focus-dot { position: absolute; top: 4px; left: 8%; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; background: rgb(var(--v-theme-secondary)); color: rgb(var(--v-theme-on-secondary)); box-shadow: 0 4px 14px rgba(var(--v-theme-secondary), .25); font-size: 10px; font-weight: 700; }
.docs-demo-easing-focus-labels { display: flex; justify-content: space-between; align-items: center; color: rgb(var(--v-theme-on-surface)); opacity: .72; font: 10px var(--mono, monospace); }
.docs-demo-easing-focus-labels strong { font-weight: 600; }
.docs-demo-easing-list { display: flex; flex-direction: column; justify-content: center; gap: 13px; height: 100%; padding: 16px 20px; }
.docs-demo-easing-row { display: grid; grid-template-columns: 58px minmax(0,1fr); align-items: center; gap: 12px; color: rgb(var(--v-theme-on-surface)); font: 11px var(--mono, monospace); }
.docs-demo-easing-track { height: 28px; position: relative; border-bottom: 1px dashed rgba(var(--v-theme-on-surface), .17); }
.docs-demo-easing-dot { position: absolute; left: 8%; top: 2px; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; background: rgb(var(--v-theme-secondary)); color: rgb(var(--v-theme-on-secondary)); box-shadow: 0 4px 14px rgba(var(--v-theme-secondary), .25); font-size: 9px; font-weight: 700; }
.docs-demo-meter { display: grid; grid-template-columns: 70px minmax(0,1fr); align-items: center; gap: 14px; color: rgb(var(--v-theme-on-surface)); font: 11px var(--mono, monospace); }
.docs-demo-meters { display: flex; height: 100%; flex-direction: column; justify-content: center; gap: 22px; padding: 20px 22px; }
.docs-demo-meter-track { height: 11px; background: rgba(var(--v-theme-on-surface), .09); border-radius: 99px; overflow: hidden; }
.docs-demo-meter-fill { width: 14%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-secondary))); box-shadow: 0 0 16px rgba(var(--v-theme-primary), .2); }
.docs-demo-target-track { position: absolute; inset: 0 7%; }
.docs-demo-target { position: absolute; top: 50%; width: 33px; height: 33px; display: grid; place-items: center; margin-top: -16px; border: 1px solid rgba(var(--v-theme-secondary), .6); border-radius: 50%; color: rgb(var(--v-theme-secondary)); background: rgba(var(--v-theme-secondary), .08); font-size: 11px; font-weight: 700; }
.docs-demo-target--a { left: 6%; }.docs-demo-target--b { left: 49%; }.docs-demo-target--c { right: 6%; }
.docs-demo-retarget-dot { position: absolute; top: calc(50% - 18px); left: 8%; width: 36px; height: 36px; display: grid; place-items: center; border-radius: 10px; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); box-shadow: 0 6px 20px rgba(var(--v-theme-primary), .32); font-size: 10px; font-weight: 700; }
.docs-demo-target-caption { position: absolute; bottom: 12px; right: 2px; color: rgb(var(--v-theme-on-surface)); opacity: .62; font-size: 10px; }
.docs-demo-stream-stage { position: absolute; inset: 15px 20px 18px; background-image: linear-gradient(to right, rgba(var(--v-theme-on-surface), .055) 1px, transparent 1px), linear-gradient(to bottom, rgba(var(--v-theme-on-surface), .055) 1px, transparent 1px); background-size: 10% 100%, 100% 25%; }
.docs-demo-stream-y-axis,.docs-demo-stream-x-axis { position: absolute; background: rgba(var(--v-theme-on-surface), .28); }
.docs-demo-stream-y-axis { left: 0; top: 0; bottom: 0; width: 1px; }.docs-demo-stream-x-axis { left: 0; right: 0; bottom: 0; height: 1px; }
.docs-demo-stream-sample { position: absolute; width: 7px; height: 7px; border-radius: 50%; background: rgba(var(--v-theme-secondary), .64); box-shadow: 0 0 0 4px rgba(var(--v-theme-secondary), .08); }
.docs-demo-stream-sample--1 { left: 8%; top: 76%; }.docs-demo-stream-sample--2 { left: 22%; top: 22%; }.docs-demo-stream-sample--3 { left: 40%; top: 62%; }.docs-demo-stream-sample--4 { left: 64%; top: 30%; }.docs-demo-stream-sample--5 { left: 82%; top: 50%; }
.docs-demo-stream-dot { position: absolute; left: 8%; top: calc(50% - 13px); width: 26px; height: 26px; border-radius: 50%; background: rgb(var(--v-theme-primary)); border: 3px solid rgba(var(--v-theme-on-primary), .45); box-shadow: 0 0 19px rgba(var(--v-theme-primary), .4); }
.docs-demo-stream-caption { position: absolute; right: 0; bottom: -15px; color: rgb(var(--v-theme-on-surface)); opacity: .62; font-size: 10px; }
.docs-demo-canvas-wrap { position: absolute; inset: 10px 10px 8px; display: flex; flex-direction: column; justify-content: center; gap: 10px; }
.docs-demo-canvas-wrap canvas { display: block; width: 100%; height: 120px; }
.docs-demo-adapter-tags { display: flex; justify-content: center; gap: 8px; }.docs-demo-adapter-tags span { padding: 3px 9px; border-radius: 999px; background: rgba(var(--v-theme-primary), .12); color: rgb(var(--v-theme-primary)); font-size: 10px; }
.docs-code-block { margin: 0; padding: 14px; max-width: 100%; overflow-x: auto; white-space: pre; background: rgb(var(--v-theme-surface-sunken)); color: rgb(var(--v-theme-on-surface)); border-radius: 8px; font-size: 12px; line-height: 1.65; }
.docs-code-block code { color: inherit; font: inherit; }
@media (prefers-reduced-motion: reduce) {
  .docs-demo-orb,.docs-demo-pulse,.docs-demo-item,.docs-demo-easing-dot,.docs-demo-easing-focus-dot,.docs-demo-meter-fill,.docs-demo-retarget-dot,.docs-demo-stream-dot { transition: none !important; }
}
</style>
