<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useAppStore } from '../../stores/app';

type ApiCategory = 'core' | 'values' | 'composition' | 'physics' | 'streams' | 'gestures' | 'timing' | 'lifecycle' | 'scheduler' | 'utilities';
type ApiCategoryFilter = 'all' | ApiCategory;
type ApiCategoryOption = { value: ApiCategoryFilter; label: string };
type ApiEntry = { name: string; exportName: string; signature: string; result: string; category: ApiCategory; description: string; importPath: string };
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const text = computed(() => copy.value.apiReference);
const query = ref('');
const category = ref<ApiCategoryFilter>('all');
const categories = computed(() => text.value.categories as ApiCategoryOption[]);
const entries = computed(() => text.value.entries as ApiEntry[]);

function getCategoryLabel(categoryKey: ApiEntry['category']): string {
  return categories.value.find((item) => item.value === categoryKey)?.label ?? categoryKey;
}

const filteredEntries = computed(() => entries.value.filter((entry) => (category.value === 'all' || entry.category === category.value)
  && `${entry.name} ${entry.signature} ${entry.description} ${getCategoryLabel(entry.category)}`.toLowerCase().includes(query.value.trim().toLowerCase())));
const copiedName = ref('');
let copyFeedbackTimeout: number | undefined;

async function copyImport(entry: ApiEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(`import { ${entry.exportName} } from '${entry.importPath}';`);
    copiedName.value = entry.name;
    window.clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = window.setTimeout(() => { copiedName.value = ''; }, 1400);
  } catch {
    copiedName.value = '';
  }
}

onBeforeUnmount(() => window.clearTimeout(copyFeedbackTimeout));
</script>

<template>
  <div class="docs-api-reference">
    <section id="api-surface" class="docs-anchor docs-api-reference__intro">
      <div class="docs-section-heading"><span class="docs-section-heading__icon"><UiIcon icon="mdi-function-variant" size="22" /></span><div><p class="docs-section-eyebrow">{{ text.eyebrow }}</p><h2>{{ text.title }}</h2></div></div>
      <p class="docs-section-intro">{{ text.description }}</p>
      <div class="docs-api-reference__notice"><UiIcon icon="mdi-information-outline" size="18" /><p>{{ text.importNotice }}</p></div>
    </section>

    <section id="api-operators" class="docs-anchor docs-api-reference__catalog">
      <div class="docs-api-reference__toolbar">
        <label class="docs-api-reference__search"><UiIcon icon="mdi-magnify" size="18" /><span class="visually-hidden">{{ text.searchLabel }}</span><input v-model="query" type="search" :placeholder="text.searchPlaceholder" /></label>
        <div class="docs-api-reference__filters" role="group" :aria-label="text.categoryFilterLabel">
          <button v-for="item in categories" :key="item.value" type="button" :class="{ 'is-active': category === item.value }" :aria-pressed="category === item.value" @click="category = item.value">{{ item.label }}</button>
        </div>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite">{{ copiedName ? `${text.importCopied}: ${copiedName}` : '' }}</p>

      <div class="docs-api-table-shell">
        <table class="docs-api-reference__table">
          <thead><tr><th>{{ text.operatorColumn }}</th><th>{{ text.signatureColumn }}</th><th>{{ text.returnColumn }}</th><th>{{ text.categoryColumn }}</th><th><span class="visually-hidden">{{ text.copyColumn }}</span></th></tr></thead>
          <tbody>
            <tr v-for="entry in filteredEntries" :key="entry.name">
              <td><code class="docs-api-reference__name">{{ entry.name }}</code></td>
              <td><code class="docs-api-reference__signature">{{ entry.signature }}</code><p>{{ entry.description }}</p></td>
              <td><code class="docs-api-reference__return">{{ entry.result }}</code></td>
              <td><span class="docs-api-reference__category" :class="`docs-api-reference__category--${entry.category}`">{{ getCategoryLabel(entry.category) }}</span></td>
              <td><button class="docs-api-reference__copy" type="button" :aria-label="`${text.copyImportFor} ${entry.name}`" @click="copyImport(entry)"><UiIcon :icon="copiedName === entry.name ? 'mdi-check' : 'mdi-content-copy'" size="15" /></button></td>
            </tr>
            <tr v-if="filteredEntries.length === 0"><td colspan="5" class="docs-api-reference__empty">{{ text.noResults }}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="docs-api-reference__footer">{{ filteredEntries.length }} {{ text.entriesLabel }} · {{ text.adapterNote }} <RouterLink to="/docs/rendering">{{ text.renderingAdaptersLink }}</RouterLink></p>
    </section>
  </div>
</template>
