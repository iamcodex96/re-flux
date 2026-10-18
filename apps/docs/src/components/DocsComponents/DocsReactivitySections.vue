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
  <section id="reactivity" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">07</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.reactivity.title }}</h2><p>{{ copy.section.reactivity.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section.reactivity.description }}</p>
    <DocsVisualExample variant="reactivity" :code="snippets.reactivity" :code-title="ui.typescriptRxjsLabel" />
    <UiAlert type="info" variant="tonal" density="comfortable" class="mt-4">{{ ui.stopRejectsPromisePrefix }} <code>stop()</code> {{ ui.stopRejectsPromiseSuffix }} <code>Error('Animation stopped before completion')</code>. {{ ui.stopRejectsPromiseFinal }}</UiAlert>
  </section>

  <section id="await-example" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">13</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['await-example'].title }}</h2><p>{{ copy.section['await-example'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['await-example'].description }}</p>
    <DocsVisualExample variant="await" :code="snippets.await" :code-title="ui.asyncAwaitCodeTitle" />
    <UiAlert type="info" variant="tonal" density="comfortable" class="mt-4">{{ ui.promiseRejectionPrefix }} <code>unhandledrejection</code>, {{ ui.promiseRejectionMiddle }} <code>catch</code>.</UiAlert>
  </section>

  <section id="easings" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">08</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.easings.title }}</h2><p>{{ copy.section.easings.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section.easings.description }}</p>
    <DocsVisualExample variant="easing" :code="snippets.easing" :code-title="ui.easingCodeTitle" />
    <p class="text-body-2 text-medium-emphasis mt-3">{{ ui.compareAllCurves }} <RouterLink to="/easings">{{ ui.openEasingsPlayground }}</RouterLink>.</p>
  </section>

  <section id="easing-gallery" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">14</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['easing-gallery'].title }}</h2><p>{{ copy.section['easing-gallery'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['easing-gallery'].description }}</p>
    <DocsVisualExample variant="easing-gallery" :code="snippets.easingGallery" :code-title="ui.customEasingCodeTitle" />
  </section>
</template>
