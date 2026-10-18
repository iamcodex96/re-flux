<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import PageHeader from '../PageHeader.vue';

const route = useRoute();
const playgroundGroups = [
  {
    title: 'Animation',
    items: [
      { name: 'playground-animation', title: 'Animation', subtitle: 'Timing and playback', icon: 'mdi-play-circle-outline' },
      { name: 'playground-timeline', title: 'Timeline', subtitle: 'Sequence and compose', icon: 'mdi-timeline-clock-outline' },
      { name: 'playground-easings', title: 'Easings', subtitle: 'Interpolation curves', icon: 'mdi-chart-bell-curve' },
    ],
  },
  {
    title: 'Reactive motion',
    items: [
      { name: 'playground-tween-values', title: 'Tween values', subtitle: 'Typed value streams', icon: 'mdi-numeric' },
      { name: 'playground-spring', title: 'Spring physics', subtitle: 'Retargeting and inertia', icon: 'mdi-spring' },
      { name: 'playground-frames', title: 'Frame coordinator', subtitle: 'Read/write phases', icon: 'mdi-timeline-clock-outline' },
      { name: 'playground-gestures', title: 'Gesture physics', subtitle: 'Drag and follow', icon: 'mdi-gesture-tap' },
      { name: 'playground-streams', title: 'Reactive streams', subtitle: 'Retarget and smooth', icon: 'mdi-access-point-network' },
      { name: 'playground-adaptive', title: 'Adaptive tween', subtitle: 'Cadence-aware motion', icon: 'mdi-chart-timeline-variant' },
    ],
  },
  {
    title: 'Rendering & API',
    items: [
      { name: 'playground-canvas', title: 'Canvas adapter', subtitle: 'Render a value stream', icon: 'mdi-canvas' },
      { name: 'playground-api', title: 'Keyframes & DOM', subtitle: 'Selectors and staggering', icon: 'mdi-code-braces' },
    ],
  },
] as const;
const pageTitle = computed(() => String(route.meta.playgroundTitle ?? 'Interactive playgrounds'));
const pageDescription = computed(() => String(route.meta.playgroundDescription ?? 'Explore re;Flux APIs in isolated, interactive examples.'));
</script>

<template>
  <UiContainer class="playground-layout py-8 py-md-12" max-width="1240">
    <PageHeader eyebrow="Playground" :title="pageTitle" :description="pageDescription" />

    <UiRow align="start" class="playground-layout__body">
      <UiCol cols="12" md="3" lg="3">
        <UiCard class="playground-nav" variant="outlined">
          <UiCardTitle class="px-4 pt-4 pb-2 text-subtitle-1 font-weight-bold">Playground</UiCardTitle>
          <UiCardSubtitle class="px-4 pb-3">Choose an experiment</UiCardSubtitle>
          <UiDivider />
          <UiList nav density="comfortable" class="pa-2" aria-label="Playground navigation">
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
          <div class="pa-4 text-caption text-medium-emphasis">Only the selected playground is mounted. Leaving a page releases its active streams, observers and animation subscriptions.</div>
        </UiCard>
      </UiCol>

      <UiCol cols="12" md="9" lg="9" class="playground-layout__content">
        <RouterView />
      </UiCol>
    </UiRow>
  </UiContainer>
</template>

<style scoped lang="scss" src="../../styles/components/playground-layout.scss"></style>
