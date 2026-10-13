<script setup lang="ts">
import { useId } from 'vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{
  modelValue: number;
  label: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  valueText?: string;
}>(), {
  step: 1,
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const labelId = `slider-label-${useId()}`;

function updateValue(value: number | number[]): void {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized === 'number' && Number.isFinite(normalized)) {
    emit('update:modelValue', normalized);
  }
}
</script>

<template>
  <div class="labeled-slider" v-bind="$attrs">
    <div class="labeled-slider__heading">
      <v-label :id="labelId" class="labeled-slider__label">{{ props.label }}</v-label>
      <v-chip v-if="props.valueText !== undefined" size="x-small" color="primary" variant="tonal">
        {{ props.valueText }}
      </v-chip>
    </div>
    <v-slider
      :model-value="props.modelValue"
      :min="props.min"
      :max="props.max"
      :step="props.step"
      :disabled="props.disabled"
      :aria-labelledby="labelId"
      hide-details
      @update:model-value="updateValue"
    />
  </div>
</template>
