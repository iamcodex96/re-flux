<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useAppStore } from '../../stores/app';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const copied = ref(false);
let copyFeedbackTimeout: number | undefined;
const code = `import { Subject } from 'rxjs';
import { retargetMotion } from '@re-code/flux';

const orb = document.querySelector<HTMLElement>('[data-orb]');
const velocityLabel = document.querySelector<HTMLElement>('[data-velocity]');
if (!orb || !velocityLabel) throw new Error('Missing demo target');

const targets$ = new Subject<number>();
const motion$ = targets$.pipe(
  retargetMotion({
    initialValue: 0,
    stiffness: 280,
    damping: 26,
    mass: 1.2,
  }),
);

const subscription = motion$.subscribe(({ value, velocity }) => {
  orb.style.transform = \`translateX(\${value}px)\`;
  velocityLabel.textContent = \`\${velocity.toFixed(1)} px/s\`;
});

targets$.next(120);
// On teardown:
subscription.unsubscribe();
targets$.complete();`;

async function copyCode(): Promise<void> {
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    window.clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = window.setTimeout(() => { copied.value = false; }, 1600);
  } catch {
    copied.value = false;
  }
}

onBeforeUnmount(() => window.clearTimeout(copyFeedbackTimeout));
</script>

<template>
  <section id="reactive-pipeline" class="docs-anchor docs-pipeline-section">
    <header class="docs-section-heading docs-pipeline-section__heading">
      <span class="docs-section-heading__icon"><UiIcon icon="mdi-source-branch" size="22" /></span>
      <div>
        <p class="docs-section-eyebrow">{{ copy.pipeline.eyebrow }}</p>
        <h2>{{ copy.pipeline.title }}</h2>
      </div>
      <span class="docs-section-heading__meta">{{ copy.pipeline.meta }}</span>
    </header>
    <p class="docs-section-intro">{{ copy.pipeline.description }}</p>

    <div class="docs-pipeline-grid">
      <div class="docs-pipeline-flow">
        <article v-for="step in copy.pipeline.steps" :key="step.number" class="docs-pipeline-step">
          <span class="docs-pipeline-step__number">{{ step.number }}</span>
          <div>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </div>
        </article>
        <div class="docs-pipeline-frequency">
          <span>{{ copy.pipeline.clockLabel }}</span>
          <strong>{{ copy.pipeline.clockValue }}</strong>
          <span class="docs-pipeline-frequency__note">{{ copy.pipeline.clockNote }}</span>
        </div>
      </div>

      <div class="docs-code-window">
        <div class="docs-code-window__toolbar">
          <span class="docs-code-window__lights" aria-hidden="true"><i /><i /><i /></span>
          <span class="docs-code-window__filename">retarget-stream.ts</span>
          <span class="docs-code-window__language">{{ copy.ui.typescriptLabel }}</span>
          <button type="button" class="docs-code-window__copy" @click="copyCode"><UiIcon :icon="copied ? 'mdi-check' : 'mdi-content-copy'" size="14" /> {{ copied ? copy.ui.copied : copy.ui.copyCode }}</button>
        </div>
        <pre><code>{{ code }}</code></pre>
        <div class="docs-code-window__footer"><span><UiIcon icon="mdi-check-circle-outline" size="14" /> {{ copy.pipeline.codeFooter }}</span><span>{{ copy.pipeline.cleanupFooter }}</span></div>
      </div>
    </div>
  </section>
</template>
