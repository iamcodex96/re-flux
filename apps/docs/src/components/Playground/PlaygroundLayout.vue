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
  <v-container class="playground-layout py-8 py-md-12" max-width="1240">
    <PageHeader eyebrow="Playground" :title="pageTitle" :description="pageDescription" />

    <v-row align="start" class="playground-layout__body">
      <v-col cols="12" md="3" lg="3">
        <v-card class="playground-nav" variant="outlined">
          <v-card-title class="px-4 pt-4 pb-2 text-subtitle-1 font-weight-bold">Playground</v-card-title>
          <v-card-subtitle class="px-4 pb-3">Choose an experiment</v-card-subtitle>
          <v-divider />
          <v-list nav density="comfortable" class="pa-2" aria-label="Playground navigation">
            <template v-for="group in playgroundGroups" :key="group.title">
              <v-list-subheader class="playground-nav__group-label">{{ group.title }}</v-list-subheader>
              <v-list-item
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
          </v-list>
          <v-divider />
          <div class="pa-4 text-caption text-medium-emphasis">Only the selected playground is mounted. Leaving a page releases its active streams, observers and animation subscriptions.</div>
        </v-card>
      </v-col>

      <v-col cols="12" md="9" lg="9" class="playground-layout__content">
        <RouterView />
      </v-col>
    </v-row>
  </v-container>
</template>

<style scoped>
.playground-nav { position: sticky; top: 86px; max-height: calc(100vh - 108px); overflow: auto; border-radius: 12px; }
.playground-nav .v-list-item { min-height: 54px; margin-bottom: 3px; }
.playground-nav :deep(.v-list-item-title) { font-size: .86rem; font-weight: 650; }
.playground-nav :deep(.v-list-item-subtitle) { font-size: .72rem; line-height: 1.4; opacity: .72; }
.playground-nav :deep(.playground-nav__group-label) { min-height: 32px; padding-inline: 12px; font-size: .68rem; font-weight: 750; letter-spacing: .09em; text-transform: uppercase; }
.playground-layout__content { min-width: 0; }
@media (max-width: 960px) {
  .playground-nav { position: static; max-height: none; }
  .playground-nav .v-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .playground-nav :deep(.playground-nav__group-label) { grid-column: 1 / -1; }
  .playground-nav .v-list-item { min-width: 0; }
}
@media (max-width: 600px) {
  .playground-nav .v-list { grid-template-columns: 1fr; }
}
</style>
