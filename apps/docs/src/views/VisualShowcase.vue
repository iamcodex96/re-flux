<script setup lang="ts">
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { useAppStore } from '../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualShowcase);

const route = useRoute();
const panels = computed(() => [
  { id: 'svg', name: 'visuals-svg', title: copy.value.staticText.svgAndGeometry, subtitle: copy.value.staticText.pathsMorphingAndFilters, icon: 'mdi-vector-curve' },
  { id: 'shaders', name: 'visuals-shaders', title: copy.value.staticText.webglAndShaders, subtitle: copy.value.staticText.fragmentShaderStudies, icon: 'mdi-shimmer' },
  { id: 'canvas', name: 'visuals-canvas', title: copy.value.staticText.canvasAndData, subtitle: copy.value.staticText.particlesWavesAndSpectra, icon: 'mdi-chart-bell-curve-cumulative' },
  { id: 'interactions', name: 'visuals-interactions', title: copy.value.staticText.domAndInteractions, subtitle: copy.value.staticText.countersDragAndLayout, icon: 'mdi-gesture-tap' },
  { id: 'scroll', name: 'visuals-scroll', title: copy.value.staticText.scrollMotion, subtitle: copy.value.staticText.triggersAndTimelineScrubbing, icon: 'mdi-arrow-down-bold-box-outline' },
] as const);
const activePanel = computed(() => panels.value.find((panel) => panel.name === route.name) ?? panels.value[0]!);
const pageTitle = computed(() => activePanel.value.title);
const pageDescription = computed(() => activePanel.value.subtitle);
</script>

<template>
  <RouterView v-if="route.name === 'visuals-home'" />
  <UiContainer v-else class="visual-lab py-8 py-md-12" max-width="1240">
    <PageHeader
      :eyebrow="copy.staticText.playgroundVisualLab"
      :title="copy.staticText.beyondMovement"
      :description="copy.staticText.exploreHowOneReactiveEngineCanDriveGeometryPixelsTypographyInteractionsAndScrollLinkedScenesChooseACategoryToLoadOnlyTheDemonstrationsYouWantToInspect"
    />

    <div class="visual-lab__intro mb-8">
      <div>
        <div class="text-overline text-primary mb-2">{{ copy.staticText.oneReactiveEngineManyKindsOfOutput }}</div>
        <h2 class="text-h4 font-weight-bold mb-3">{{ copy.staticText.motionIsOnlyTheBeginning }}</h2>
        <p class="text-body-1 text-medium-emphasis mb-0">{{ copy.staticText.everyCategoryOwnsItsAnimationLifecycleChangingTheRouteTearsDownItsSubscriptionsObserversAndBrowserResourcesBeforeMountingTheNextCollectionOfScenes }}</p>
      </div>
      <div class="visual-lab__stats">
        <div><strong>{{ copy.staticText.svg }}</strong><span>{{ copy.staticText.morphLiquidFilters }}</span></div>
        <div><strong>{{ copy.staticText.canvas }}</strong><span>{{ copy.staticText.particles3dGeometry }}</span></div>
        <div><strong>{{ copy.staticText.dom }}</strong><span>{{ copy.staticText.gesturesLayout }}</span></div>
      </div>
    </div>

    <UiRow class="visual-lab__layout">
      <UiCol cols="12" md="3" lg="3">
        <UiCard class="visual-lab-nav" variant="outlined">
          <UiCardTitle class="px-4 pt-4 pb-2 text-subtitle-1 font-weight-bold">{{ copy.staticText.visualLab }}</UiCardTitle>
          <UiCardSubtitle class="px-4 pb-3">{{ copy.staticText.chooseASceneGroup }}</UiCardSubtitle>
          <UiDivider />
          <UiList nav density="comfortable" class="pa-2" :aria-label="copy.staticText.visualLabCategories">
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
            <UiIcon size="14" class="mr-1" color="success">{{ copy.staticText.mdiCircle }}</UiIcon>
            {{ copy.staticText.showingCategoryOnly.replace('{category}', activePanel.title.toLowerCase()) }}
          </div>
        </UiCard>
      </UiCol>

      <UiCol cols="12" md="9" lg="9">
        <div class="visual-lab__panel-heading mb-4">
          <div>
            <div class="text-overline text-primary">{{ copy.staticText.selectedCategory }}</div>
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
          <div class="text-overline mb-2">{{ copy.staticText.thePointOfReFlux }}</div>
          <h2 class="text-h5 font-weight-bold mb-2">{{ copy.staticText.oneReactiveFoundationManyRenderingPossibilities }}</h2>
          <p class="text-body-2 text-medium-emphasis mb-0">{{ copy.staticText.gesturesScrollTimelinesAndPhysicsCanFeedTheSameDomSvgCanvasOrThreeJsLayer }}</p>
        </div>
        <UiButton color="primary" variant="flat" to="/docs" append-icon="mdi-arrow-right">{{ copy.staticText.exploreTheApi }}</UiButton>
      </UiCardText>
    </UiCard>
  </UiContainer>
</template>
