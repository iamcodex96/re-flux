<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const snippets = computed(() => copy.value.snippets);
</script>

<template>
<section id="frame-observability" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="secondary" variant="tonal" class="text-caption font-weight-bold">24</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['frame-observability'].title }}</h2><p>{{ copy.section['frame-observability'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['frame-observability'].description }}</p>
    <UiCard variant="outlined" rounded="lg" class="docs-code-card"><UiCardText class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.frameObservability }}</code></pre></UiCardText></UiCard>
  </section>
</template>
