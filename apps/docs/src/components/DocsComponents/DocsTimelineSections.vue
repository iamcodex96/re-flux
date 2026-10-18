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
  <section id="timeline" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">05</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.timeline.title }}</h2><p>{{ copy.section.timeline.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section.timeline.description }}</p>
    <DocsVisualExample variant="timeline" :code="snippets.timeline" :code-title="ui.timelineCodeTitle" />
    <p class="text-body-2 text-medium-emphasis mt-3">{{ ui.timelinePromptPrefix }} <RouterLink to="/timeline">{{ ui.openTimelinePlayground }}</RouterLink></p>
  </section>

  <section id="offsets" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">06</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.offsets.title }}</h2><p>{{ copy.section.offsets.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-3">{{ copy.section.offsets.description }}</p>
    <UiTable density="comfortable" class="docs-api-table my-4">
      <thead><tr><th scope="col">{{ ui.offsetValueLabel }}</th><th scope="col">{{ ui.meaningLabel }}</th><th scope="col">{{ ui.exampleLabel }}</th></tr></thead>
      <tbody><tr v-for="entry in ui.offsetTimingRows" :key="entry.offset"><td><code>{{ entry.offset }}</code></td><td>{{ entry.meaning }}</td><td><code>{{ entry.example }}</code></td></tr></tbody>
    </UiTable>
    <DocsVisualExample variant="offsets" :code="snippets.offsets" :code-title="ui.offsetsCodeTitle" />
  </section>

  <section id="offset-explorer" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">11</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['offset-explorer'].title }}</h2><p>{{ copy.section['offset-explorer'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['offset-explorer'].description }}</p>
    <DocsVisualExample variant="offsets" :code="snippets.offsets" :code-title="ui.offsetsCodeTitle" />
  </section>

  <section id="nested-timeline" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">12</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['nested-timeline'].title }}</h2><p>{{ copy.section['nested-timeline'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['nested-timeline'].description }}</p>
    <DocsVisualExample variant="nested" :code="snippets.nested" :code-title="ui.compositionCodeTitle" />
    <p class="text-body-2 text-medium-emphasis mt-5 mb-3">{{ copy.section['nested-timeline'].description }}</p>
    <DocsVisualExample variant="nested" :code="snippets.compositionHelpers" :code-title="ui.compositionHelpersCodeTitle" />
  </section>
</template>
