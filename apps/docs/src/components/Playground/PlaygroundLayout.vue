<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import PageHeader from '../PageHeader.vue';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.playgroundLayout);
const route = useRoute();
const playgroundGroups = [
  {
    title: copy.value.staticText.animation,
    items: [
      { name: 'playground-animation', title: copy.value.staticText.animation, subtitle: copy.value.staticText.timingAndPlayback, icon: 'mdi-play-circle-outline' },
      { name: 'playground-timeline', title: copy.value.staticText.timeline, subtitle: copy.value.staticText.sequenceAndCompose, icon: 'mdi-timeline-clock-outline' },
      { name: 'playground-easings', title: copy.value.staticText.easings, subtitle: copy.value.staticText.interpolationCurves, icon: 'mdi-chart-bell-curve' },
    ],
  },
  {
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
    title: copy.value.staticText.renderingAPI,
    items: [
      { name: 'playground-canvas', title: copy.value.staticText.canvasAdapter, subtitle: copy.value.staticText.renderAValueStream, icon: 'mdi-canvas' },
      { name: 'playground-api', title: copy.value.staticText.keyframesDOM, subtitle: copy.value.staticText.selectorsAndStaggering, icon: 'mdi-code-braces' },
    ],
  },
] as const;
type PlaygroundPageKey = keyof typeof appStore.app.view.playgroundLayout.pages;

function isPlaygroundPageKey(key: string): key is PlaygroundPageKey {
  return Object.prototype.hasOwnProperty.call(copy.value.pages, key);
}

const activePage = computed(() => {
  const pageKey = route.meta.playgroundPage;
  return typeof pageKey === 'string' && isPlaygroundPageKey(pageKey)
    ? copy.value.pages[pageKey]
    : copy.value.pages.animation;
});
</script>

<template>
  <UiContainer class="playground-layout py-8 py-md-12" max-width="1240">
    <PageHeader :eyebrow="copy.staticText.playground" :title="activePage.title" :description="activePage.description" />

    <UiRow align="start" class="playground-layout__body">
      <UiCol cols="12" md="3" lg="3">
        <UiCard class="playground-nav" variant="outlined">
          <UiCardTitle class="px-4 pt-4 pb-2 text-subtitle-1 font-weight-bold">{{ copy.staticText.playground }}</UiCardTitle>
          <UiCardSubtitle class="px-4 pb-3">{{ copy.staticText.chooseAnExperiment }}</UiCardSubtitle>
          <UiDivider />
          <UiList nav density="comfortable" class="pa-2" :aria-label="copy.staticText.playgroundNavigation">
            <template v-for="group in playgroundGroups" :key="group.title">
              <UiListSubheader class="playground-nav__group-label">{{ group.title }}</UiListSubheader>
              <UiListItem
                v-for="item in group.items"
                :key="item.name"
                :to="{ name: item.name }"
                :active="route.name === item.name"
                :prepend-icon="item.icon"
                :title="item.title"
                :subtitle="item.subtitle"
                rounded="lg"
                color="primary"
              />
            </template>
          </UiList>
          <UiDivider />
          <div class="pa-4 text-caption text-medium-emphasis">{{ copy.staticText.onlyTheSelectedPlaygroundIsMountedLeavinga7a1cc }}</div>
        </UiCard>
      </UiCol>

      <UiCol cols="12" md="9" lg="9" class="playground-layout__content">
        <RouterView />
      </UiCol>
    </UiRow>
  </UiContainer>
</template>

<style scoped lang="scss" src="../../styles/components/playground-layout.scss"></style>
