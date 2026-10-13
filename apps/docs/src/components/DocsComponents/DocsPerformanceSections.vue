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
      <v-avatar size="30" color="secondary" variant="tonal" class="text-caption font-weight-bold">24</v-avatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['frame-observability'].title }}</h2><p>{{ copy.section['frame-observability'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['frame-observability'].description }}</p>
    <v-card variant="outlined" rounded="lg" class="docs-code-card"><v-card-text class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.frameObservability }}</code></pre></v-card-text></v-card>
  </section>
</template>
