<script setup lang="ts">
withDefaults(defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  accentDot?: boolean;
}>(), {
  accentDot: true,
});
</script>

<template>
  <header class="page-heading mb-6 mb-md-7">
    <div class="text-overline text-primary mb-2">{{ eyebrow }}</div>
    <h1 class="text-h5 text-md-h4 font-weight-bold">
      {{ title }}<span v-if="accentDot" class="text-primary">.</span>
    </h1>
    <p class="text-body-2 text-medium-emphasis mt-2 page-heading__description">{{ description }}</p>
  </header>
</template>

<style scoped>
.page-heading__description {
  max-width: 680px;
  line-height: 1.65;
}
</style>
