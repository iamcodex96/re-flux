<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useAppStore } from './stores/app';

type ThemeName = 'dark' | 'light';
const route = useRoute();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.navigation);
const themeName = ref<ThemeName>('dark');
const isDark = computed(() => themeName.value === 'dark');
const isHomeRoute = computed(() => route.path === '/');
const isDocsRoute = computed(() => route.path.startsWith('/docs'));
const isVisualRoute = computed(() => route.path.startsWith('/visuals'));
const isPlaygroundRoute = computed(() => route.path.startsWith('/playground'));
const mobileMenuOpen = ref(false);
const currentYear = new Date().getFullYear();

const navigation = [
  { label: 'Visual Lab', icon: 'mdi-flask-outline', to: '/visuals' },
  { label: 'Playground', icon: 'mdi-play-circle-outline', to: '/playground' },
  { label: 'Docs', icon: 'mdi-book-open-page-variant-outline', to: '/docs' },
];

function isActive(to: string): boolean {
  if (to === '/visuals') return isVisualRoute.value;
  if (to === '/playground') return isPlaygroundRoute.value;
  if (to === '/docs') return isDocsRoute.value;
  return route.path === to;
}

function persistTheme(name: ThemeName): void {
  try {
    window.localStorage.setItem('re-flux-theme', name);
  } catch {
    // Theme switching still works if browser storage is disabled.
  }
}

function applyTheme(name: ThemeName): void {
  themeName.value = name;
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.rxTheme = name;
  document.documentElement.style.colorScheme = name;

  const background = getComputedStyle(document.documentElement).getPropertyValue('--rx-theme-background').trim();
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = background ? `rgb(${background})` : (name === 'dark' ? '#0c0e13' : '#f7f8fc');
}

function toggleTheme(): void {
  const next = isDark.value ? 'light' : 'dark';
  applyTheme(next);
  persistTheme(next);
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

onMounted(() => {
  let savedTheme: string | null = null;
  try {
    savedTheme = window.localStorage.getItem('re-flux-theme');
  } catch {
    // Fall back to the operating-system preference when storage is unavailable.
  }

  if (savedTheme === 'dark' || savedTheme === 'light') {
    applyTheme(savedTheme);
  } else if (savedTheme === 'rxDark' || savedTheme === 'rxLight') {
    applyTheme(savedTheme === 'rxLight' ? 'light' : 'dark');
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    applyTheme('light');
  } else {
    applyTheme('dark');
  }
});

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
          <span class="site-brand__mark" aria-hidden="true"><span>re;</span></span>
          <span class="site-brand__word">re;Flux<span class="site-brand__period">.</span></span>
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
          <a class="site-github-link" href="https://github.com/iamcodex96/re-flux" target="_blank" rel="noreferrer noopener" aria-label="re;Flux on GitHub" title="GitHub">
            <UiIcon icon="mdi-github" />
          </a>
          <button
            v-if="!isHomeRoute"
            class="site-theme-toggle"
            type="button"
            :aria-label="isDark ? copy.switchToLightTheme : copy.switchToDarkTheme"
            :title="isDark ? copy.switchToLightTheme : copy.switchToDarkTheme"
            :aria-pressed="isDark"
            @click="toggleTheme"
          >
            <UiIcon :icon="isDark ? 'mdi-weather-sunny' : 'mdi-weather-night'" />
          </button>
          <button
            class="site-menu-toggle"
            type="button"
            :aria-expanded="mobileMenuOpen"
            aria-controls="primary-navigation"
            :aria-label="mobileMenuOpen ? 'Close navigation' : 'Open navigation'"
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
              <span class="site-brand__mark" aria-hidden="true"><span>re;</span></span>
              <span class="site-brand__word">re;Flux<span class="site-brand__period">.</span></span>
            </RouterLink>
            <p>Reactive motion architecture for interfaces, graphics, and interactive experiences.</p>
            <div class="site-footer__badges"><span>TypeScript 5.4+</span><span>RxJS 7.8+</span><span>MIT License</span></div>
          </div>

          <div class="site-footer__group">
            <h2>Engine</h2>
            <RouterLink to="/visuals">Visual Lab</RouterLink>
            <RouterLink to="/playground">Playground</RouterLink>
            <RouterLink to="/docs/rendering">Render adapters</RouterLink>
          </div>

          <div class="site-footer__group">
            <h2>Resources</h2>
            <RouterLink to="/docs/introduction">Documentation</RouterLink>
            <RouterLink to="/docs/streams">Reactive streams</RouterLink>
            <RouterLink to="/docs/interactions">Spring dynamics</RouterLink>
          </div>

          <div class="site-footer__group">
            <h2>Connect</h2>
            <a href="https://github.com/iamcodex96/re-flux" target="_blank" rel="noreferrer noopener">GitHub source <span aria-hidden="true">↗</span></a>
            <a href="https://www.npmjs.com/package/@re-code/flux" target="_blank" rel="noreferrer noopener">npm registry <span aria-hidden="true">↗</span></a>
            <a href="https://github.com/iamcodex96/re-flux/issues" target="_blank" rel="noreferrer noopener">Report an issue <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div class="site-footer__bottom">
          <span>© {{ currentYear }} re;Flux. Released under MIT.</span>
          <span>Built with TypeScript · RxJS · Vue</span>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss" src="./styles/components/app.scss"></style>
