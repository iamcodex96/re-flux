<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';

const route = useRoute();
const panels = [
  { id: 'svg', name: 'visuals-svg', title: 'SVG & geometry', subtitle: 'Paths, morphing and filters', icon: 'mdi-vector-curve' },
  { id: 'shaders', name: 'visuals-shaders', title: 'WebGL & shaders', subtitle: 'Fragment shader studies', icon: 'mdi-shimmer' },
  { id: 'canvas', name: 'visuals-canvas', title: 'Canvas & data', subtitle: 'Particles, waves and spectra', icon: 'mdi-chart-bell-curve-cumulative' },
  { id: 'interactions', name: 'visuals-interactions', title: 'DOM & interactions', subtitle: 'Counters, drag and layout', icon: 'mdi-gesture-tap' },
  { id: 'scroll', name: 'visuals-scroll', title: 'Scroll motion', subtitle: 'Triggers and timeline scrubbing', icon: 'mdi-arrow-down-bold-box-outline' },
] as const;
const activePanel = computed(() => panels.find((panel) => panel.name === route.name) ?? panels[0]);
const pageTitle = computed(() => String(route.meta.visualTitle ?? activePanel.value.title));
const pageDescription = computed(() => String(route.meta.visualDescription ?? activePanel.value.subtitle));
</script>

<template>
  <RouterView v-if="route.name === 'visuals-home'" />
  <UiContainer v-else class="visual-lab py-8 py-md-12" max-width="1240">
    <PageHeader
      eyebrow="Playground / Visual Lab"
      title="Beyond movement"
      description="Explore how one reactive engine can drive geometry, pixels, typography, interactions and scroll-linked scenes. Choose a category to load only the demonstrations you want to inspect."
    />

    <div class="visual-lab__intro mb-8">
      <div>
        <div class="text-overline text-primary mb-2">One reactive engine · many kinds of output</div>
        <h2 class="text-h4 font-weight-bold mb-3">Motion is only the beginning.</h2>
        <p class="text-body-1 text-medium-emphasis mb-0">Every category owns its animation lifecycle. Changing the route tears down its subscriptions, observers and browser resources before mounting the next collection of scenes.</p>
      </div>
      <div class="visual-lab__stats">
        <div><strong>SVG</strong><span>morph + liquid filters</span></div>
        <div><strong>Canvas</strong><span>particles + 3D geometry</span></div>
        <div><strong>DOM</strong><span>gestures + layout</span></div>
      </div>
    </div>

    <UiRow class="visual-lab__layout">
      <UiCol cols="12" md="3" lg="3">
        <UiCard class="visual-lab-nav" variant="outlined">
          <UiCardTitle class="px-4 pt-4 pb-2 text-subtitle-1 font-weight-bold">Visual Lab</UiCardTitle>
          <UiCardSubtitle class="px-4 pb-3">Choose a scene group</UiCardSubtitle>
          <UiDivider />
          <UiList nav density="comfortable" class="pa-2" aria-label="Visual Lab categories">
            <UiListItem
              v-for="panel in panels"
              :key="panel.id"
              :to="{ name: panel.name }"
              :active="route.name === panel.name"
              :prepend-icon="panel.icon"
              :title="panel.title"
              :subtitle="panel.subtitle"
              rounded="lg"
              color="primary"
            />
          </UiList>
          <UiDivider />
          <div class="pa-4 text-caption text-medium-emphasis">
            <UiIcon size="14" class="mr-1" color="success">mdi-circle</UiIcon>
            Showing {{ activePanel.title.toLowerCase() }} only
          </div>
        </UiCard>
      </UiCol>

      <UiCol cols="12" md="9" lg="9">
        <div class="visual-lab__panel-heading mb-4">
          <div>
            <div class="text-overline text-primary">Selected category</div>
            <h2 class="text-h5 font-weight-bold">{{ pageTitle }}</h2>
            <p class="text-body-2 text-medium-emphasis mb-0">{{ pageDescription }}</p>
          </div>
          <UiChip size="small" variant="tonal" color="primary">{{ panels.findIndex((panel) => panel.name === route.name) + 1 }} / {{ panels.length }}</UiChip>
        </div>
        <RouterView />
      </UiCol>
    </UiRow>

    <UiCard variant="tonal" color="primary" class="visual-footer mt-8">
      <UiCardText class="pa-5 pa-md-7 d-flex flex-column flex-md-row align-start align-md-center justify-space-between ga-5">
        <div>
          <div class="text-overline mb-2">The point of re;Flux</div>
          <h2 class="text-h5 font-weight-bold mb-2">One reactive foundation. Many rendering possibilities.</h2>
          <p class="text-body-2 text-medium-emphasis mb-0">Gestures, scroll, timelines and physics can feed the same DOM, SVG, Canvas or Three.js layer.</p>
        </div>
        <UiButton color="primary" variant="flat" to="/docs" append-icon="mdi-arrow-right">Explore the API</UiButton>
      </UiCardText>
    </UiCard>
  </UiContainer>
</template>
