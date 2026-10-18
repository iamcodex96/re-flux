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
<section id="render-adapters" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="secondary" variant="tonal" class="text-caption font-weight-bold">18</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['render-adapters'].title }}</h2><p>{{ copy.section['render-adapters'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['render-adapters'].description }}</p>
    <DocsVisualExample variant="render-adapters" :code="snippets.adapters" :code-title="ui.optionalAdaptersCodeTitle" />
    <UiAlert type="info" variant="tonal" density="comfortable" class="mt-4">{{ ui.adapterNotePrefix }} <code>clearOnUnsubscribe</code> {{ ui.adapterNoteSuffix }}</UiAlert>
  </section>

<section id="keyframes-dom" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">19</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['keyframes-dom'].title }}</h2><p>{{ copy.section['keyframes-dom'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['keyframes-dom'].description }}</p>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ ui.domIntroPrefix }} <code>@re-code/flux/dom</code> {{ ui.domIntroMiddle }} <code>NodeList</code> {{ ui.domIntroSuffix }}</p>
    <DocsVisualExample variant="keyframes-dom" :code="snippets.keyframesDom" :code-title="ui.keyframesDomCodeTitle" />
    <h3 class="text-subtitle-1 font-weight-bold mt-5 mb-2">{{ ui.domAnimationBehavior }}</h3>
    <UiTable density="compact" class="docs-api-table mb-4">
      <thead><tr><th scope="col">{{ ui.optionBehavior }}</th><th scope="col">{{ ui.descriptionLabel }}</th></tr></thead>
      <tbody>
        <tr><td><code>properties</code></td><td>{{ ui.keyframePropertyTitle }}</td></tr>
        <tr><td>{{ ui.propertyOptionLabel }} <code>duration</code>, <code>delay</code>, <code>easing</code>, <code>repeat</code>, <code>yoyo</code></td><td>{{ ui.propertyTimingDescription }}</td></tr>
        <tr><td>{{ ui.keyframeOptionLabel }} <code>offset</code> and <code>easing</code></td><td>{{ ui.keyframeOffsetDescription }}</td></tr>
        <tr><td><code>stagger</code></td><td>{{ ui.staggerDescription }}</td></tr>
        <tr><td><code>dispose()</code></td><td>{{ ui.disposeDescription }}</td></tr>
        <tr><td>{{ ui.cssInterpolationLabel }}</td><td>{{ ui.cssInterpolationDescription }}</td></tr>
      </tbody>
    </UiTable>
    <UiAlert type="info" variant="tonal" density="comfortable">{{ ui.headlessIntroPrefix }} <code>keyframes</code> {{ ui.headlessIntroMiddle }} <code>@re-code/flux</code> {{ ui.headlessIntroAnd }} <code>animate</code> {{ ui.headlessIntroOnly }}</UiAlert>
    <p class="text-body-2 text-medium-emphasis mt-3 mb-0">{{ ui.tryKeyframesPrefix }} <RouterLink to="/api">{{ ui.tryKeyframesLink }}</RouterLink> {{ ui.tryKeyframesSuffix }}</p>
  </section>

<section id="svg-path-morph" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="secondary" variant="tonal" class="text-caption font-weight-bold">20</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ ui.svgMorphTitle }}</h2><p>{{ ui.svgMorphCodeTitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ ui.svgMorphDescription }}</p>
    <UiCard variant="outlined" rounded="lg" class="mt-4">
      <UiCardTitle class="text-subtitle-2">{{ ui.svgMorphCodeTitle }}</UiCardTitle>
      <UiCardText class="pt-0">
        <pre class="svg-morph-code"><code>{{ snippets.svgMorph }}</code></pre>
      </UiCardText>
    </UiCard>
  </section>
</template>

<style scoped lang="scss" src="../../styles/components/docs-rendering-sections.scss"></style>
