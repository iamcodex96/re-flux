<script setup lang="ts">
withDefaults(defineProps<{
  title?: string;
  eyebrow?: string;
  entries: readonly string[];
  emptyMessage: string;
}>(), {
  title: 'Event log',
  eyebrow: 'Lifecycle',
});

const emit = defineEmits<{
  clear: [];
}>();
</script>

<template>
  <UiCard variant="outlined" class="event-log-card">
    <UiCardTitle class="d-flex align-center justify-space-between pa-4 ga-3">
      <div>
        <div class="text-overline text-primary">{{ eyebrow }}</div>
        <h2 class="text-h6 font-weight-medium ma-0">{{ title }}</h2>
      </div>
      <UiButton
        variant="text"
        color="secondary"
        size="small"
        prepend-icon="mdi-delete-sweep-outline"
        :disabled="entries.length === 0"
        @click="emit('clear')"
      >
        Clear
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
      :aria-label="`${title} updates`"
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
