import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAppStore } from '../stores/app';

type DocsLink = { id: string; label: string };
type DocsPageLink = { label: string; to: string; page: string };
type DocsNavGroup = { label: string; links: DocsLink[] };
type DocsPageNavGroup = { label: string; links: DocsPageLink[] };

/** Keeps the docs shell stable while the nested router swaps only the center article. */
export function useDocsController() {
  const appStore = useAppStore();
  const route = useRoute();
  const docsCopy = computed(() => appStore.app.view.docs);
  const sectionNavigation = computed(() => docsCopy.value.navigation as DocsNavGroup[]);
  const pageNavigation = computed(() => docsCopy.value.pageNavigation as DocsPageNavGroup[]);
  const docsScroller = ref<HTMLElement | null>(null);
  const activeSection = ref('');
  let sectionObserver: IntersectionObserver | undefined;

  const tocIds = computed(() => Array.isArray(route.meta.tocIds) ? route.meta.tocIds as string[] : []);
  const tocItems = computed(() => {
    const linksById = new Map(sectionNavigation.value.flatMap((group) => group.links).map((link) => [link.id, link]));
    return tocIds.value.flatMap((id) => {
      const link = linksById.get(id);
      return link ? [link] : [];
    });
  });
  const mobileNavigation = computed(() => pageNavigation.value.flatMap((group) => group.links.map((link) => ({
    title: `${group.label} / ${link.label}`,
    value: link.to,
  }))));

  function attachSectionObserver(): void {
    sectionObserver?.disconnect();
    sectionObserver = undefined;
    const container = docsScroller.value;
    if (!container) return;

    const anchors = Array.from(container.querySelectorAll<HTMLElement>('.docs-anchor'));
    activeSection.value = anchors[0]?.id ?? '';
    if (typeof IntersectionObserver === 'undefined') return;

    sectionObserver = new IntersectionObserver((entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (current) activeSection.value = current.target.id;
    }, { root: container, rootMargin: '-12px 0px -65% 0px', threshold: 0 });
    anchors.forEach((section) => sectionObserver?.observe(section));
  }

  async function resetArticlePosition(): Promise<void> {
    await nextTick();
    if (docsScroller.value) docsScroller.value.scrollTop = 0;
    await nextTick();
    attachSectionObserver();
  }

  onMounted(() => { void resetArticlePosition(); });
  watch(() => route.path, () => { void resetArticlePosition(); }, { flush: 'post' });
  onBeforeUnmount(() => sectionObserver?.disconnect());

  function scrollToSection(id: string): void {
    const container = docsScroller.value;
    if (!container) return;
    const target = Array.from(container.querySelectorAll<HTMLElement>('.docs-anchor')).find((section) => section.id === id);
    if (!target) return;
    activeSection.value = id;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 8;
    container.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return {
    pageNavigation,
    sectionNavigation,
    mobileNavigation,
    tocItems,
    activeSection,
    docsScroller,
    scrollToSection,
  };
}
