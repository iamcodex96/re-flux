<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const snippets = computed(() => copy.value.snippets);
</script>

<template>
  <section id="overview" class="docs-anchor pb-7 mb-3 border-b">
    <div class="d-flex align-center ga-2 text-caption text-medium-emphasis mb-5">
      <span>{{ ui.documentationBreadcrumb }}</span><UiIcon size="12">mdi-chevron-right</UiIcon><span class="text-high-emphasis">{{ ui.animationBreadcrumb }}</span>
    </div>
    <div class="text-overline text-primary mb-2"><UiIcon size="10" color="secondary" class="mr-2">mdi-circle</UiIcon>{{ ui.apiReference }}</div>
    <h1 class="docs-main-title font-weight-bold mb-3">{{ copy.section.overview.title }}<span class="text-primary">.</span></h1>
    <p class="docs-lead text-medium-emphasis mb-4">{{ copy.section.overview.description }}</p>
    <div class="d-flex flex-wrap ga-2"><UiChip size="small" variant="tonal" color="primary">{{ ui.typescriptLabel }}</UiChip><UiChip size="small" variant="tonal" color="secondary">{{ ui.rxjs }}</UiChip><UiChip size="small" variant="tonal">{{ ui.raf }}</UiChip></div>
  </section>

  <section id="install" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">01</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.install.title }}</h2><p>{{ copy.section.install.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section.install.description }}</p>
    <UiCard class="docs-code-card mb-4 overflow-hidden" variant="outlined" rounded="lg">
      <div class="d-flex align-center ga-2 pa-3 border-b"><UiIcon size="12" color="secondary">mdi-circle</UiIcon><span class="text-overline text-medium-emphasis">{{ ui.typescriptLabel }}</span></div>
      <pre><code>{{ snippets.install }}</code></pre>
    </UiCard>
  </section>
</template>
