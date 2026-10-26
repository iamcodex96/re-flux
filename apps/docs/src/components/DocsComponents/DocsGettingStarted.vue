<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useAppStore } from '../../stores/app';
import DocsArchitecturePipeline from './DocsArchitecturePipeline.vue';
import { installCommandForManager, type PackageManager } from '../../utils/packageInstall';

const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const install = computed(() => copy.value.installPanel);
const packageManagers: PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun'];
const activeManager = ref<PackageManager>('pnpm');
const copied = ref(false);
let copyFeedbackTimeout: number | undefined;
const command = computed(() => installCommandForManager(activeManager.value, __RE_FLUX_VERSION__));

async function copyCommand(): Promise<void> {
  try {
    await navigator.clipboard.writeText(command.value);
    copied.value = true;
    window.clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = window.setTimeout(() => { copied.value = false; }, 1500);
  } catch {
    copied.value = false;
  }
}

onBeforeUnmount(() => window.clearTimeout(copyFeedbackTimeout));
</script>

<template>
  <section id="overview" class="docs-anchor docs-intro-section">
    <div class="docs-intro-section__eyebrow"><span />{{ install.eyebrow }}</div>
    <p class="docs-lead">{{ copy.section.overview.description }}</p>
    <div class="docs-intro-badges"><span>{{ ui.typescriptLabel }}</span><span>{{ ui.rxjs }}</span><span>{{ ui.raf }}</span></div>
  </section>

  <section id="install" class="docs-anchor docs-install-section">
    <header class="docs-section-heading docs-install-section__heading">
      <span class="docs-section-heading__icon"><UiIcon icon="mdi-console" size="22" /></span>
      <div><p class="docs-section-eyebrow">{{ install.eyebrow }}</p><h2>{{ install.title }}</h2></div>
    </header>
    <p class="docs-section-intro">{{ install.description }}</p>

    <div class="docs-install-grid">
      <div class="docs-install-code">
        <div class="docs-install-code__toolbar">
          <div class="docs-install-code__tabs" role="group" :aria-label="install.packageManagerLabel">
            <button v-for="manager in packageManagers" :key="manager" type="button" :aria-pressed="activeManager === manager" :class="{ 'is-active': activeManager === manager }" @click="activeManager = manager">{{ manager }}</button>
          </div>
          <button class="docs-install-code__copy" type="button" @click="copyCommand"><UiIcon :icon="copied ? 'mdi-check' : 'mdi-content-copy'" size="15" /> {{ copied ? ui.copied : ui.copyCode }}</button>
        </div>
        <div class="docs-install-code__command"><span aria-hidden="true">$</span><code>{{ command }}</code><span class="docs-install-code__cursor" aria-hidden="true" /></div>
        <p class="docs-install-code__note">{{ install.peerDependencyNote }}</p>
      </div>

      <aside class="docs-install-note">
        <div class="docs-install-note__icon"><UiIcon icon="mdi-vector-link" size="22" /></div>
        <div><h3>{{ install.interopTitle }}</h3><p>{{ install.interopDescription }} <code>Observable&lt;T&gt;</code> {{ install.interopSuffix }}</p></div>
        <div class="docs-install-note__meta"><span>{{ install.metaLabel }}</span><strong>{{ install.metaValue }}</strong></div>
      </aside>
    </div>
  </section>

  <DocsArchitecturePipeline />
</template>
