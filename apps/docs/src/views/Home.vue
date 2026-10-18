<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { createScrollTrigger, type ScrollTriggerController } from '@lib/dom';
import { RetargetableMotion } from '@lib';
import type { Subscription } from 'rxjs';
import { useAppStore } from '../stores/app';
import LandingTelemetryStage from '../components/LandingTelemetryStage.vue';
import LandingCodeMotion from '../components/LandingCodeMotion.vue';
import LandingLabPreview, { type LandingLabPreviewKind } from '../components/LandingLabPreview.vue';
import LandingPrincipleVisual, { type LandingPrincipleVisualKind } from '../components/LandingPrincipleVisual.vue';

const store = useAppStore();
const copy = computed(() => store.app.view.home);
const storyRunway = ref<HTMLElement | null>(null);
const storyProgress = ref(0);
const activeStep = ref(0);
const springFactor = ref(0.72);
const springTargetFactor = ref(0.72);
const installCopied = ref(false);
const installCopyError = ref(false);
const activeStageName = computed(() => copy.value.story.steps[activeStep.value]?.stage ?? 'MOTION COMPOSITION');
const installCommand = 'npm install @re-code/flux';

function getPreviewKind(kind: string): LandingLabPreviewKind {
  if (kind === 'canvas' || kind === 'interaction') return kind;
  return 'svg';
}

function getPrincipleVisualKind(index: string): LandingPrincipleVisualKind {
  const kinds: LandingPrincipleVisualKind[] = ['stream', 'frames', 'adapters', 'lifecycle'];
  return kinds[Math.max(0, Math.min(kinds.length - 1, Number(index) - 1))] ?? 'stream';
}
const stepElements: HTMLElement[] = [];
let storyTrigger: ScrollTriggerController | null = null;
let storySubscription: Subscription | null = null;
let stepObserver: IntersectionObserver | null = null;
let storyMediaQuery: MediaQueryList | null = null;
let springMotionQuery: MediaQueryList | null = null;
let springMotion: RetargetableMotion | null = null;
let springValueSubscription: Subscription | null = null;

function setStepRef(element: unknown, index: number): void {
  if (element instanceof HTMLElement) stepElements[index] = element;
}

function disconnectScrollTrigger(): void {
  storySubscription?.unsubscribe();
  storySubscription = null;
  storyTrigger?.destroy();
  storyTrigger = null;
  storyProgress.value = 0;
}

function handleSpringMotionPreference(): void {
  if (!springMotion) return;
  if (springMotionQuery?.matches) {
    springMotion.to(springTargetFactor.value);
  } else {
    springMotion.pause();
    springFactor.value = springTargetFactor.value;
  }
}

watch(springTargetFactor, (target) => {
  if (!springMotion) {
    springFactor.value = target;
    return;
  }
  if (springMotionQuery?.matches) springMotion.to(target);
  else {
    springMotion.stop();
    springFactor.value = target;
  }
});

function syncScrollTrigger(): void {
  disconnectScrollTrigger();
  if (!storyMediaQuery?.matches || !storyRunway.value) return;

  try {
    storyTrigger = createScrollTrigger(storyRunway.value, {
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (event) => { storyProgress.value = event.progress; },
    });
    storySubscription = storyTrigger.progress$.subscribe((progress) => { storyProgress.value = progress; });
  } catch {
    // The story remains readable if the browser cannot establish a scroll range.
    storyProgress.value = 0;
  }
}

async function copyInstallCommand(): Promise<void> {
  try {
    await navigator.clipboard.writeText(installCommand);
    installCopied.value = true;
    installCopyError.value = false;
  } catch {
    installCopied.value = false;
    installCopyError.value = true;
  }
}

onMounted(async () => {
  await nextTick();
  storyMediaQuery = window.matchMedia('(min-width: 800px) and (prefers-reduced-motion: no-preference)');
  springMotionQuery = window.matchMedia('(prefers-reduced-motion: no-preference)');
  springMotion = new RetargetableMotion({ initialValue: springFactor.value, stiffness: 240, damping: 28, mass: 1 });
  springValueSubscription = springMotion.value$.subscribe((value) => { springFactor.value = value; });
  springMotionQuery.addEventListener('change', handleSpringMotionPreference);
  handleSpringMotionPreference();
  storyMediaQuery.addEventListener('change', syncScrollTrigger);
  syncScrollTrigger();

  if (typeof IntersectionObserver !== 'undefined') {
    stepObserver = new IntersectionObserver((entries) => {
      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio);
      const current = visibleEntries[0];
      if (!current) return;
      const index = Number((current.target as HTMLElement).dataset.storyIndex);
      if (Number.isInteger(index)) activeStep.value = index;
    }, {
      rootMargin: '-32% 0px -38% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    stepElements.forEach((element) => stepObserver?.observe(element));
  }
});

onBeforeUnmount(() => {
  storyMediaQuery?.removeEventListener('change', syncScrollTrigger);
  springMotionQuery?.removeEventListener('change', handleSpringMotionPreference);
  springValueSubscription?.unsubscribe();
  springMotion?.dispose();
  springMotion = null;
  disconnectScrollTrigger();
  stepObserver?.disconnect();
});
</script>

<template>
  <div class="home-page">
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero__ambient home-hero__ambient--one" aria-hidden="true" />
      <div class="home-hero__ambient home-hero__ambient--two" aria-hidden="true" />
      <svg class="home-hero__wave-field" viewBox="0 0 1600 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="home-wave-cyan" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#11c9dc" stop-opacity="0" />
            <stop offset="0.48" stop-color="#11c9dc" stop-opacity="0.5" />
            <stop offset="1" stop-color="#11c9dc" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="home-wave-violet" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stop-color="#a68cff" stop-opacity="0" />
            <stop offset="0.55" stop-color="#a68cff" stop-opacity="0.68" />
            <stop offset="1" stop-color="#a68cff" stop-opacity="0" />
          </linearGradient>
          <filter id="home-wave-blur"><feGaussianBlur stdDeviation="7" /></filter>
        </defs>
        <g class="home-hero__waves home-hero__waves--blur" filter="url(#home-wave-blur)">
          <path d="M-80 320 C 180 80, 285 80, 465 285 S 710 570, 925 320 S 1230 70, 1680 320" />
          <path d="M-80 420 C 160 650, 345 600, 520 380 S 810 110, 1015 390 S 1360 670, 1680 410" />
        </g>
        <g class="home-hero__waves">
          <path class="home-hero__wave--cyan" d="M-80 320 C 180 80, 285 80, 465 285 S 710 570, 925 320 S 1230 70, 1680 320" />
          <path class="home-hero__wave--violet" d="M-80 420 C 160 650, 345 600, 520 380 S 810 110, 1015 390 S 1360 670, 1680 410" />
          <path class="home-hero__wave--thin" d="M-80 510 C 160 390, 290 260, 470 390 S 760 560, 930 430 S 1230 260, 1680 480" />
          <path class="home-hero__wave--cyan" d="M-80 235 C 180 410, 320 420, 525 250 S 830 50, 1030 230 S 1350 450, 1680 245" />
        </g>
      </svg>

      <div class="home-hero__inner rx-content-rail rx-content-rail--wide">
        <div class="home-hero__copy">
          <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.heroBadge }} <span class="home-eyebrow__slash">/ TYPESCRIPT & RXJS</span></p>
          <h1 id="home-title" class="home-hero__title">
            <span>{{ copy.titleLine }} <em>{{ copy.titleBridge }}</em></span>
            <span class="home-hero__title-accent">{{ copy.titleAccent }}</span>
          </h1>
          <p class="home-hero__description">{{ copy.heroTagline }}</p>
          <p class="home-hero__supporting">{{ copy.description }}</p>

          <div class="home-hero__actions">
            <RouterLink class="home-button home-button--primary" to="/visuals">
              {{ copy.heroVisualLab }}
              <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11M10 4l6 6-6 6" /></svg>
            </RouterLink>
            <RouterLink class="home-button home-button--secondary" to="/docs">
              <UiIcon icon="mdi-book-open-page-variant-outline" />
              {{ copy.exploreApi }}
            </RouterLink>
            <button class="home-install-command" type="button" @click="copyInstallCommand">
              <code><span aria-hidden="true">›</span> {{ installCommand }}</code>
              <UiIcon :icon="installCopied ? 'mdi-check' : 'mdi-content-copy'" />
            </button>
          </div>
          <p v-if="installCopied || installCopyError" class="home-hero__copy-feedback" role="status" aria-live="polite">
            {{ installCopied ? 'Install command copied.' : 'Clipboard unavailable — select the command to copy it.' }}
          </p>
        </div>

        <LandingTelemetryStage />

        <div class="home-hero__footnotes" aria-label="Library capabilities">
          <span><i aria-hidden="true" /> RxJS-native</span>
          <span><i aria-hidden="true" /> Shared frame coordination</span>
          <span><i aria-hidden="true" /> DOM · SVG · Canvas · Three.js</span>
          <span><i aria-hidden="true" /> Tree-shakable modules</span>
        </div>
      </div>

      <a class="home-hero__scroll" href="#home-story">
        <span>{{ copy.heroScrollLabel }}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3v13m-6-6 6 6 6-6" /></svg>
      </a>
    </section>

    <section id="home-story" class="home-story-intro rx-content-rail rx-content-rail--wide" aria-labelledby="home-story-title">
      <div class="home-story-intro__heading">
        <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.story.eyebrow }}</p>
        <h2 id="home-story-title"><span>{{ copy.story.title }}</span><span class="home-story-intro__accent">{{ copy.story.titleAccent }}</span></h2>
      </div>
      <p class="home-story-intro__description">{{ copy.story.description }}</p>
    </section>

    <section ref="storyRunway" class="home-story-runway" aria-label="How re;Flux works">
      <div class="home-story-runway__inner rx-content-rail rx-content-rail--wide">
        <div class="home-story-runway__visual-column">
          <div class="home-story-visual-sticky">
            <div class="home-story-visual" :class="`home-story-visual--step-${activeStep}`" :style="{ '--spring-factor': springFactor }">
              <div class="home-story-visual__topline">
                <span>STAGE NODE: {{ activeStageName }}</span>
                <span class="home-story-visual__live"><i aria-hidden="true" />LIVE KERNEL</span>
              </div>
              <div class="home-story-visual__canvas" aria-label="Illustrative motion pipeline visualization">
                <div class="home-story-visual__grid" aria-hidden="true" />
                <svg class="home-story-visual__traces" viewBox="0 0 680 330" preserveAspectRatio="none" aria-hidden="true">
                  <path class="home-story-visual__trace home-story-visual__trace--cyan" d="M0 180 C80 95 100 245 190 170 S310 105 365 175 S480 250 530 167 S625 105 680 173" />
                  <path class="home-story-visual__trace home-story-visual__trace--violet" d="M0 145 C85 212 135 215 220 145 S340 70 405 143 S520 225 575 157 S640 145 680 130" />
                  <path class="home-story-visual__trace home-story-visual__trace--ghost" d="M0 207 C80 150 135 155 215 200 S350 228 415 195 S545 135 610 186 S650 198 680 188" />
                  <circle class="home-story-visual__trace-node home-story-visual__trace-node--one" cx="190" cy="170" r="4" />
                  <circle class="home-story-visual__trace-node home-story-visual__trace-node--two" cx="365" cy="175" r="4" />
                  <circle class="home-story-visual__trace-node home-story-visual__trace-node--three" cx="530" cy="167" r="4" />
                </svg>
                <div class="home-story-visual__kernel" :style="{ transform: `translate(-50%, -50%) scale(${0.78 + springFactor * 0.32})` }">
                  <span class="home-story-visual__kernel-mark" aria-hidden="true">✳</span>
                  <strong>re;Flux kernel</strong>
                  <code>value$ → frame$</code>
                </div>
                <span class="home-story-visual__node home-story-visual__node--one">{{ ['Tween', 'value$', 'Retarget', 'Adapter'][activeStep] }}</span>
                <span class="home-story-visual__node home-story-visual__node--two">{{ ['play()', 'pipe()', 'spring()', 'render()'][activeStep] }}</span>
                <span class="home-story-visual__coordinate home-story-visual__coordinate--one">SOURCE: value$</span>
                <span class="home-story-visual__coordinate home-story-visual__coordinate--two">OUTPUT: render()</span>
              </div>
              <div class="home-story-visual__control">
                <label for="home-spring-factor">SPRING TARGET <output>{{ springTargetFactor.toFixed(2) }}</output></label>
                <input id="home-spring-factor" v-model.number="springTargetFactor" type="range" min="0.2" max="1" step="0.01" aria-label="Spring target position" />
              </div>
              <div class="home-story-visual__footer">
                <span>SCROLL PROGRESS</span>
                <span class="home-story-visual__percent">{{ Math.round(storyProgress * 100) }}%</span>
                <span class="home-story-visual__progress"><i :style="{ transform: `scaleX(${storyProgress})` }" /></span>
              </div>
            </div>
          </div>
        </div>

        <div class="home-story-runway__steps">
          <article
            v-for="(step, index) in copy.story.steps"
            :key="step.number"
            :ref="(element) => setStepRef(element, index)"
            class="home-story-step"
            :class="{ 'home-story-step--active': activeStep === index }"
            :data-story-index="index"
            :aria-current="activeStep === index ? 'step' : undefined"
          >
            <p class="home-story-step__meta"><span>{{ step.category }}</span><span>{{ step.number }} / {{ String(copy.story.steps.length).padStart(2, '0') }}</span></p>
            <h3>{{ step.title }}</h3>
            <p class="home-story-step__description">{{ step.description }}</p>
            <p class="home-story-step__detail"><span aria-hidden="true">↳</span>{{ step.detail }}</p>
            <pre class="home-story-step__code"><code><span v-for="(line, lineIndex) in [copy.story.samples[index]?.lineOne, copy.story.samples[index]?.lineTwo, copy.story.samples[index]?.lineThree, copy.story.samples[index]?.lineFour]" :key="lineIndex" :class="`home-code-line home-code-line--${lineIndex}`">{{ line }}</span></code></pre>
          </article>
        </div>
      </div>
    </section>

    <section class="home-lab" aria-labelledby="home-lab-title">
      <div class="home-lab__inner rx-content-rail rx-content-rail--wide">
        <div class="home-section-heading home-section-heading--lab">
          <div>
            <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.visualLab.eyebrow }}</p>
            <h2 id="home-lab-title">{{ copy.visualLab.title }}</h2>
          </div>
          <div class="home-lab__heading-aside">
            <p>{{ copy.visualLab.description }}</p>
            <RouterLink class="home-text-link" to="/visuals">{{ copy.visualLab.link }} <span aria-hidden="true">↗</span></RouterLink>
          </div>
        </div>

        <div class="home-lab__rail">
          <article v-for="item in copy.visualLab.items.slice(0, 3)" :key="item.index" class="home-lab-card" :class="`home-lab-card--${item.art}`">
            <LandingLabPreview :kind="getPreviewKind(item.art)" :title="item.title" />
            <div class="home-lab-card__info">
              <div class="home-lab-card__meta"><span>{{ item.index }}</span><span>{{ item.tag }}</span></div>
              <h3><RouterLink class="home-lab-card__title" :to="item.to">{{ item.title }}</RouterLink></h3>
              <p>{{ item.description }}</p>
              <RouterLink class="home-lab-card__inspect" :to="item.to">Inspect <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </article>
        </div>
        <p class="home-lab__hint"><span aria-hidden="true">↗</span> {{ copy.visualLab.galleryHint }} <span class="home-lab__hint-line" /></p>
      </div>
    </section>

    <div class="rx-content-rail rx-content-rail--wide home-code-motion-wrap">
      <LandingCodeMotion />
    </div>

    <section class="home-principles rx-content-rail rx-content-rail--wide" aria-labelledby="home-principles-title">
      <div class="home-section-heading">
        <div>
          <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.principles.eyebrow }}</p>
          <h2 id="home-principles-title">{{ copy.principles.title }}</h2>
        </div>
        <p>{{ copy.principles.description }}</p>
      </div>

      <div class="home-principles__grid">
        <article v-for="item in copy.principles.items" :key="item.index" class="home-principle-card">
          <div class="home-principle-card__top"><span>{{ item.index }} / {{ item.tag }}</span><span class="home-principle-card__glyph" aria-hidden="true">{{ ['✳', '↗', '⌘', '▱'][Number(item.index) - 1] }}</span></div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
          <LandingPrincipleVisual :kind="getPrincipleVisualKind(item.index)" :title="item.title" />
          <span class="home-principle-card__bottom"><span class="home-principle-card__line" /><span>re;Flux / {{ item.index }}</span></span>
        </article>
      </div>
    </section>

    <section class="home-closing" aria-labelledby="home-closing-title">
      <div class="home-closing__glow" aria-hidden="true" />
      <div class="home-closing__copy rx-content-rail rx-content-rail--reading">
        <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.closing.eyebrow }}</p>
        <h2 id="home-closing-title">Make your interfaces <span>move.</span></h2>
        <p>{{ copy.closing.description }}</p>
        <div class="home-closing__actions">
          <RouterLink class="home-button home-button--primary" to="/playground">{{ copy.closing.secondary }} <span aria-hidden="true">↗</span></RouterLink>
          <RouterLink class="home-text-link" to="/docs">{{ copy.closing.primary }} <span aria-hidden="true">↗</span></RouterLink>
        </div>
        <button class="home-install-command home-install-command--closing" type="button" @click="copyInstallCommand">
          <code><span aria-hidden="true">$</span> {{ installCommand }}</code>
          <UiIcon :icon="installCopied ? 'mdi-check' : 'mdi-content-copy'" />
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss" src="../styles/views/home.scss"></style>
