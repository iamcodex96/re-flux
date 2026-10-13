<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  color?: string;
}>();
</script>

<template>
  <v-sheet color="surface-variant" rounded="lg" class="metric-tile pa-3 h-100">
    <div class="text-overline text-medium-emphasis">{{ label }}</div>
    <div class="text-h6 font-weight-bold text-truncate" :class="color ? `text-${color}` : undefined">
      {{ value }}
    </div>
  </v-sheet>
</template>
