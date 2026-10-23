<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAppStore } from '../stores/app';

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const ui = computed(() => copy.value.ui);
const pageKey = computed(() => typeof route.meta.docsPage === 'string' ? route.meta.docsPage : 'introduction');
const pages = computed(() => copy.value.pages as Record<string, { label: string; title: string; description: string }>);
const page = computed(() => pages.value[pageKey.value] ?? pages.value.introduction!);
const pageNavigation = computed(() => copy.value.pageNavigation as Array<{ label: string; links: Array<{ label: string; to: string; page: string }> }>);
const mobileNavigation = computed(() => pageNavigation.value.flatMap((group) => group.links.map((link) => ({ title: `${group.label} / ${link.label}`, value: link.to }))));
const docsScroller = ref<HTMLElement | null>(null);
const mobileNavigationOpen = ref(false);
const versionLabel = `v${__RE_FLUX_VERSION__}`;
const currentPageIndex = computed(() => mobileNavigation.value.findIndex((item) => item.value === route.path));
const previousPage = computed(() => currentPageIndex.value > 0 ? mobileNavigation.value[currentPageIndex.value - 1] : undefined);
const nextPage = computed(() => currentPageIndex.value >= 0 && currentPageIndex.value < mobileNavigation.value.length - 1 ? mobileNavigation.value[currentPageIndex.value + 1] : undefined);

function navigateToPage(path: string): void {
  if (path && path !== route.path) void router.push(path);
  mobileNavigationOpen.value = false;
}

function onMobilePageChange(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLSelectElement) navigateToPage(target.value);
}

watch(() => route.fullPath, async () => {
  await nextTick();
  if (docsScroller.value) docsScroller.value.scrollTop = 0;
  mobileNavigationOpen.value = false;
}, { flush: 'post' });
</script>

<template>
  <div class="docs-viewport">
    <div class="docs-layout">
      <aside class="docs-sidebar" :aria-label="ui.navigationAriaLabel">
        <div class="docs-sidebar__inner">
          <div class="docs-sidebar__heading">
            <div class="docs-sidebar__heading-row">
              <span class="docs-sidebar__eyebrow">{{ ui.documentationLabel }}</span>
              <span class="docs-sidebar__version">{{ versionLabel }}</span>
            </div>
            <p class="docs-sidebar__intro">{{ ui.sidebarDescription }}</p>
          </div>

          <nav class="docs-sidebar__navigation" :aria-label="ui.navigationAriaLabel">
            <section v-for="group in pageNavigation" :key="group.label" class="docs-sidebar__group">
              <h2 class="docs-sidebar__group-label">{{ group.label }}</h2>
              <RouterLink
                v-for="link in group.links"
                :key="link.page"
                :to="link.to"
                class="docs-sidebar__link"
                :class="{ 'docs-sidebar__link--active': pageKey === link.page }"
                :aria-current="pageKey === link.page ? 'page' : undefined"
              >
                {{ link.label }}
              </RouterLink>
            </section>
          </nav>

          <div class="docs-sidebar__footer">
            <RouterLink to="/api" class="docs-sidebar__utility-link"><UiIcon size="16" icon="mdi-tune-variant" /> {{ ui.apiPlaygroundLink }}</RouterLink>
            <RouterLink to="/visuals" class="docs-sidebar__utility-link"><UiIcon size="16" icon="mdi-flask-outline" /> {{ ui.visualShowcaseLink }}</RouterLink>
            <a class="docs-sidebar__utility-link" href="https://github.com/iamcodex96/re-flux" target="_blank" rel="noreferrer noopener"><UiIcon size="16" icon="mdi-github" /> {{ ui.githubSource }}</a>
          </div>
        </div>
      </aside>

      <div class="docs-article-column">
        <div class="docs-mobile-toolbar">
          <button class="docs-mobile-toolbar__toggle" type="button" :aria-expanded="mobileNavigationOpen" aria-controls="docs-mobile-page-menu" @click="mobileNavigationOpen = !mobileNavigationOpen">
            <UiIcon :icon="mobileNavigationOpen ? 'mdi-close' : 'mdi-menu'" />
            <span>{{ ui.documentationLabel }}</span>
            <UiIcon icon="mdi-chevron-down" />
          </button>
          <nav v-if="mobileNavigationOpen" id="docs-mobile-page-menu" class="docs-mobile-toolbar__menu" :aria-label="ui.navigationAriaLabel">
            <section v-for="group in pageNavigation" :key="group.label" class="docs-mobile-toolbar__group">
              <h2>{{ group.label }}</h2>
              <RouterLink v-for="link in group.links" :key="link.page" :to="link.to" @click="mobileNavigationOpen = false">{{ link.label }}</RouterLink>
            </section>
          </nav>
          <label class="docs-mobile-toolbar__select-label">
            <span class="visually-hidden">{{ ui.mobilePageLabel }}</span>
            <select :value="route.path" :aria-label="ui.chooseDocsPageAriaLabel" @change="onMobilePageChange">
              <option v-for="option in mobileNavigation" :key="option.value" :value="option.value">{{ option.title }}</option>
            </select>
          </label>
        </div>

        <article ref="docsScroller" class="docs-content" :aria-label="ui.docsArticleAriaLabel">
          <header class="docs-page-heading">
            <div class="docs-breadcrumbs">
              <RouterLink to="/docs/introduction">{{ ui.coreArchitectureBreadcrumb }}</RouterLink>
              <UiIcon size="13" icon="mdi-chevron-right" />
              <span class="docs-breadcrumbs__current">{{ page.label }}</span>
            </div>
            <div class="docs-meta-chips" :aria-label="ui.packageMetadata">
              <span class="docs-meta-chip docs-meta-chip--release">{{ versionLabel }}</span>
              <span class="docs-meta-chip">{{ ui.typescriptVersion }}</span>
              <span class="docs-meta-chip">{{ ui.rxjsPeerLabel }}</span>
              <span class="docs-meta-chip docs-meta-chip--accent">{{ ui.optionalAdapters }}</span>
            </div>
            <h1 v-if="pageKey === 'streams'">{{ ui.streamsHeadingPrefix }}<span class="docs-page-heading__gradient">{{ ui.streamsHeadingSuffix }}</span></h1>
            <h1 v-else>{{ page.title }}</h1>
            <p>{{ page.description }}</p>
          </header>

          <RouterView v-slot="{ Component }">
            <component :is="Component" :key="route.path" />
          </RouterView>

          <nav class="docs-page-pagination" :aria-label="ui.articlePaginationLabel">
            <RouterLink v-if="previousPage" class="docs-page-pagination__item docs-page-pagination__item--previous" :to="previousPage.value">
              <span class="docs-page-pagination__eyebrow"><UiIcon icon="mdi-arrow-left" size="14" /> {{ ui.previousArticleLabel }}</span>
              <strong>{{ previousPage.title.split(' / ').slice(-1)[0] }}</strong>
            </RouterLink>
            <span v-else class="docs-page-pagination__spacer" />
            <RouterLink v-if="nextPage" class="docs-page-pagination__item docs-page-pagination__item--next" :to="nextPage.value">
              <span class="docs-page-pagination__eyebrow">{{ ui.nextArticleLabel }} <UiIcon icon="mdi-arrow-right" size="14" /></span>
              <strong>{{ nextPage.title.split(' / ').slice(-1)[0] }}</strong>
            </RouterLink>
          </nav>

          <footer class="docs-article-footer">
            <span>{{ ui.docsFeedbackPrompt }}</span>
            <a href="https://github.com/iamcodex96/re-flux/issues" target="_blank" rel="noreferrer noopener">{{ ui.editOrImproveDocs }} <UiIcon icon="mdi-open-in-new" size="13" /></a>
            <span class="docs-article-footer__package">{{ ui.packageLabel }} <code>@re-code/flux</code></span>
          </footer>
        </article>
      </div>
    </div>
  </div>
</template>
