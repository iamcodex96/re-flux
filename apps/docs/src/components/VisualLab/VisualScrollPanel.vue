<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { animate, bindScrollTimeline, createScrollTrigger, scrollProgress$, type ScrollTriggerController } from '@lib/dom';
import type { Subscription } from 'rxjs';

const scrollViewport = ref<HTMLElement | null>(null);
const scrollTarget = ref<HTMLElement | null>(null);
const scrollScrubShape = ref<HTMLElement | null>(null);
const scrollProgress = ref(0);
const scrollTriggerEvent = ref('Scroll inside the preview');
const scrollTriggerActive = ref(false);
let progressSubscription: Subscription | null = null;
let scrollTriggerController: ScrollTriggerController | null = null;
let scrollScrubAnimation: ReturnType<typeof animate> | null = null;
let scrollTimelineBinding: Subscription | null = null;

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
  <UiRow>
    <UiCol cols="12">
      <UiCard class="visual-card visual-card--scroll" variant="outlined">
        <UiCardText class="pa-5 pa-md-6">
          <div class="visual-card__heading">
            <UiChip size="small" variant="tonal" color="primary">DOM / Scroll</UiChip>
            <span class="text-caption text-medium-emphasis">Scroll trigger + scrubbed timeline</span>
          </div>
          <h3 class="text-h6 font-weight-bold mt-4 mb-2">Scroll is another stream.</h3>
          <p class="text-body-2 text-medium-emphasis">This scene has its own scroll viewport, so the trigger works even when the overall docs page is short. Scroll inside the preview to scrub the shape, track normalized progress and inspect directional trigger events.</p>
          <div class="scroll-demo__legend d-flex flex-wrap justify-space-between align-center ga-3 mb-3">
            <span class="text-caption text-medium-emphasis">Scroll inside this panel ↓</span>
            <span class="text-caption text-medium-emphasis"><code>createScrollTrigger({ root })</code> · {{ scrollTriggerEvent }} · {{ scrollTriggerActive ? 'active' : 'inactive' }}</span>
          </div>
          <div ref="scrollViewport" class="scroll-demo__viewport" tabindex="0" role="region" aria-label="Scroll-driven animation preview. Scroll inside this region to control the animation.">
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
          <div class="d-flex flex-wrap justify-space-between align-center ga-2 mt-4">
            <span class="text-caption text-medium-emphasis">bindScrollTimeline() · {{ Math.round(scrollProgress * 100) }}% complete</span>
            <span class="text-caption text-medium-emphasis">The outer page does not need to scroll.</span>
          </div>
        </UiCardText>
      </UiCard>
    </UiCol>
  </UiRow>
</template>
