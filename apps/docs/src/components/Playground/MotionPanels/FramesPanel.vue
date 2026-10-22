<script setup lang="ts">
import { useAppStore } from '../../../stores/app';
import { onBeforeUnmount, ref , computed} from 'vue';
import { frameCoordinator } from '@lib';
import type { Subscription } from 'rxjs';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.motionPanelFrames);
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
  <UiCard variant="outlined" class="motion-playground-card">
    <UiCardTitle class="pa-4">
      <div class="text-overline text-primary">{{ copy.staticText.text03FRAMECOORDINATION }}</div>
      <h2 class="text-h6 ma-0">{{ copy.staticText.readFirstWriteAfter }}</h2>
      <p class="text-body-2 text-medium-emphasis mt-2 mb-0">{{ copy.staticText.theCoordinatorGroupsLayoutReadsBeforeFramea8f69c }}</p>
    </UiCardTitle>
    <UiDivider />
    <UiCardText class="pa-4 pa-md-5">
      <div ref="frameStage" class="frame-demo-stage mb-4" role="img" :aria-label="copy.staticText.framePhaseExample.replace('{width}', String(measuredWidth))">
        <div class="frame-demo-stage__marker"></div>
        <span>{{ copy.staticText.measuredWidth }} {{ measuredWidth }} {{ copy.staticText.px }}</span>
      </div>
      <div class="d-flex flex-wrap align-center ga-3 mb-4">
        <UiButton color="primary" prepend-icon="mdi-refresh" @click="runFrameCycle">{{ copy.staticText.runOneCoordinatedFrame }}</UiButton>
        <UiChip v-if="phaseLog.length" role="status" aria-live="polite" color="secondary" variant="tonal">{{ phaseLog.length }} {{ copy.staticText.phaseCallbacks }}</UiChip>
      </div>
      <UiList v-if="phaseLog.length" density="compact" class="bg-transparent">
        <UiListItem v-for="(entry, index) in phaseLog" :key="`${entry}-${index}`" :prepend-icon="index === 0 ? 'mdi-arrow-down-right' : 'mdi-arrow-up-right'"><UiListItemTitle class="text-body-2 font-monospace">{{ entry }}</UiListItemTitle></UiListItem>
      </UiList>
      <UiAlert v-else type="info" variant="text" density="compact" class="mb-4">{{ copy.staticText.runTheExampleToInspectTheReadWriteOrder }}</UiAlert>
      <pre class="motion-code"><code>{{ frameCode }}</code></pre>
    </UiCardText>
  </UiCard>

</template>
