<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { useTheme } from 'vuetify';
import { useAppStore } from './stores/app';

const route = useRoute();
const theme = useTheme();
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.navigation);
const isDark = computed(() => theme.global.current.value.dark);
const navigation = computed(() => [
  { label: copy.value.documentation, icon: 'mdi-book-open-page-variant', to: '/docs' },
]);
const isDocsRoute = computed(() => route.path.startsWith('/docs'));

function persistTheme(name: string): void {
  try {
    window.localStorage.setItem('re-flux-theme', name);
  } catch {
    // Theme switching still works if storage is disabled by the browser.
  }
}

function toggleTheme(): void {
  theme.global.name.value = isDark.value ? 'rxLight' : 'rxDark';
  persistTheme(theme.global.name.value);
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

watch(() => theme.global.current.value.colors.background, (background) => {
  if (typeof document === 'undefined' || typeof background !== 'string') return;
  const themeName = isDark.value ? 'dark' : 'light';
  document.documentElement.dataset.rxTheme = themeName;
  document.documentElement.style.colorScheme = themeName;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
  }
  meta.content = background;
}, { immediate: true });

onMounted(() => {
  let savedTheme: string | null = null;
  try {
    savedTheme = window.localStorage.getItem('re-flux-theme');
  } catch {
    // Fall back to the operating-system preference when storage is unavailable.
  }

  if (savedTheme === 'rxDark' || savedTheme === 'rxLight') {
    theme.global.name.value = savedTheme;
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    theme.global.name.value = 'rxLight';
  }
});

watch(() => route.fullPath, async () => {
  await nextTick();
  document.getElementById('main-content')?.focus({ preventScroll: true });
}, { flush: 'post' });
</script>

<template>
  <v-app :class="isDark ? 'rx-theme--dark' : 'rx-theme--light'">
    <a class="skip-link" href="#main-content" @click.prevent="skipToMainContent">{{ copy.skipToMainContent }}</a>

    <v-app-bar flat height="68" color="background" class="site-app-bar">
      <div class="site-app-bar__inner">
        <RouterLink to="/" class="site-brand" :aria-label="copy.homeAriaLabel">
          <span class="site-brand__mark" aria-hidden="true">re;</span>
          <span class="site-brand__word">Flux<span class="site-brand__period">.</span></span>
        </RouterLink>

        <div class="site-app-bar__actions">
          <nav class="site-navigation" :aria-label="copy.mainNavigationAriaLabel">
            <v-btn
              v-for="item in navigation"
              :key="item.to"
              :to="item.to"
              :active="item.to === '/docs' ? isDocsRoute : route.path === item.to"
              :aria-current="(item.to === '/docs' ? isDocsRoute : route.path === item.to) ? 'page' : undefined"
              :aria-label="item.label"
              :title="item.label"
              variant="text"
              color="primary"
              rounded="lg"
              size="small"
              class="site-navigation__link"
            >
              <v-icon class="site-navigation__icon" size="17" :icon="item.icon" />
              <span class="site-navigation__label">{{ item.label }}</span>
            </v-btn>
          </nav>

          <v-divider vertical class="site-app-bar__divider" />

          <v-btn
            icon
            variant="text"
            rounded="lg"
            size="small"
            class="site-theme-toggle"
            :aria-label="isDark ? copy.switchToLightTheme : copy.switchToDarkTheme"
            :title="isDark ? copy.switchToLightTheme : copy.switchToDarkTheme"
            :aria-pressed="isDark"
            @click="toggleTheme"
          >
            <v-icon>{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
          </v-btn>
        </div>
      </div>
    </v-app-bar>

    <v-main :class="{ 'docs-main': isDocsRoute }">
      <main id="main-content" tabindex="-1" :class="{ 'docs-main-content': isDocsRoute }">
        <RouterView />
      </main>
      <v-footer v-if="!isDocsRoute" border="t" color="background" class="py-4 px-4 px-md-8">
        <v-container class="d-flex flex-column flex-sm-row align-start align-sm-center justify-space-between ga-3 px-0" max-width="1240">
          <span class="text-body-2 text-medium-emphasis"><strong class="text-high-emphasis">Flux</strong> · {{ copy.footerTagline }}</span>
          <div class="d-flex flex-wrap align-center ga-2 text-caption text-medium-emphasis">
            <span>{{ copy.strictTypeScript }}</span><v-icon aria-hidden="true" size="5" color="secondary">mdi-circle</v-icon>
            <span>{{ copy.vue }}</span><v-icon aria-hidden="true" size="5" color="secondary">mdi-circle</v-icon>
            <span>{{ copy.rxjs }}</span><v-icon aria-hidden="true" size="5" color="secondary">mdi-circle</v-icon>
            <span>{{ copy.vuetify }}</span>
          </div>
        </v-container>
      </v-footer>
    </v-main>
  </v-app>
</template>

<style scoped>
.site-app-bar {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-background), 0.88) !important;
  backdrop-filter: blur(18px) saturate(1.2);
}
.site-app-bar :deep(.v-toolbar__content) {
  box-sizing: border-box;
  width: 100%;
  height: 68px !important;
  min-height: 68px;
  padding: 0 !important;
  display: flex;
  align-items: center;
}
.site-app-bar__inner {
  box-sizing: border-box;
  width: 100%;
  max-width: 1280px;
  height: 100%;
  flex: 1 1 auto;
  min-width: 0;
  margin-inline: auto;
  padding-inline: clamp(14px, calc((100vw - 1240px) / 2), 40px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.site-brand { display: inline-flex; align-items: center; gap: 10px; flex: 0 0 auto; text-decoration: none; color: rgb(var(--v-theme-on-background)); white-space: nowrap; }
.site-brand__mark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary)); font-family: var(--rx-font-mono), monospace; font-size: 13px; font-weight: 700; box-shadow: 0 4px 16px rgba(var(--v-theme-primary), .2); }
.site-brand__word { font-size: 1rem; font-weight: 800; letter-spacing: -.04em; }
.site-brand__period { color: rgb(var(--v-theme-secondary)); }
.site-app-bar__actions { display: flex; flex: 0 0 auto; align-items: center; justify-content: flex-end; min-width: 0; gap: 10px; }
.site-navigation { display: flex; flex: 0 0 auto; align-items: center; gap: 4px; }
.site-navigation__link { min-width: 0; padding-inline: 13px !important; font-size: .8125rem; font-weight: 650; white-space: nowrap; }
.site-navigation__link :deep(.v-btn__overlay) { opacity: 0; }
.site-navigation__link.v-btn--active { background: rgba(var(--v-theme-primary), .12); color: rgb(var(--v-theme-primary)) !important; }
.site-navigation__link.v-btn--active::after { content: ''; position: absolute; inset: auto 13px -2px; height: 2px; border-radius: 2px; background: rgb(var(--v-theme-primary)); }
.site-navigation__icon { display: none; }
.site-app-bar__divider { height: 24px; opacity: .7; }
.site-theme-toggle { flex: 0 0 auto; width: 38px; height: 38px; }

@media (max-width: 600px) {
  .site-app-bar__inner { padding-inline: 14px; gap: 12px; }
  .site-app-bar__actions { gap: 7px; }
  .site-navigation { gap: 1px; }
  .site-navigation__link { padding-inline: 10px !important; }
}
@media (max-width: 410px) {
  .site-app-bar__inner { padding-inline: 10px; gap: 8px; }
  .site-brand { gap: 7px; }
  .site-brand__mark { width: 30px; height: 30px; }
  .site-brand__word { font-size: .9rem; }
  .site-navigation__link { width: 36px; min-width: 36px !important; padding: 0 !important; }
  .site-navigation__label { display: none; }
  .site-navigation__icon { display: inline-flex; }
  .site-app-bar__actions { gap: 5px; }
  .site-app-bar__divider { margin-inline: 1px; }
}
</style>
