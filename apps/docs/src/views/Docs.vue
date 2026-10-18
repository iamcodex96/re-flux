<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDocsController } from '../composables/useDocsController';
import { useAppStore } from '../stores/app';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const controller = useDocsController();
const { pageNavigation, mobileNavigation, tocItems, activeSection, docsScroller, scrollToSection } = controller;
const pageKey = computed(() => typeof route.meta.docsPage === 'string' ? route.meta.docsPage : 'introduction');
const page = computed(() => {
  const pages = copy.value.pages as Record<string, { label: string; title: string; description: string }>;
  return pages[pageKey.value] ?? pages['introduction']!;
});
const isIntroduction = computed(() => pageKey.value === 'introduction');

function navigateToPage(path: string): void {
  if (path && path !== route.path) void router.push(path);
}
</script>

<template>
  <UiContainer fluid class="docs-viewport pa-0">
    <div class="docs-layout">
      <aside class="docs-sidebar" :aria-label="ui.docsNavigationAriaLabel">
        <div class="docs-sidebar__inner">
          <div class="docs-sidebar__heading">
            <div class="docs-sidebar__eyebrow">Flux</div>
            <div class="docs-sidebar__title">{{ ui.documentationBreadcrumb }}</div>
          </div>

          <nav class="docs-sidebar__navigation" :aria-label="ui.docsNavigationAriaLabel">
            <section v-for="group in pageNavigation" :key="group.label" class="docs-sidebar__group">
              <h2 class="docs-sidebar__group-label">{{ group.label }}</h2>
              <RouterLink
                v-for="link in group.links"
                :key="link.page"
                :to="link.to"
                class="docs-sidebar__link"
                :class="{ 'docs-sidebar__link--active': route.path === link.to }"
                :aria-current="route.path === link.to ? 'page' : undefined"
              >
                {{ link.label }}
              </RouterLink>
            </section>
          </nav>

          <div class="docs-sidebar__footer">
            <RouterLink to="/api" class="docs-sidebar__utility-link"><UiIcon size="16" icon="mdi-tune-variant" /> {{ ui.apiPlaygroundLink }}</RouterLink>
            <RouterLink to="/visuals" class="docs-sidebar__utility-link"><UiIcon size="16" icon="mdi-palette-outline" /> {{ ui.visualShowcaseLink }}</RouterLink>
          </div>
        </div>
      </aside>

      <div class="docs-article-column">
        <div class="docs-mobile-nav">
          <UiSelect
            :model-value="route.path"
            :items="mobileNavigation"
            item-title="title"
            item-value="value"
            :label="ui.mobilePageLabel"
            density="comfortable"
            variant="outlined"
            hide-details
            rounded="lg"
            :aria-label="ui.chooseDocsPageAriaLabel"
            @update:model-value="navigateToPage"
          />
        </div>

        <article ref="docsScroller" class="docs-content" :aria-label="ui.docsArticleAriaLabel">
          <header v-if="!isIntroduction" class="docs-page-heading">
            <div class="docs-breadcrumbs">
              <RouterLink to="/docs/introduction">{{ ui.documentationBreadcrumb }}</RouterLink>
              <UiIcon size="13" icon="mdi-chevron-right" />
              <span>{{ page.label }}</span>
            </div>
            <h1>{{ page.title }}<span class="text-primary">.</span></h1>
            <p>{{ page.description }}</p>
          </header>

          <RouterView v-slot="{ Component }">
            <component :is="Component" :key="route.path" />
          </RouterView>
        </article>
      </div>

      <aside class="docs-toc-column" :aria-label="ui.docsNavigationTitle">
        <div class="docs-toc">
          <div class="docs-toc__heading">{{ ui.docsNavigationTitle }}</div>
          <nav class="docs-toc__links" :aria-label="ui.docsNavigationTitle">
            <button
              v-for="link in tocItems"
              :key="link.id"
              type="button"
              class="docs-toc__link"
              :class="{ 'docs-toc__link--active': activeSection === link.id }"
              :aria-current="activeSection === link.id ? 'location' : undefined"
              @click="scrollToSection(link.id)"
            >
              {{ link.label }}
            </button>
          </nav>
        </div>
      </aside>
    </div>
  </UiContainer>
</template>
