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
  <v-card variant="outlined" class="event-log-card">
    <v-card-title class="d-flex align-center justify-space-between pa-4 ga-3">
      <div>
        <div class="text-overline text-primary">{{ eyebrow }}</div>
        <h2 class="text-h6 font-weight-medium ma-0">{{ title }}</h2>
      </div>
      <v-btn
        variant="text"
        color="secondary"
        size="small"
        prepend-icon="mdi-delete-sweep-outline"
        :disabled="entries.length === 0"
        @click="emit('clear')"
      >
        Clear
      </v-btn>
    </v-card-title>
    <v-divider />
    <v-list
      v-if="entries.length"
      density="compact"
      class="event-log bg-transparent py-1"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      :aria-label="`${title} updates`"
    >
      <v-list-item
        v-for="(entry, index) in entries"
        :key="`${entry}-${index}`"
        prepend-icon="mdi-console-line"
      >
        <v-list-item-title class="text-caption font-monospace">{{ entry }}</v-list-item-title>
      </v-list-item>
    </v-list>
    <v-alert v-else type="info" variant="text" density="compact" class="ma-3">
      {{ emptyMessage }}
    </v-alert>
  </v-card>
</template>
