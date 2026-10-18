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
  <section id="animation" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">02</UiAvatar>
      <div>
        <h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.animation.title }}</h2>
        <p>{{ copy.section.animation.subtitle }}</p>
      </div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section.animation.description }}</p>
    <DocsVisualExample variant="basic" :code="snippets.animation" :code-title="ui.animationCodeTitle" />
  </section>

  <section id="parameters" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">03</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.parameters.title }}</h2><p>{{ copy.section.parameters.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-3">{{ copy.section.parameters.description }}</p>
    <UiTable density="comfortable" class="docs-api-table my-4">
      <thead><tr><th scope="col">{{ ui.optionLabel }}</th><th scope="col">{{ ui.optionTypeColumn }}</th><th scope="col">{{ ui.descriptionLabel }}</th></tr></thead>
      <tbody>
        <tr><td><code>duration</code></td><td>number</td><td>{{ ui.durationOneCycle }}</td></tr>
        <tr><td><code>delay</code></td><td>number</td><td>{{ ui.initialWait }}</td></tr>
        <tr><td><code>easing</code></td><td>string | function</td><td>{{ ui.easingDescriptionPrefix }}<code>Easings</code>{{ ui.easingDescriptionSuffix }}</td></tr>
        <tr><td><code>repeat</code></td><td>number</td><td>{{ ui.repeatDescriptionPrefix }}<code>Infinity</code>{{ ui.repeatDescriptionSuffix }}</td></tr>
        <tr><td><code>yoyo</code></td><td>boolean</td><td>{{ ui.alternateDirection }}</td></tr>
      </tbody>
    </UiTable>
    <UiAlert type="info" variant="tonal" density="comfortable" class="mb-4">{{ ui.optionsImmutable }}</UiAlert>
    <DocsVisualExample variant="timing" :code="snippets.timing" :code-title="ui.playbackCodeTitle" />
  </section>

  <section id="timing-examples" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">09</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['timing-examples'].title }}</h2><p>{{ copy.section['timing-examples'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['timing-examples'].description }}</p>
    <DocsVisualExample variant="repeat-yoyo" :code="snippets.repeatYoyo" :code-title="ui.repeatYoyoCodeTitle" />
  </section>

  <section id="controls" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">04</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section.controls.title }}</h2><p>{{ copy.section.controls.subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section.controls.description }}</p>
    <UiRow dense class="my-2">
      <UiCol v-for="method in [
        {name: 'play()', description: ui.playMethodDescription},
        {name: 'pause()', description: ui.pauseMethodDescription},
        {name: 'stop()', description: ui.stopMethodFullDescription},
        {name: 'restart()', description: ui.restartMethodDescription},
        {name: 'seek(ms)', description: ui.seekMethodDescription},
        {name: 'onUpdate(p, eased)', description: ui.updateMethodDescription},
      ]" :key="method.name" cols="12" sm="6" md="4">
        <UiCard variant="outlined" rounded="lg" class="pa-3 h-100">
          <div class="text-subtitle-2 text-primary font-weight-bold mb-2"><code>{{ method.name }}</code></div>
          <p class="text-body-2 mb-0">{{ method.description }}</p>
        </UiCard>
      </UiCol>
    </UiRow>
    <DocsVisualExample variant="callbacks" :code="snippets.callbacks" :code-title="ui.typescriptCallbacksLabel" />
  </section>

  <section id="callback-examples" class="docs-anchor py-7 border-b">
    <div class="docs-section-heading">
      <UiAvatar size="30" color="primary" variant="tonal" class="text-caption font-weight-bold">10</UiAvatar>
      <div><h2 class="text-h5 font-weight-bold mb-1">{{ copy.section['callback-examples'].title }}</h2><p>{{ copy.section['callback-examples'].subtitle }}</p></div>
    </div>
    <p class="text-body-2 text-medium-emphasis mb-4">{{ copy.section['callback-examples'].description }}</p>
    <DocsVisualExample variant="callbacks" :code="snippets.callbacks" :code-title="ui.typescriptCallbacksLabel" />
  </section>
</template>
