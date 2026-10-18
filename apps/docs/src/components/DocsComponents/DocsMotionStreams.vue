<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
import DocsVisualExample from './DocsVisualExample.vue';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const snippets = computed(() => copy.value.snippets);
</script>

<template>
<section id="retarget-motion" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">15</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['retarget-motion'].title }}</h2><p>{{ copy.section['retarget-motion'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['retarget-motion'].description }}</p>
    <DocsVisualExample variant="retarget-motion" :code="snippets.retargetMotion" :code-title="ui.retargetCodeTitle" />
    <UiAlert type="info" variant="tonal" density="comfortable" class="mt-4">{{ ui.retargetNumericText }}</UiAlert>
  </section>

<section id="smooth-stream" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">16</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['smooth-stream'].title }}</h2><p>{{ copy.section['smooth-stream'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['smooth-stream'].description }}</p>
    <DocsVisualExample variant="smooth-stream" :code="snippets.smoothStream" :code-title="ui.smoothStreamCodeTitle" />
    <UiAlert type="warning" variant="tonal" density="comfortable" class="mt-4">{{ ui.smoothStreamTimestampPrefix }} <code>performance.now()</code>. {{ ui.timestampClientConversion }}</UiAlert>
    <p class="text-body-2 text-medium-emphasis mt-3 mb-0">{{ ui.streamPlaygroundPrefix }} <RouterLink to="/playground/streams">{{ ui.streamPlaygroundLink }}</RouterLink> {{ ui.streamPlaygroundSuffix }}</p>
  </section>

<section id="adaptive-tween" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">17</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['adaptive-tween'].title }}</h2><p>{{ copy.section['adaptive-tween'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['adaptive-tween'].description }}</p>
    <DocsVisualExample variant="adaptive-tween" :code="snippets.adaptiveTween" :code-title="ui.adaptiveTweenCodeTitle" />
    <h3 class="text-subtitle-1 font-weight-bold mt-5 mb-2">{{ ui.adaptiveOptions }}</h3>
    <UiTable density="compact" class="docs-api-table mb-4">
      <thead><tr><th scope="col">{{ ui.optionLabel }}</th><th scope="col">{{ ui.defaultLabel }}</th><th scope="col">{{ ui.descriptionLabel }}</th></tr></thead>
      <tbody>
        <tr><td><code>minDuration</code></td><td><code>20</code></td><td>{{ ui.minDurationDescription }}</td></tr>
        <tr><td><code>maxDuration</code></td><td><code>240</code></td><td>{{ ui.maxDurationDescription }}</td></tr>
        <tr><td><code>durationFactor</code></td><td><code>1.5</code></td><td>{{ ui.durationFactorDescription }}</td></tr>
        <tr><td><code>cadenceSmoothing</code></td><td><code>0.25</code></td><td>{{ ui.cadenceSmoothingFullDesc }}</td></tr>
        <tr><td><code>initialCadence</code></td><td><code>33.333</code></td><td>{{ ui.initialCadenceDescription }}</td></tr>
        <tr><td><code>easing</code></td><td><code>linear</code></td><td>{{ ui.easingOptionDescription }}</td></tr>
        <tr><td><code>staleAfter</code></td><td><code>1000</code></td><td>{{ ui.staleAfterDescription }}</td></tr>
        <tr><td><code>interpolate</code></td><td>{{ ui.required }}</td><td>{{ ui.interpolateOptionDescription }}</td></tr>
      </tbody>
    </UiTable>
    <p class="text-body-2 text-medium-emphasis mb-0">{{ ui.adaptiveOutputPrefix }} <RouterLink to="/playground/streams">{{ ui.adaptivePlaygroundLink }}</RouterLink> {{ ui.adaptiveOutputSuffix }}</p>
  </section>
  <UiCard variant="outlined" rounded="lg" class="mt-7 mb-4">
    <UiCardText class="d-flex flex-wrap align-center ga-4 pa-4">
      <UiAvatar color="secondary" variant="tonal" size="44"><UiIcon icon="mdi-waveform" size="24" /></UiAvatar>
      <div class="flex-grow-1 docs-prompt-copy"><div class="text-overline text-secondary">{{ ui.newPlayground }}</div><h3 class="text-subtitle-1 font-weight-bold ma-0">{{ ui.valuesPhysics }}</h3><p class="text-body-2 text-medium-emphasis mt-1 mb-0">{{ ui.motionCardPrefix }} <code>Tween&lt;T&gt;</code>, {{ ui.motionCardSuffix }}</p></div>
      <UiButton to="/playground/streams" color="primary" variant="flat" append-icon="mdi-arrow-right">{{ ui.exploreApi }}</UiButton>
    </UiCardText>
  </UiCard>
</template>
