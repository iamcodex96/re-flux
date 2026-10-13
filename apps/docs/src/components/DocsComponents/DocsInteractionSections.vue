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
      <v-avatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">21</v-avatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['gesture-physics'].title }}</h2><p>{{ copy.section['gesture-physics'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['gesture-physics'].description }}</p>
    <v-card variant="outlined" rounded="lg" class="docs-code-card"><v-card-text class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.gesturePhysics }}</code></pre></v-card-text></v-card>
  </section>

<section id="motion-lifecycle" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <v-avatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">22</v-avatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['motion-lifecycle'].title }}</h2><p>{{ copy.section['motion-lifecycle'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['motion-lifecycle'].description }}</p>
    <v-card variant="outlined" rounded="lg" class="docs-code-card"><v-card-text class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.motionLifecycle }}</code></pre></v-card-text></v-card>
  </section>

<section id="scroll-triggers" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <v-avatar size="30" color="secondary" variant="tonal" class="text-caption font-weight-bold">23</v-avatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['scroll-triggers'].title }}</h2><p>{{ copy.section['scroll-triggers'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['scroll-triggers'].description }}</p>
    <v-card variant="outlined" rounded="lg" class="docs-code-card"><v-card-text class="pa-4"><pre class="text-body-2 overflow-x-auto mb-0"><code>{{ snippets.scrollTrigger }}</code></pre></v-card-text></v-card>
  </section>
</template>
