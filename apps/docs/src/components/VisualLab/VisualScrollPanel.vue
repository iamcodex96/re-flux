<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { animate, bindScrollTimeline, createScrollTrigger, scrollProgress$, type ScrollTriggerController } from '@lib/dom';
import type { Subscription } from 'rxjs';
import VisualLabSceneExplorer from './VisualLabSceneExplorer.vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';

const scrollViewport = ref<HTMLElement | null>(null);
const scrollTarget = ref<HTMLElement | null>(null);
const scrollScrubShape = ref<HTMLElement | null>(null);
const scrollProgress = ref(0);
const scrollTriggerEvent = ref('Scroll inside the preview');
const scrollTriggerActive = ref(false);
const activeScene = ref('scroll-scrub');
let progressSubscription: Subscription | null = null;
let scrollTriggerController: ScrollTriggerController | null = null;
let scrollScrubAnimation: ReturnType<typeof animate> | null = null;
let scrollTimelineBinding: Subscription | null = null;

const scenes: readonly VisualLabSceneDefinition[] = [{
  id: 'scroll-scrub',
  category: 'SCROLL / DOM',
  title: 'Scroll is another stream.',
  description: 'This scene has its own scroll viewport, so the trigger works even when the overall docs page is short. Scroll inside the preview to scrub the shape, track normalized progress and inspect directional trigger events.',
  stageLabel: 'INTERACTIVE SCROLL STAGE',
  fileLabel: 'scroll-timeline.ts',
  stageTag: 'PROGRESS + TRIGGER LIFECYCLE',
  ariaLabel: 'Scroll-driven animation preview with a normalized progress meter',
  snippet: `import { animate, bindScrollTimeline, createScrollTrigger, scrollProgress$ } from '@re-code/flux/dom';\n\nconst progress$ = scrollProgress$(target, { root });\nconst trigger = createScrollTrigger(target, {\n  root, start: 'top bottom', end: 'bottom top',\n  onEnter: () => console.log('entered'),\n  onLeave: () => console.log('left'),\n});\nconst scrub = animate(target, {\n  duration: 1000,\n  properties: { transform: ['translateX(-68px) scale(.52)', 'translateX(0) scale(1)'] },\n});\nconst binding = bindScrollTimeline(target, scrub, {\n  root, start: 0.05, end: 0.95, easing: 'easeInOutSine',\n});\n\nreturn () => {\n  binding.unsubscribe();\n  trigger.destroy();\n  scrub.dispose();\n};`,
}];

onMounted(async () => {
  await nextTick();
  const root = scrollViewport.value;
  const target = scrollTarget.value;
  if (!root || !target) return;

  progressSubscription = scrollProgress$(target, { root }).subscribe((value) => {
    scrollProgress.value = value;
  });

  scrollTriggerController = createScrollTrigger(target, {
    root,
    start: 'top bottom',
    end: 'bottom top',
    onEnter: () => { scrollTriggerEvent.value = 'onEnter'; },
    onLeave: () => { scrollTriggerEvent.value = 'onLeave'; },
    onEnterBack: () => { scrollTriggerEvent.value = 'onEnterBack'; },
    onLeaveBack: () => { scrollTriggerEvent.value = 'onLeaveBack'; },
    onUpdate: (event) => { scrollTriggerActive.value = event.isActive; },
  });

  if (scrollScrubShape.value) {
    scrollScrubAnimation = animate(scrollScrubShape.value, {
      duration: 1000,
      properties: {
        transform: ['translateX(-68px) rotate(-70deg) scale(0.52)', 'translateX(0px) rotate(0deg) scale(1)'],
        opacity: [0.35, 1],
        borderRadius: ['28% 72% 60% 40% / 42% 35% 65% 58%', '50% 50% 50% 50% / 50% 50% 50% 50%'],
      },
    });
    scrollTimelineBinding = bindScrollTimeline(target, scrollScrubAnimation, {
      root,
      start: 0.05,
      end: 0.95,
      easing: 'easeInOutSine',
    });
  }
});

onBeforeUnmount(() => {
  progressSubscription?.unsubscribe();
  progressSubscription = null;
  scrollTriggerController?.destroy();
  scrollTriggerController = null;
  scrollTimelineBinding?.unsubscribe();
  scrollTimelineBinding = null;
  scrollScrubAnimation?.dispose();
  scrollScrubAnimation = null;
});
</script>

<template>
  <VisualLabSceneExplorer
    v-model="activeScene"
    id-prefix="scroll-scene"
    eyebrow="SCROLL / DOM"
    heading="Progress can drive the whole scene"
    description="A local scroll viewport makes progress observable and timelines scrub-able without depending on the page scroll position. Scroll inside the preview to inspect progress, direction and trigger state."
    :scenes="scenes"
    :show-selector="false"
    code-note="The demo keeps its scroll root, progress subscription, trigger controller and timeline binding local to this scene, then releases them together on teardown."
  >
    <template #stage>
      <div class="visual-scroll-explorer">
        <div class="visual-scroll-explorer__legend">
          <span>Scroll inside this preview ↓</span>
          <code>{{ scrollTriggerEvent }} · {{ scrollTriggerActive ? 'active' : 'inactive' }}</code>
        </div>
        <div ref="scrollViewport" class="scroll-demo__viewport visual-scroll-explorer__viewport" tabindex="0" role="region" aria-label="Scroll-driven animation preview. Scroll inside this region to control the animation.">
          <div class="scroll-demo__runway scroll-demo__runway--top">
            <span class="text-overline">START / SCROLL DOWN</span>
            <span class="scroll-demo__hint">The target enters the viewport below</span>
          </div>
          <div ref="scrollTarget" class="scroll-stage">
            <div class="scroll-stage__background" aria-hidden="true"></div>
            <div ref="scrollScrubShape" class="scroll-stage__scrub-shape" aria-hidden="true"><UiIcon size="28">mdi-asterisk</UiIcon></div>
            <div class="scroll-stage__content">
              <div><span class="text-overline">scrollProgress$</span><div class="scroll-stage__value">{{ Math.round(scrollProgress * 100) }}%</div></div>
              <div class="scroll-stage__track"><div class="scroll-stage__fill" :style="{ transform: `scaleX(${scrollProgress})` }"></div></div>
              <div class="scroll-stage__ring" :style="{ transform: `rotate(${scrollProgress * 360}deg) scale(${0.75 + scrollProgress * 0.25})` }"><UiIcon size="28">mdi-arrow-down</UiIcon></div>
            </div>
          </div>
          <div class="scroll-demo__runway scroll-demo__runway--bottom">
            <span class="text-overline">END / SCROLL BACK UP</span>
            <span class="scroll-demo__hint">Reverse direction to trigger onEnterBack / onLeaveBack</span>
          </div>
        </div>
        <div class="visual-scroll-explorer__footer">
          <span>bindScrollTimeline()</span>
          <strong>{{ Math.round(scrollProgress * 100) }}% complete</strong>
        </div>
      </div>
    </template>
  </VisualLabSceneExplorer>
</template>
