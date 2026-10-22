<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';
import DocsRuntimeTelemetry from './DocsRuntimeTelemetry.vue';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const snippets = computed(() => copy.value.snippets);
</script>

<template>
  <section id="frame-observability" class="docs-anchor docs-performance-section">
    <div class="docs-section-heading">
      <span class="docs-section-heading__icon"><UiIcon icon="mdi-chart-timeline-variant" size="22" /></span>
      <div><p class="docs-section-eyebrow">{{ ui.performanceEyebrow }}</p><h2>{{ copy.section['frame-observability'].title }}</h2></div>
    </div>
    <p class="docs-section-intro">{{ copy.section['frame-observability'].description }}</p>
    <div class="docs-code-window docs-performance-section__code"><div class="docs-code-window__toolbar"><span class="docs-code-window__filename">frame-coordinator.ts</span><span class="docs-code-window__language">{{ ui.typescriptLabel }}</span></div><pre><code>{{ snippets.frameObservability }}</code></pre></div>
    <DocsRuntimeTelemetry />
  </section>
</template>
