<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { VisualLabSceneDefinition } from './visualLabSceneTypes';

const props = withDefaults(defineProps<{
  modelValue: string;
  idPrefix: string;
  eyebrow: string;
  heading: string;
  description: string;
  scenes: readonly VisualLabSceneDefinition[];
  showSelector?: boolean;
  codeNote?: string;
}>(), {
  showSelector: true,
  codeNote: 'This snippet highlights the public API used by the selected scene. The rendered preview may include additional demo-only drawing code.',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const copied = ref(false);
const copyFailed = ref(false);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

const selectedIndex = computed(() => Math.max(0, props.scenes.findIndex((scene) => scene.id === props.modelValue)));
const selected = computed(() => props.scenes[selectedIndex.value] ?? props.scenes[0]!);
const scenePosition = computed(() => `${String(selectedIndex.value + 1).padStart(2, '0')} / ${String(props.scenes.length).padStart(2, '0')}`);

function selectScene(id: string): void {
  emit('update:modelValue', id);
  copied.value = false;
  copyFailed.value = false;
}

function onTabKeydown(event: KeyboardEvent, index: number): void {
  let nextIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % props.scenes.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + props.scenes.length) % props.scenes.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = props.scenes.length - 1;
  else return;

  event.preventDefault();
  const nextScene = props.scenes[nextIndex];
  if (nextScene) {
    selectScene(nextScene.id);
    document.getElementById(`${props.idPrefix}-tab-${nextScene.id}`)?.focus();
  }
}

async function copySnippet(): Promise<void> {
  copied.value = false;
  copyFailed.value = false;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(selected.value.snippet);
    copied.value = true;
  } catch {
    copyFailed.value = true;
  }

  if (feedbackTimer !== null) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
    feedbackTimer = null;
  }, 2000);
}

onBeforeUnmount(() => {
  if (feedbackTimer !== null) clearTimeout(feedbackTimer);
});
</script>

<template>
  <main class="visual-scene-explorer">
    <div class="visual-scene-explorer__eyebrow">{{ eyebrow }}</div>
    <header class="visual-scene-explorer__heading">
      <div>
        <h1>{{ heading }}</h1>
        <p>{{ description }}</p>
      </div>
      <span class="visual-scene-explorer__status"><i /> SCENE {{ scenePosition }}</span>
    </header>

    <div v-if="showSelector && scenes.length > 1" class="visual-scene-explorer__selector" role="tablist" :aria-label="`Choose ${heading.toLowerCase()} example`">
      <button
        v-for="(scene, index) in scenes"
        :id="`${idPrefix}-tab-${scene.id}`"
        :key="scene.id"
        type="button"
        role="tab"
        :aria-selected="modelValue === scene.id"
        :aria-controls="`${idPrefix}-panel`"
        :tabindex="modelValue === scene.id ? 0 : -1"
        :class="{ 'is-active': modelValue === scene.id }"
        @click="selectScene(scene.id)"
        @keydown="onTabKeydown($event, index)"
      >
        <span>{{ scene.category }}</span>
        <strong>{{ scene.title }}</strong>
      </button>
    </div>

    <section
      v-if="selected"
      class="visual-scene-explorer__stage"
      role="tabpanel"
      tabindex="0"
      :id="`${idPrefix}-panel`"
      :aria-labelledby="showSelector && scenes.length > 1 ? `${idPrefix}-tab-${selected.id}` : `${idPrefix}-panel-title`"
    >
      <h2 :id="`${idPrefix}-panel-title`" class="visual-scene-explorer__sr-only">{{ selected.title }}</h2>
      <div class="visual-scene-explorer__stage-meta">
        <span><i /> {{ selected.stageLabel ?? 'LIVE SCENE' }}</span>
        <span>{{ selected.fileLabel ?? `${selected.id}.ts` }}</span>
      </div>
      <div class="visual-scene-explorer__preview">
        <slot name="stage" :scene="selected" />
      </div>
      <div class="visual-scene-explorer__stage-caption">
        <div>
          <span>{{ selected.category }}</span>
          <h2>{{ selected.title }}</h2>
          <p>{{ selected.description }}</p>
        </div>
        <span class="visual-scene-explorer__stage-tag">{{ selected.stageTag ?? 'REACTIVE VALUE STREAM' }}</span>
      </div>
    </section>

    <section class="visual-scene-explorer__code" :aria-labelledby="`${idPrefix}-code-title`">
      <div class="visual-scene-explorer__code-header">
        <div>
          <span class="visual-scene-explorer__eyebrow">TYPESCRIPT BINDING</span>
          <h2 :id="`${idPrefix}-code-title`">{{ selected.codeTitle ?? selected.title }}</h2>
        </div>
        <button type="button" @click="copySnippet">{{ copied ? 'Copied' : copyFailed ? 'Clipboard unavailable' : 'Copy snippet' }}</button>
      </div>
      <pre><code>{{ selected.snippet }}</code></pre>
      <p>{{ selected.codeNote ?? codeNote }}</p>
    </section>
  </main>
</template>
