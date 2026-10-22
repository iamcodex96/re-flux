<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { createScrollTrigger, type ScrollTriggerController } from '@lib/dom';
import { MotionPreferences, RetargetableMotion } from '@lib';
import type { Subscription } from 'rxjs';
import { useAppStore } from '../stores/app';
import LandingTelemetryStage from '../components/LandingTelemetryStage.vue';
import LandingCodeMotion from '../components/LandingCodeMotion.vue';
import LandingLabPreview, { type LandingLabPreviewKind } from '../components/LandingLabPreview.vue';
import LandingPrincipleVisual, { type LandingPrincipleVisualKind } from '../components/LandingPrincipleVisual.vue';
const VisualLabShaderPreview = defineAsyncComponent(() => import('../components/VisualLab/VisualLabShaderPreview.vue'));

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const store = useAppStore();
const copy = computed(() => store.app.view.home);
const hasScrolled = ref(false);
const heroSection = ref<HTMLElement | null>(null);
const heroFluidActive = ref(false);
const heroShaderRequested = ref(false);
const heroMotionPreferences = new MotionPreferences();
const storyRunway = ref<HTMLElement | null>(null);
const storyVisible = ref(false);
const storyMotionEnabled = computed(() => hasScrolled.value && storyVisible.value);
const storyProgress = ref(0);
const activeStep = ref(0);
const springFactor = ref(0.72);
const springTargetFactor = ref(0.72);
const installCopied = ref(false);
const installCopyError = ref(false);
const activeStageName = computed(() => copy.value.story.steps[activeStep.value]?.stage ?? copy.value.staticText.motionComposition);
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
let heroVisibilityObserver: IntersectionObserver | null = null;
let storyVisibilityObserver: IntersectionObserver | null = null;
let heroShaderIdleHandle: number | null = null;
let heroShaderTimeout: number | null = null;
let heroMotionSubscription: Subscription | null = null;
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

function activateLandingMotionAfterScroll(): void {
  if (window.scrollY <= 0 || hasScrolled.value) return;
  hasScrolled.value = true;
  window.removeEventListener('scroll', activateLandingMotionAfterScroll);
}

function cancelDeferredHeroShader(): void {
  const idleWindow = window as IdleWindow;
  if (heroShaderIdleHandle !== null) {
    idleWindow.cancelIdleCallback?.(heroShaderIdleHandle);
    heroShaderIdleHandle = null;
  }
  if (heroShaderTimeout !== null) {
    window.clearTimeout(heroShaderTimeout);
    heroShaderTimeout = null;
  }
}

function scheduleHeroShader(): void {
  if (heroShaderRequested.value || heroMotionPreferences.snapshot.reducedMotion || !heroMotionPreferences.snapshot.visible) return;
  cancelDeferredHeroShader();

  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === 'function') {
    heroShaderIdleHandle = idleWindow.requestIdleCallback(() => {
      heroShaderIdleHandle = null;
      if (!heroMotionPreferences.snapshot.reducedMotion && heroMotionPreferences.snapshot.visible) heroShaderRequested.value = true;
    }, { timeout: 1800 });
    return;
  }

  // Safari and older browsers without requestIdleCallback get a short post-render delay.
  heroShaderTimeout = window.setTimeout(() => {
    heroShaderTimeout = null;
    if (!heroMotionPreferences.snapshot.reducedMotion && heroMotionPreferences.snapshot.visible) heroShaderRequested.value = true;
  }, 900);
}

function syncDeferredHeroShaderPreference(): void {
  if (heroMotionPreferences.snapshot.reducedMotion || !heroMotionPreferences.snapshot.visible) {
    cancelDeferredHeroShader();
    return;
  }
  scheduleHeroShader();
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
  if (springMotionQuery?.matches && storyMotionEnabled.value) {
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
  if (springMotionQuery?.matches && storyMotionEnabled.value) springMotion.to(target);
  else {
    springMotion.pause();
    springFactor.value = target;
  }
});

watch(storyMotionEnabled, (enabled) => {
  if (enabled) {
    handleSpringMotionPreference();
    syncScrollTrigger();
  } else {
    springMotion?.pause();
    disconnectScrollTrigger();
  }
});

function syncScrollTrigger(): void {
  disconnectScrollTrigger();
  if (!storyMotionEnabled.value || !storyMediaQuery?.matches || !storyRunway.value) return;

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
  if (window.scrollY > 0) hasScrolled.value = true;
  else window.addEventListener('scroll', activateLandingMotionAfterScroll, { passive: true });

  if (heroSection.value && typeof IntersectionObserver !== 'undefined') {
    heroVisibilityObserver = new IntersectionObserver((entries) => {
      heroFluidActive.value = Boolean(entries[0]?.isIntersecting);
    }, { threshold: 0.01 });
    heroVisibilityObserver.observe(heroSection.value);
  } else {
    heroFluidActive.value = true;
  }

  heroMotionSubscription = heroMotionPreferences.state$.subscribe(() => syncDeferredHeroShaderPreference());
  syncDeferredHeroShaderPreference();

  if (storyRunway.value && typeof IntersectionObserver !== 'undefined') {
    storyVisibilityObserver = new IntersectionObserver((entries) => {
      storyVisible.value = entries.some((entry) => entry.isIntersecting);
    }, { rootMargin: '140px 0px', threshold: 0 });
    storyVisibilityObserver.observe(storyRunway.value);
  } else {
    storyVisible.value = true;
  }

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
  window.removeEventListener('scroll', activateLandingMotionAfterScroll);
  heroVisibilityObserver?.disconnect();
  heroVisibilityObserver = null;
  storyVisibilityObserver?.disconnect();
  storyVisibilityObserver = null;
  cancelDeferredHeroShader();
  heroMotionSubscription?.unsubscribe();
  heroMotionSubscription = null;
  heroMotionPreferences.destroy();
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
    <section ref="heroSection" class="home-hero" aria-labelledby="home-title">
      <div v-if="!heroShaderRequested" class="home-hero__shader-placeholder" aria-hidden="true" />
      <VisualLabShaderPreview
        v-if="heroShaderRequested"
        class="home-hero__fluid-shader"
        kind="shader-fluid"
        :active="heroFluidActive"
        :preferences="heroMotionPreferences"
      />
      <div class="home-hero__shader-overlay" aria-hidden="true" />

      <div class="home-hero__inner rx-content-rail rx-content-rail--wide">
        <div class="home-hero__copy">
          <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.heroBadge }} <span class="home-eyebrow__slash">{{ copy.staticText.typescriptAndRxjs }}</span></p>
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
            {{ installCopied ? copy.staticText.installCopied : copy.staticText.installClipboardUnavailable }}
          </p>
        </div>

        <LandingTelemetryStage :motion-enabled="hasScrolled" />

        <div class="home-hero__footnotes" :aria-label="copy.staticText.libraryCapabilities">
          <span><i aria-hidden="true" /> {{ copy.staticText.rxjsNative }}</span>
          <span><i aria-hidden="true" /> {{ copy.staticText.sharedFrameCoordination }}</span>
          <span><i aria-hidden="true" /> {{ copy.staticText.domSvgCanvasThreeJs }}</span>
          <span><i aria-hidden="true" /> {{ copy.staticText.treeShakableModules }}</span>
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

    <section ref="storyRunway" class="home-story-runway" :class="{ 'home-story-runway--motion-enabled': storyMotionEnabled }" :aria-label="copy.staticText.howReFluxWorks">
      <div class="home-story-runway__inner rx-content-rail rx-content-rail--wide">
        <div class="home-story-runway__visual-column">
          <div class="home-story-visual-sticky">
            <div class="home-story-visual" :class="`home-story-visual--step-${activeStep}`" :style="{ '--spring-factor': springFactor }">
              <div class="home-story-visual__topline">
                <span>{{ copy.staticText.stageNODE }} {{ activeStageName }}</span>
                <span class="home-story-visual__live"><i aria-hidden="true" />{{ copy.staticText.liveKernel }}</span>
              </div>
              <div class="home-story-visual__canvas" :aria-label="copy.staticText.illustrativeMotionPipelineVisualization">
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
                  <strong>{{ copy.staticText.reFluxKernel }}</strong>
                  <code>value$ → frame$</code>
                </div>
                <span class="home-story-visual__node home-story-visual__node--one">{{ copy.story.visualNodes[activeStep] }}</span>
                <span class="home-story-visual__node home-story-visual__node--two">{{ copy.story.visualFlowNodes[activeStep] }}</span>
                <span class="home-story-visual__coordinate home-story-visual__coordinate--one">{{ copy.staticText.sourceValue }}</span>
                <span class="home-story-visual__coordinate home-story-visual__coordinate--two">{{ copy.staticText.outputRender }}</span>
              </div>
              <div class="home-story-visual__control">
                <label for="home-spring-factor">{{ copy.staticText.springTarget }} <output>{{ springTargetFactor.toFixed(2) }}</output></label>
                <input id="home-spring-factor" v-model.number="springTargetFactor" type="range" min="0.2" max="1" step="0.01" :aria-label="copy.staticText.springTargetPosition" />
              </div>
              <div class="home-story-visual__footer">
                <span>{{ copy.staticText.scrollProgress }}</span>
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
            <LandingLabPreview :kind="getPreviewKind(item.art)" :title="item.title" :motion-enabled="hasScrolled" />
            <div class="home-lab-card__info">
              <div class="home-lab-card__meta"><span>{{ item.index }}</span><span>{{ item.tag }}</span></div>
              <h3><RouterLink class="home-lab-card__title" :to="item.to">{{ item.title }}</RouterLink></h3>
              <p>{{ item.description }}</p>
              <RouterLink class="home-lab-card__inspect" :to="item.to">{{ copy.staticText.inspect }} <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </article>
        </div>
        <p class="home-lab__hint"><span aria-hidden="true">↗</span> {{ copy.visualLab.galleryHint }} <span class="home-lab__hint-line" /></p>
      </div>
    </section>

    <div class="rx-content-rail rx-content-rail--wide home-code-motion-wrap">
      <LandingCodeMotion :motion-enabled="hasScrolled" />
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
          <LandingPrincipleVisual :kind="getPrincipleVisualKind(item.index)" :title="item.title" :motion-enabled="hasScrolled" />
          <span class="home-principle-card__bottom"><span class="home-principle-card__line" /><span>{{ copy.staticText.reFlux }} {{ item.index }}</span></span>
        </article>
      </div>
    </section>

    <section class="home-closing" aria-labelledby="home-closing-title">
      <div class="home-closing__glow" aria-hidden="true" />
      <div class="home-closing__copy rx-content-rail rx-content-rail--reading">
        <p class="home-eyebrow"><span class="home-eyebrow__dot" aria-hidden="true" />{{ copy.closing.eyebrow }}</p>
        <h2 id="home-closing-title">{{ copy.staticText.makeYourInterfaces }} <span>{{ copy.staticText.move }}</span></h2>
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
