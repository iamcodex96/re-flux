<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAppStore } from '../../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.playgroundLayout);
const route = useRoute();

const playgroundGroups = computed(() => [
  {
    key: 'animation',
    title: copy.value.staticText.animation,
    items: [
      { name: 'playground-animation', title: copy.value.staticText.animation, subtitle: copy.value.staticText.timingAndPlayback, icon: 'mdi-play-circle-outline' },
      { name: 'playground-timeline', title: copy.value.staticText.timeline, subtitle: copy.value.staticText.sequenceAndCompose, icon: 'mdi-timeline-clock-outline' },
      { name: 'playground-easings', title: copy.value.staticText.easings, subtitle: copy.value.staticText.interpolationCurves, icon: 'mdi-chart-bell-curve' },
    ],
  },
  {
    key: 'reactive-motion',
    title: copy.value.staticText.reactiveMotion,
    items: [
      { name: 'playground-tween-values', title: copy.value.staticText.tweenValues, subtitle: copy.value.staticText.typedValueStreams, icon: 'mdi-numeric' },
      { name: 'playground-spring', title: copy.value.staticText.springPhysics, subtitle: copy.value.staticText.retargetingAndInertia, icon: 'mdi-spring' },
      { name: 'playground-frames', title: copy.value.staticText.frameCoordinator, subtitle: copy.value.staticText.readWritePhases, icon: 'mdi-timeline-clock-outline' },
      { name: 'playground-gestures', title: copy.value.staticText.gesturePhysics, subtitle: copy.value.staticText.dragAndFollow, icon: 'mdi-gesture-tap' },
      { name: 'playground-streams', title: copy.value.staticText.reactiveStreams, subtitle: copy.value.staticText.retargetAndSmooth, icon: 'mdi-access-point-network' },
      { name: 'playground-adaptive', title: copy.value.staticText.adaptiveTween, subtitle: copy.value.staticText.cadenceAwareMotion, icon: 'mdi-chart-timeline-variant' },
    ],
  },
  {
    key: 'rendering-api',
    title: copy.value.staticText.renderingAPI,
    items: [
      { name: 'playground-canvas', title: copy.value.staticText.canvasAdapter, subtitle: copy.value.staticText.renderAValueStream, icon: 'mdi-canvas' },
      { name: 'playground-api', title: copy.value.staticText.keyframesDOM, subtitle: copy.value.staticText.selectorsAndStaggering, icon: 'mdi-code-braces' },
    ],
  },
]);

const playgroundItems = computed(() => playgroundGroups.value.flatMap((group) => group.items));
const moduleCount = computed(() => playgroundItems.value.length);
const activeModuleIndex = computed(() => {
  const index = playgroundItems.value.findIndex((item) => item.name === route.name);
  return String(index < 0 ? 1 : index + 1).padStart(2, '0');
});
const activePage = computed(() => {
  const pageKey = route.meta.playgroundPage;
  return typeof pageKey === 'string' && Object.prototype.hasOwnProperty.call(copy.value.pages, pageKey)
    ? copy.value.pages[pageKey as keyof typeof copy.value.pages]
    : copy.value.pages.animation;
});
</script>


<template>
  <UiContainer class="playground-layout" max-width="1600">
    <header class="playground-hero">
      <div class="playground-hero__copy">
        <p class="playground-hero__eyebrow">
          <span class="playground-hero__status-dot" aria-hidden="true" />
          {{ copy.staticText.workspaceEyebrow }}
        </p>
        <h1 class="playground-hero__title">
          {{ activePage.title }}<span class="playground-hero__title-mark" aria-hidden="true">.</span>
        </h1>
        <p class="playground-hero__description">{{ activePage.description }}</p>
      </div>
      <aside class="playground-hero__telemetry" :aria-label="copy.staticText.activeModule">
        <div class="playground-hero__telemetry-label">{{ copy.staticText.activeModule }}</div>
        <div class="playground-hero__index-line">
          <strong>{{ activeModuleIndex }}</strong>
          <span aria-hidden="true">/</span>
          <span>{{ String(moduleCount).padStart(2, '0') }}</span>
        </div>
        <div class="playground-hero__telemetry-footer">
          <span class="playground-hero__telemetry-dot" aria-hidden="true" />
          {{ copy.staticText.interactiveWorkspace }}
        </div>
      </aside>
    </header>

    <section class="playground-directory" :aria-label="copy.staticText.playgroundNavigation">
      <div class="playground-directory__heading">
        <div>
          <span class="playground-directory__eyebrow">{{ copy.staticText.moduleIndex }}</span>
          <h2>{{ copy.staticText.exploreModules }}</h2>
        </div>
        <p>{{ copy.staticText.moduleSelectionHint }}</p>
      </div>

      <div class="playground-directory__groups">
        <section
          v-for="(group, groupIndex) in playgroundGroups"
          :key="group.key"
          class="playground-module-group"
          :class="`playground-module-group--${group.key}`"
        >
          <div class="playground-module-group__heading">
            <span class="playground-module-group__number">{{ String(groupIndex + 1).padStart(2, '0') }}</span>
            <h3>{{ group.title }}</h3>
            <span class="playground-module-group__count">{{ String(group.items.length).padStart(2, '0') }}</span>
          </div>
          <nav class="playground-module-group__items" :aria-label="group.title">
            <RouterLink
              v-for="item in group.items"
              :key="item.name"
              :to="{ name: item.name }"
              class="playground-module-link"
              :class="{ 'is-active': route.name === item.name }"
              :aria-current="route.name === item.name ? 'page' : undefined"
            >
              <span class="playground-module-link__icon" aria-hidden="true">
                <UiIcon :icon="item.icon" size="18" />
              </span>
              <span class="playground-module-link__copy">
                <span class="playground-module-link__title">{{ item.title }}</span>
                <span class="playground-module-link__subtitle">{{ item.subtitle }}</span>
              </span>
              <span class="playground-module-link__arrow" aria-hidden="true">↗</span>
            </RouterLink>
          </nav>
        </section>
      </div>
    </section>

    <section class="playground-workspace" :aria-label="copy.staticText.workbench">
      <div class="playground-workspace__heading">
        <div class="playground-workspace__label">
          <span class="playground-workspace__pulse" aria-hidden="true" />
          {{ copy.staticText.workbench }}
        </div>
        <div class="playground-workspace__active">
          <span>{{ activePage.title }}</span>
          <span class="playground-workspace__separator" aria-hidden="true">/</span>
          <span>{{ activeModuleIndex }} / {{ String(moduleCount).padStart(2, '0') }}</span>
        </div>
      </div>
      <div class="playground-layout__content">
        <RouterView />
      </div>
    </section>
  </UiContainer>
</template>

<style scoped lang="scss" src="../../styles/components/playground-layout.scss"></style>
