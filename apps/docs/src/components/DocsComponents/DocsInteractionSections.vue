<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const snippets = computed(() => copy.value.snippets);
</script>

<template>
<section id="gesture-physics" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">21</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['gesture-physics'].title }}</h2><p>{{ copy.section['gesture-physics'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['gesture-physics'].description }}</p>
    <UiCard variant="outlined" rounded="lg" class="docs-code-card"><UiCardText class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.gesturePhysics }}</code></pre></UiCardText></UiCard>
  </section>

<section id="motion-lifecycle" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">22</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['motion-lifecycle'].title }}</h2><p>{{ copy.section['motion-lifecycle'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['motion-lifecycle'].description }}</p>
    <UiCard variant="outlined" rounded="lg" class="docs-code-card"><UiCardText class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.motionLifecycle }}</code></pre></UiCardText></UiCard>
  </section>

<section id="scroll-triggers" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="secondary" variant="tonal" class="text-caption font-weight-bold">23</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['scroll-triggers'].title }}</h2><p>{{ copy.section['scroll-triggers'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['scroll-triggers'].description }}</p>
    <UiCard variant="outlined" rounded="lg" class="docs-code-card"><UiCardText class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.scrollTrigger }}</code></pre></UiCardText></UiCard>
  </section>
</template>
