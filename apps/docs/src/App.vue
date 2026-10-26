<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAppStore } from './stores/app';

const route = useRoute();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.navigation);
const isHomeRoute = computed(() => route.path === '/');
const isDocsRoute = computed(() => route.path.startsWith('/docs'));
const isVisualRoute = computed(() => route.path.startsWith('/visuals'));
const isPlaygroundRoute = computed(() => route.path.startsWith('/playground'));
const mobileMenuOpen = ref(false);
const currentYear = new Date().getFullYear();

const navigation = computed(() => [
  { label: copy.value.visualLab, icon: 'mdi-flask-outline', to: '/visuals' },
  { label: copy.value.playground, icon: 'mdi-play-circle-outline', to: '/playground' },
  { label: copy.value.benchmarkLab, icon: 'mdi-chart-box-outline', to: '/benchmarks' },
  { label: copy.value.documentation, icon: 'mdi-book-open-page-variant-outline', to: '/docs' },
]);

function isActive(to: string): boolean {
  if (to === '/visuals') return isVisualRoute.value;
  if (to === '/playground') return isPlaygroundRoute.value;
  if (to === '/docs') return isDocsRoute.value;
  if (to === '/benchmarks') return route.name === 'benchmarks';
  return route.path === to;
}

function skipToMainContent(): void {
  const main = document.getElementById('main-content');
  if (!main) return;
  main.focus({ preventScroll: true });
  main.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

watch(() => route.fullPath, async () => {
  mobileMenuOpen.value = false;
  await nextTick();
  document.getElementById('main-content')?.focus({ preventScroll: true });
}, { flush: 'post' });
</script>

<template>
  <div class="site-shell" :class="{ 'site-shell--home': isHomeRoute, 'site-shell--docs': isDocsRoute }">
    <a class="skip-link" href="#main-content" @click.prevent="skipToMainContent">{{ copy.skipToMainContent }}</a>

    <header class="site-header" :class="{ 'site-header--menu-open': mobileMenuOpen }">
      <div class="site-header__inner">
        <RouterLink to="/" class="site-brand" :aria-label="copy.homeAriaLabel">
          <span class="site-brand__mark" aria-hidden="true"><span>{{ copy.re }}</span></span>
          <span class="site-brand__word">{{ copy.reFlux }}<span class="site-brand__period">.</span></span>
        </RouterLink>

        <nav id="primary-navigation" class="site-navigation" :class="{ 'site-navigation--open': mobileMenuOpen }" :aria-label="copy.mainNavigationAriaLabel">
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="site-navigation__link"
            :class="{ 'site-navigation__link--active': isActive(item.to) }"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            @click="mobileMenuOpen = false"
          >
            <UiIcon :icon="item.icon" class="site-navigation__icon" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>

        <div class="site-header__actions">
          <a class="site-github-link" href="https://github.com/iamcodex96/re-flux" target="_blank" rel="noreferrer noopener" :aria-label="copy.staticText.githubAriaLabel" :title="copy.githubSource">
            <UiIcon icon="mdi-github" />
          </a>
          <button
            class="site-menu-toggle"
            type="button"
            :aria-expanded="mobileMenuOpen"
            aria-controls="primary-navigation"
            :aria-label="mobileMenuOpen ? copy.staticText.closeNavigation : copy.staticText.openNavigation"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <UiIcon :icon="mobileMenuOpen ? 'mdi-close' : 'mdi-menu'" />
          </button>
        </div>
      </div>
    </header>

    <main id="main-content" class="site-main" :class="{ 'docs-main': isDocsRoute }" tabindex="-1">
      <RouterView />
    </main>

    <footer v-if="!isDocsRoute" class="site-footer">
      <div class="site-footer__inner">
        <div class="site-footer__top">
          <div class="site-footer__brand-column">
            <RouterLink to="/" class="site-brand site-footer__brand" :aria-label="copy.homeAriaLabel">
              <span class="site-brand__mark" aria-hidden="true"><span>{{ copy.re }}</span></span>
              <span class="site-brand__word">{{ copy.reFlux }}<span class="site-brand__period">.</span></span>
            </RouterLink>
            <p>{{ copy.reactiveMotionArchitectureForInterfacesGraphicsAndd28742 }}</p>
            <div class="site-footer__badges"><span>{{ copy.strictTypeScript }}</span><span>{{ copy.rxjs78 }}</span><span>{{ copy.mitLicense }}</span></div>
          </div>

          <div class="site-footer__group">
            <h2>{{ copy.engine }}</h2>
            <RouterLink to="/visuals">{{ copy.visualLab }}</RouterLink>
            <RouterLink to="/playground">{{ copy.playground }}</RouterLink>
            <RouterLink to="/benchmarks">{{ copy.benchmarkLab }}</RouterLink>
            <RouterLink to="/docs/rendering">{{ copy.renderAdapters }}</RouterLink>
          </div>

          <div class="site-footer__group">
            <h2>{{ copy.resources }}</h2>
            <RouterLink to="/docs/introduction">{{ copy.documentation }}</RouterLink>
            <RouterLink to="/docs/streams">{{ copy.reactiveStreams }}</RouterLink>
            <RouterLink to="/docs/interactions">{{ copy.springDynamics }}</RouterLink>
          </div>

          <div class="site-footer__group">
            <h2>{{ copy.connect }}</h2>
            <a href="https://github.com/iamcodex96/re-flux" target="_blank" rel="noreferrer noopener">{{ copy.githubSource }} <span aria-hidden="true">↗</span></a>
            <a href="https://www.npmjs.com/package/@re-code/flux" target="_blank" rel="noreferrer noopener">{{ copy.npmRegistry }} <span aria-hidden="true">↗</span></a>
            <a href="https://github.com/iamcodex96/re-flux/issues" target="_blank" rel="noreferrer noopener">{{ copy.reportAnIssue }} <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div class="site-footer__bottom">
          <span>© {{ currentYear }} {{ copy.reFluxReleasedUnderMIT }}</span>
          <span>{{ copy.builtWithTypeScriptRxJSVue }}</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss" src="./styles/components/app.scss"></style>
