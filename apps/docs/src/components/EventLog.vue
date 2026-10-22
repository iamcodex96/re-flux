<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.eventLog);
const props = defineProps<{
  title?: string;
  eyebrow?: string;
  entries: readonly string[];
  emptyMessage: string;
}>();
const titleText = computed(() => props.title ?? copy.value.staticText.eventLog);
const eyebrowText = computed(() => props.eyebrow ?? copy.value.staticText.lifecycle);

const emit = defineEmits<{
  clear: [];
}>();
</script>

<template>
  <UiCard variant="outlined" class="event-log-card">
    <UiCardTitle class="d-flex align-center justify-space-between pa-4 ga-3">
      <div>
        <div class="text-overline text-primary">{{ eyebrowText }}</div>
        <h2 class="text-h6 font-weight-medium ma-0">{{ titleText }}</h2>
      </div>
      <UiButton
        variant="text"
        color="secondary"
        size="small"
        prepend-icon="mdi-delete-sweep-outline"
        :disabled="entries.length === 0"
        @click="emit('clear')"
      >
        {{ copy.staticText.clear }}
      </UiButton>
    </UiCardTitle>
    <UiDivider />
    <UiList
      v-if="entries.length"
      density="compact"
      class="event-log bg-transparent py-1"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      :aria-label="copy.staticText.updatesAriaLabel.replace('{title}', titleText)"
    >
      <UiListItem
        v-for="(entry, index) in entries"
        :key="`${entry}-${index}`"
        prepend-icon="mdi-console-line"
      >
        <UiListItemTitle class="text-caption font-monospace">{{ entry }}</UiListItemTitle>
      </UiListItem>
    </UiList>
    <UiAlert v-else type="info" variant="text" density="compact" class="ma-3">
      {{ emptyMessage }}
    </UiAlert>
  </UiCard>
</template>
