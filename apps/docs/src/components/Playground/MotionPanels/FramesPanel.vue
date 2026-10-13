<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { frameCoordinator } from '@lib';
import type { Subscription } from 'rxjs';

const frameStage = ref<HTMLElement | null>(null);
const measuredWidth = ref(0);
const phaseLog = ref<string[]>([]);
const phaseSubscriptions: Subscription[] = [];
function runFrameCycle(): void {
  phaseSubscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
  phaseLog.value = [];
  phaseSubscriptions.push(frameCoordinator.scheduleRead((frame) => {
    const width = frameStage.value?.getBoundingClientRect().width ?? 0;
    phaseLog.value = [`READ · frame ${frame.frame} · width ${Math.round(width)} px`];
    phaseSubscriptions.push(frameCoordinator.scheduleWrite((writeFrame) => {
      if (frameStage.value) frameStage.value.style.setProperty('--coordinated-marker-width', `${Math.max(12, width * 0.42)}px`);
      measuredWidth.value = Math.round(width);
      phaseLog.value = [...phaseLog.value, `WRITE · frame ${writeFrame.frame} · applied marker width`];
    }));
  }));
}
const frameCode = [
  "import { frameCoordinator } from '@re-code/flux';",
  '',
  'frameCoordinator.scheduleRead((frame) => {',
  '  const width = element.getBoundingClientRect().width;',
  '  frameCoordinator.scheduleWrite(() => {',
  '    element.style.width = `${width}px`;',
  '  });',
  '});',
].join('\n');
onBeforeUnmount(() => phaseSubscriptions.splice(0).forEach((subscription) => subscription.unsubscribe()));
</script>

<template>
  <v-card variant="outlined" class="motion-playground-card">
    <v-card-title class="pa-4">
      <div class="text-overline text-primary">03 / FRAME COORDINATION</div>
      <h2 class="text-h6 ma-0">Read first, write after</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">The coordinator groups layout reads before frame updates and writes after them. This example measures a stage, then applies a CSS variable in the write phase.</p>
    </v-card-title>
    <v-divider />
    <v-card-text class="pa-4 pa-md-5">
      <div ref="frameStage" class="frame-demo-stage mb-4" role="img" :aria-label="`Frame phase example. Measured width: ${measuredWidth} pixels.`">
        <div class="frame-demo-stage__marker"></div>
        <span>Measured width: {{ measuredWidth }} px</span>
      </div>
      <div class="d-flex flex-wrap align-center ga-3 mb-4">
        <v-btn color="primary" prepend-icon="mdi-refresh" @click="runFrameCycle">Run one coordinated frame</v-btn>
        <v-chip v-if="phaseLog.length" role="status" aria-live="polite" color="secondary" variant="tonal">{{ phaseLog.length }} phase callbacks</v-chip>
      </div>
      <v-list v-if="phaseLog.length" density="compact" class="bg-transparent">
        <v-list-item v-for="(entry, index) in phaseLog" :key="`${entry}-${index}`" :prepend-icon="index === 0 ? 'mdi-arrow-down-right' : 'mdi-arrow-up-right'"><v-list-item-title class="text-body-2 font-monospace">{{ entry }}</v-list-item-title></v-list-item>
      </v-list>
      <v-alert v-else type="info" variant="text" density="compact" class="mb-4">Run the example to inspect the read/write order.</v-alert>
      <pre class="motion-code"><code>{{ frameCode }}</code></pre>
    </v-card-text>
  </v-card>

</template>
