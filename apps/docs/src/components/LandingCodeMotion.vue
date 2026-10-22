<script setup lang="ts">
import { useAppStore } from '../stores/app';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Animation, RetargetableMotion, Timeline, Tween, type AnimationState } from '@lib';
import { bindSvgPathMorph } from '@lib/svg';
import type { Subscription } from 'rxjs';

type DemoMode = 'spring' | 'timeline' | 'svg';
type PlaybackActions = {
  play: () => void;
  pause: () => void;
  restart: () => void;
  stop: () => void;
};

const props = withDefaults(defineProps<{ initialDemo?: DemoMode; embedded?: boolean; motionEnabled?: boolean }>(), { initialDemo: 'spring', embedded: false, motionEnabled: true });
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.landingCodeMotion);

const root = ref<HTMLElement | null>(null);
const morphPath = ref<SVGPathElement | null>(null);
const activeDemo = ref<DemoMode>(props.initialDemo);
const progress = ref(0);
const secondaryProgress = ref(0);
const timelineProgress = ref(0);
const playbackState = ref<AnimationState | 'reduced-motion'>('idle');
const copied = ref(false);
const copyFailed = ref(false);
const prefersReducedMotion = ref(false);
const modeOptions: ReadonlyArray<{ value: DemoMode; label: string }> = [
  { value: 'spring', label: copy.value.staticText.springPhysics },
  { value: 'timeline', label: copy.value.staticText.timelineOrchestration },
  { value: 'svg', label: copy.value.staticText.svgMorphStream },
];

const secondaryObjectStyle = computed(() => ({ left: `${10 + secondaryProgress.value * 80}%` }));
const displayProgress = computed(() => activeDemo.value === 'timeline' ? timelineProgress.value : progress.value);
const progressLabel = computed(() => `${Math.round(displayProgress.value * 100)}%`);
const visibleStateLabel = computed(() => {
  if (prefersReducedMotion.value || playbackState.value === 'reduced-motion') return copy.value.staticText.reducedMotion;
  return copy.value.staticText[playbackState.value];
});
const currentMode = computed(() => ({
  spring: { duration: copy.value.staticText.retargeted, easing: copy.value.staticText.springConfiguration },
  timeline: { duration: copy.value.staticText.timelineDuration, easing: copy.value.staticText.timelineEasing },
  svg: { duration: copy.value.staticText.svgDuration, easing: copy.value.staticText.svgEasing },
}[activeDemo.value]));

const shapeStart = 'M 140 34 L 201 67 L 192 137 L 119 157 L 76 99 Z';
const shapeEnd = 'M 140 30 C 183 26 219 61 199 91 C 225 125 183 164 147 145 C 111 170 69 136 88 103 C 67 72 102 35 140 30 Z';

const codeSamples: Record<DemoMode, string> = {
  spring: `import { RetargetableMotion } from '@re-code/flux';

const target = document.querySelector<HTMLElement>('[data-motion-target]');
if (!target) throw new Error('Missing motion target');

const motion = new RetargetableMotion({
  initialValue: 0,
  stiffness: 240,
  damping: 28,
});

const subscription = motion.value$.subscribe((x) => {
  target.style.left = \`${'${9 + x * 82}'}%\`;
});

motion.to(1);
const retarget = window.setInterval(() => {
  motion.to(motion.target$.value === 1 ? 0 : 1);
}, 1700);

// On teardown:
window.clearInterval(retarget);
subscription.unsubscribe();
motion.dispose();`,
  timeline: `import { Animation, Timeline } from '@re-code/flux';

const entranceTarget = document.querySelector<HTMLElement>('[data-entrance-target]');
const settleTarget = document.querySelector<HTMLElement>('[data-settle-target]');
const stageObject = document.querySelector<HTMLElement>('[data-scene-object]');
if (!entranceTarget || !settleTarget || !stageObject) throw new Error('Missing timeline targets');
let entranceProgress = 0;
let settleProgress = 0;

const enter = new Animation({
  duration: 900,
  easing: 'easeOutCubic',
  onUpdate: (_progress, easedProgress) => {
    entranceProgress = easedProgress;
    entranceTarget.style.opacity = String(easedProgress);
    entranceTarget.style.transform = \`translateY(\${(1 - easedProgress) * 10}px)\`;
    stageObject.style.transform = \`translate(-50%, -50%) rotate(\${entranceProgress * 140 - 35}deg) scale(\${0.75 + settleProgress * 0.25})\`;
  },
});
const settle = new Animation({
  duration: 820,
  easing: 'easeInOutCubic',
  onUpdate: (_progress, easedProgress) => {
    settleProgress = easedProgress;
    settleTarget.style.opacity = String(easedProgress);
    settleTarget.style.transform = \`translateX(\${easedProgress * 8}px)\`;
    stageObject.style.transform = \`translate(-50%, -50%) rotate(\${entranceProgress * 140 - 35}deg) scale(\${0.75 + settleProgress * 0.25})\`;
  },
});

const scene = new Timeline()
  .add(enter)
  .add(settle, '-=260');
const sceneSubscription = scene.progress$.subscribe((value) => {
  stageObject.style.left = \`${'${10 + value * 80}'}%\`;
});

scene.play();
// Pause, seek, reverse or stop the composed scene.
// On teardown:
scene.stop();
sceneSubscription.unsubscribe();`,
  svg: `import { Tween } from '@re-code/flux';
import { bindSvgPathMorph } from '@re-code/flux/svg';

const pathElement = document.querySelector<SVGPathElement>('[data-svg-morph]');
if (!pathElement) throw new Error('Missing SVG path');

const shapeStart = 'M 140 34 L 201 67 L 192 137 L 119 157 L 76 99 Z';
const shapeEnd = 'M 140 30 C 183 26 219 61 199 91 C 225 125 183 164 147 145 C 111 170 69 136 88 103 C 67 72 102 35 140 30 Z';
const progress = new Tween({
  from: 0,
  to: 1,
  duration: 2200,
  easing: 'easeInOutCubic',
  repeat: Infinity,
  yoyo: true,
});

const binding = bindSvgPathMorph(
  pathElement, progress.value$, shapeStart, shapeEnd,
);
progress.play();

// On teardown:
progress.stop();
binding.unsubscribe();`,
};
const sourceCode = computed(() => codeSamples[activeDemo.value]);

let currentActions: PlaybackActions | null = null;
let currentSubscriptions = new (class {
  private cleanups: Array<() => void> = [];
  add(subscription: Subscription): void { this.cleanups.push(() => subscription.unsubscribe()); }
  addCleanup(cleanup: () => void): void { this.cleanups.push(cleanup); }
  clear(): void { for (const cleanup of this.cleanups.splice(0).reverse()) cleanup(); }
})();
let observer: IntersectionObserver | null = null;
let motionQuery: MediaQueryList | null = null;
const visible = ref(false);
let documentVisible = true;
let manuallyPaused = false;
const springTarget = ref(1);
let springRetargetTimer: number | null = null;
let demoGeneration = 0;
let demoSetupPending = false;

function canAnimate(): boolean {
  return props.motionEnabled && visible.value && documentVisible && !prefersReducedMotion.value && !manuallyPaused;
}

function canSetUpDemo(): boolean {
  return props.motionEnabled && visible.value && documentVisible && !prefersReducedMotion.value;
}

function stopSpringTimer(): void {
  if (springRetargetTimer !== null) window.clearInterval(springRetargetTimer);
  springRetargetTimer = null;
}

function syncPlayback(): void {
  if (prefersReducedMotion.value) {
    if (playbackState.value === 'running') currentActions?.pause();
    playbackState.value = 'reduced-motion';
    return;
  }
  if (canAnimate()) {
    if (playbackState.value === 'paused' || playbackState.value === 'idle' || playbackState.value === 'reduced-motion') currentActions?.play();
    else if (playbackState.value === 'completed') currentActions?.restart();
  } else if (playbackState.value === 'running') {
    currentActions?.pause();
  }
}

function syncDemoActivation(): void {
  if (canSetUpDemo() && !currentActions && !demoSetupPending) {
    void setupDemo();
    return;
  }
  syncPlayback();
}

function disposeDemo(): void {
  demoGeneration += 1;
  stopSpringTimer();
  currentActions?.stop();
  currentActions = null;
  currentSubscriptions.clear();
  progress.value = 0;
  secondaryProgress.value = 0;
  timelineProgress.value = 0;
  playbackState.value = prefersReducedMotion.value ? 'reduced-motion' : 'idle';
}

function registerState(state$: { subscribe: (observer: (state: AnimationState) => void) => Subscription }): void {
  currentSubscriptions.add(state$.subscribe((state) => { playbackState.value = state; }));
}

async function setupDemo(): Promise<void> {
  if (demoSetupPending || !canSetUpDemo()) return;
  demoSetupPending = true;

  try {
    disposeDemo();
    const generation = demoGeneration;
    await nextTick();
    if (generation !== demoGeneration || !root.value || !canSetUpDemo()) return;

    if (activeDemo.value === 'spring') {
      const motion = new RetargetableMotion({
        initialValue: 0,
        stiffness: 240,
        damping: 28,
        mass: 1,
        restDelta: 0.001,
        restSpeed: 0.01,
      });
      currentSubscriptions.addCleanup(() => motion.dispose());
      springTarget.value = 1;
      const target = root.value.querySelector<HTMLElement>('[data-motion-target]');
      if (!target) {
        motion.dispose();
        return;
      }

      currentSubscriptions.add(motion.value$.subscribe((value) => {
        progress.value = value;
        target.style.left = `${9 + value * 82}%`;
      }));
      registerState(motion.state$);
      currentActions = {
        play: () => {
          if (motion.state$.value === 'paused') motion.resume();
          else motion.to(springTarget.value);
          if (springRetargetTimer === null) {
            springRetargetTimer = window.setInterval(() => {
              springTarget.value = springTarget.value === 1 ? 0 : 1;
              motion.to(springTarget.value);
            }, 1700);
          }
        },
        pause: () => { stopSpringTimer(); motion.pause(); },
        restart: () => {
          stopSpringTimer();
          motion.stop();
          springTarget.value = 1;
          motion.to(springTarget.value);
          springRetargetTimer = window.setInterval(() => {
            springTarget.value = springTarget.value === 1 ? 0 : 1;
            motion.to(springTarget.value);
          }, 1700);
        },
        stop: () => { stopSpringTimer(); motion.stop(); },
      };
    } else if (activeDemo.value === 'timeline') {
      const entranceTarget = root.value.querySelector<HTMLElement>('[data-entrance-target]');
      const settleTarget = root.value.querySelector<HTMLElement>('[data-settle-target]');
      const stageObject = root.value.querySelector<HTMLElement>('[data-scene-object]');
      if (!entranceTarget || !settleTarget || !stageObject) return;

      let entranceProgress = 0;
      let settleProgress = 0;
      const updateStageObject = (): void => {
        stageObject.style.transform = `translate(-50%, -50%) rotate(${entranceProgress * 140 - 35}deg) scale(${0.75 + settleProgress * 0.25})`;
      };
      const enter = new Animation({
        duration: 900,
        easing: 'easeOutCubic',
        onUpdate: (_raw, eased) => {
          entranceProgress = eased;
          secondaryProgress.value = eased;
          entranceTarget.style.opacity = String(eased);
          entranceTarget.style.transform = `translateY(${(1 - eased) * 10}px)`;
          updateStageObject();
        },
      });
      const settle = new Animation({
        duration: 820,
        easing: 'easeInOutCubic',
        onUpdate: (_raw, eased) => {
          settleProgress = eased;
          progress.value = eased;
          settleTarget.style.opacity = String(eased);
          settleTarget.style.transform = `translateX(${eased * 8}px)`;
          updateStageObject();
        },
      });
      const scene = new Timeline().add(enter).add(settle, '-=260');
      currentActions = {
        play: () => { scene.play(); },
        pause: () => { scene.pause(); },
        restart: () => { scene.restart(); },
        stop: () => { scene.stop(); },
      };
      currentSubscriptions.add(scene.progress$.subscribe((value) => {
        timelineProgress.value = value;
        stageObject.style.left = `${10 + value * 80}%`;
      }));
      registerState(scene.state$);
    } else {
      const path = morphPath.value;
      if (!path) return;
      const tween = new Tween({
        from: 0,
        to: 1,
        duration: 2200,
        easing: 'easeInOutCubic',
        repeat: Infinity,
        yoyo: true,
      });
      currentSubscriptions.add(bindSvgPathMorph(path, tween.value$, shapeStart, shapeEnd));
      currentSubscriptions.add(tween.value$.subscribe((value) => { progress.value = value; }));
      registerState(tween.state$);
      currentActions = {
        play: () => { tween.play(); },
        pause: () => { tween.pause(); },
        restart: () => { tween.restart(); },
        stop: () => { tween.stop(); },
      };
      currentSubscriptions.addCleanup(() => tween.stop());
    }

    syncPlayback();
  } finally {
    demoSetupPending = false;
  }
}

function selectDemo(mode: DemoMode): void {
  if (activeDemo.value === mode) return;
  manuallyPaused = false;
  activeDemo.value = mode;
}

function play(): void {
  if (prefersReducedMotion.value || !currentActions) return;
  manuallyPaused = false;
  if (playbackState.value === 'completed') currentActions.restart();
  else currentActions.play();
}

function pause(): void {
  manuallyPaused = true;
  currentActions?.pause();
}

function replay(): void {
  if (prefersReducedMotion.value || !currentActions) return;
  manuallyPaused = false;
  currentActions.restart();
  if (!canAnimate() && playbackState.value === 'running') currentActions.pause();
}

async function copySnippet(): Promise<void> {
  try {
    await navigator.clipboard.writeText(sourceCode.value);
    copied.value = true;
    copyFailed.value = false;
  } catch {
    copied.value = false;
    copyFailed.value = true;
  }
}

function handleMotionPreference(event: MediaQueryListEvent): void {
  prefersReducedMotion.value = event.matches;
  if (event.matches) {
    manuallyPaused = true;
    stopSpringTimer();
    currentActions?.pause();
  } else {
    manuallyPaused = false;
    syncDemoActivation();
  }
}

function handleVisibilityChange(): void {
  documentVisible = document.visibilityState === 'visible';
  syncDemoActivation();
}

watch(activeDemo, () => {
  if (canSetUpDemo()) void setupDemo();
  else disposeDemo();
});
watch(() => props.motionEnabled, syncDemoActivation);

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  prefersReducedMotion.value = motionQuery.matches;
  documentVisible = document.visibilityState === 'visible';
  motionQuery.addEventListener('change', handleMotionPreference);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  if (typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver((entries) => {
      visible.value = entries.some((entry) => entry.isIntersecting);
      syncDemoActivation();
    }, { rootMargin: '120px 0px', threshold: 0.1 });
    if (root.value) observer.observe(root.value);
  } else {
    visible.value = true;
  }
  syncDemoActivation();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  motionQuery?.removeEventListener('change', handleMotionPreference);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  disposeDemo();
});
</script>

<template>
  <section
    ref="root"
    class="landing-code-motion"
    :class="{ 'landing-code-motion--embedded': props.embedded }"
    :aria-labelledby="props.embedded ? undefined : 'landing-code-title'"
    :aria-label="props.embedded ? copy.staticText.timelineAnimationWorkbench : undefined"
  >
    <header v-if="!props.embedded" class="landing-code-motion__heading">
      <div>
        <p class="landing-code-motion__eyebrow"><span aria-hidden="true" /> {{ copy.staticText.liveWORKBENCH }}</p>
        <h2 id="landing-code-title">{{ copy.staticText.codeInMotion }}</h2>
      </div>
      <p class="landing-code-motion__caption">{{ copy.staticText.aWorkingExampleItsSourceAndTheMotionModelThatDrivesIt }}</p>
    </header>

    <div v-if="!props.embedded" class="landing-code-motion__modes" :aria-label="copy.staticText.chooseAnAnimationExample">
      <button
        v-for="mode in modeOptions"
        :key="mode.value"
        type="button"
        class="landing-code-motion__mode"
        :class="{ 'landing-code-motion__mode--active': activeDemo === mode.value }"
        :aria-pressed="activeDemo === mode.value"
        @click="selectDemo(mode.value)"
      >{{ mode.label }}</button>
    </div>

    <div class="landing-code-motion__workspace">
      <div class="landing-code-motion__preview">
        <div class="landing-code-motion__preview-header">
          <span><i aria-hidden="true" /> {{ activeDemo === 'spring' ? copy.staticText.retargetableMotion : activeDemo === 'timeline' ? copy.staticText.composedTimeline : copy.staticText.svgPathInterpolation }}</span>
          <div class="landing-code-motion__controls">
            <button type="button" :aria-label="copy.staticText.playAnimation" :title="copy.staticText.play" :disabled="prefersReducedMotion" @click="play"><UiIcon icon="mdi-play" /></button>
            <button type="button" :aria-label="copy.staticText.pauseAnimation" :title="copy.staticText.pause" @click="pause"><UiIcon icon="mdi-pause" /></button>
            <button type="button" :aria-label="copy.staticText.replayAnimation" :title="copy.staticText.replay" :disabled="prefersReducedMotion" @click="replay"><UiIcon icon="mdi-replay" /></button>
          </div>
        </div>

        <div class="landing-code-motion__stage" :class="`landing-code-motion__stage--${activeDemo}`" :aria-label="`${modeOptions.find((mode) => mode.value === activeDemo)?.label}. ${copy.staticText.currentProgress.replace('{progress}', progressLabel)}`" role="img">
          <template v-if="activeDemo === 'spring'">
            <svg class="landing-code-motion__wave" viewBox="0 0 620 180" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 93 C62 25 94 151 157 91 S251 34 310 92 S409 151 467 91 S554 33 620 92" />
              <path d="M0 107 C69 165 108 47 172 104 S260 160 320 103 S421 43 477 102 S566 157 620 103" />
            </svg>
            <div class="landing-code-motion__track" />
            <div class="landing-code-motion__object" data-motion-target><span>{{ copy.staticText.re }}</span></div>
            <div class="landing-code-motion__stage-label landing-code-motion__stage-label--left">{{ copy.staticText.target }} <b>{{ springTarget.toFixed(2) }}</b></div>
            <div class="landing-code-motion__stage-label landing-code-motion__stage-label--right">{{ copy.staticText.value }} <b>{{ progressLabel }}</b></div>
          </template>
          <template v-else-if="activeDemo === 'timeline'">
            <div class="landing-code-motion__timeline-rows" aria-hidden="true">
              <div class="landing-code-motion__timeline-row"><span>{{ copy.staticText.enter }}</span><i><b :style="{ width: `${Math.max(4, secondaryProgress * 100)}%` }" /></i><code>{{ Math.round(secondaryProgress * 100) }}%</code></div>
              <div class="landing-code-motion__timeline-row"><span>{{ copy.staticText.settle }}</span><i><b :style="{ width: `${Math.max(4, progress * 100)}%` }" /></i><code>{{ Math.round(progress * 100) }}%</code></div>
              <div class="landing-code-motion__timeline-playhead" :style="{ left: `${timelineProgress * 78 + 18}%` }" />
            </div>
            <div class="landing-code-motion__object landing-code-motion__object--timeline" data-scene-object><span>{{ copy.staticText.re }}</span></div>
            <span class="landing-code-motion__timeline-target landing-code-motion__timeline-target--entrance" data-entrance-target>{{ copy.staticText.fadeLift }}</span>
            <span class="landing-code-motion__timeline-target landing-code-motion__timeline-target--settle" data-settle-target>{{ copy.staticText.settle }}</span>
          </template>
          <template v-else>
            <svg class="landing-code-motion__morph" viewBox="0 0 280 190" aria-hidden="true">
              <defs>
                <linearGradient id="landing-code-morph-fill" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#a78bfa" stop-opacity=".4" />
                  <stop offset="1" stop-color="#14c8dd" stop-opacity=".08" />
                </linearGradient>
              </defs>
              <circle cx="140" cy="95" r="66" class="landing-code-motion__morph-orbit" />
              <path ref="morphPath" data-svg-morph :d="shapeStart" fill="url(#landing-code-morph-fill)" />
              <circle cx="140" cy="95" r="4" class="landing-code-motion__morph-node" />
            </svg>
          </template>
          <div class="landing-code-motion__stage-footer"><span>{{ activeDemo === 'spring' ? copy.staticText.targetChangesPreserveVelocity : activeDemo === 'timeline' ? copy.staticText.twoTracksOneClock : copy.staticText.compatiblePathCommandsInterpolated }}</span><span>{{ copy.staticText.state }} {{ visibleStateLabel }}</span></div>
        </div>

        <div class="landing-code-motion__preview-footer"><span>{{ copy.staticText.duration }} <b>{{ currentMode.duration }}</b></span><span>{{ copy.staticText.model }} <b>{{ currentMode.easing }}</b></span><span>{{ copy.staticText.progress }} <b>{{ progressLabel }}</b></span></div>
        <p v-if="prefersReducedMotion" class="landing-code-motion__motion-note" role="status">{{ copy.staticText.reducedMotionIsEnabledLivePlaybackIsPaused }}</p>
      </div>

      <div class="landing-code-motion__code">
        <div class="landing-code-motion__code-header"><span><i aria-hidden="true" /> {{ activeDemo === 'spring' ? copy.staticText.springCodeFilename : activeDemo === 'timeline' ? copy.staticText.timelineCodeFilename : copy.staticText.svgCodeFilename }}</span><span>{{ copy.staticText.typescript }}</span></div>
        <pre tabindex="0"><code>{{ sourceCode }}</code></pre>
        <div class="landing-code-motion__code-footer"><span>{{ copy.staticText.composableMotionExplicitCleanup }}</span><button type="button" @click="copySnippet"><UiIcon :icon="copied ? 'mdi-check' : 'mdi-content-copy'" /> {{ copied ? copy.staticText.copied : copy.staticText.copySnippet }}</button></div>
        <p v-if="copyFailed" class="landing-code-motion__feedback" role="status">{{ copy.staticText.clipboardAccessIsUnavailableSelectTheCodeToCopyItManually }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss" src="../styles/components/landing-code-motion.scss"></style>
