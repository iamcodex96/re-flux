<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '../stores/app';
import LandingMotionShowcase from '../components/LandingMotionShowcase.vue';
import LandingHeroVisual from '../components/LandingHeroVisual.vue';
import LandingCapabilitiesShowcase from '../components/LandingCapabilitiesShowcase.vue';

const store = useAppStore();
const copy = computed(() => store.app.view.home);
</script>

<template>
  <v-container class="home-page py-10 py-md-16" max-width="1240">
    <v-row align="center" class="home-hero mb-12 mb-md-16" :dense="false">
      <v-col cols="12" md="6" class="pr-md-10">
        <div class="text-overline text-primary d-flex align-center ga-2 mb-4">
          <v-icon size="10" color="secondary">mdi-circle</v-icon>
          {{ copy.eyebrow }}
        </div>
        <h1 class="text-h2 text-md-h1 font-weight-black mb-5 home-hero__title">
          {{ copy.titleLine }}<br /><span class="text-primary">{{ copy.titleAccent }}</span>
        </h1>
        <p class="text-body-1 text-medium-emphasis mb-7 home-hero__description">{{ copy.description }}</p>
        <div class="d-flex flex-wrap ga-3 mb-8">
          <v-btn color="primary" variant="flat" to="/docs" append-icon="mdi-arrow-right">{{ copy.exploreApi }}</v-btn>
          <v-btn color="secondary" variant="outlined" to="/playground/gestures">{{ copy.tryMotion }}</v-btn>
          <v-btn variant="text" color="primary" to="/visuals" append-icon="mdi-arrow-top-right">Explore visual lab</v-btn>
        </div>
        <v-row dense>
          <v-col v-for="stat in copy.stats" :key="stat.title" cols="auto" class="pr-6">
            <div class="text-body-2 font-weight-bold">{{ stat.title }}</div>
            <div class="text-caption text-medium-emphasis mt-1">{{ stat.caption }}</div>
          </v-col>
        </v-row>
      </v-col>
      <v-col cols="12" md="6" class="mt-8 mt-md-0">
        <LandingHeroVisual />
      </v-col>
    </v-row>

    <LandingMotionShowcase />
    <LandingCapabilitiesShowcase />

    <v-row align="end" class="mb-6">
      <v-col cols="12" md="8">
        <div id="playgrounds" class="text-overline text-primary mb-2">{{ copy.playgroundEyebrow }}</div>
        <h2 class="text-h4 font-weight-bold mb-3">{{ copy.playgroundTitle }}</h2>
        <p class="text-body-1 text-medium-emphasis mb-0 home-playground-description">{{ copy.playgroundDescription }}</p>
      </v-col>
    </v-row>

    <v-row class="mb-12">
      <v-col v-for="feature in copy.features" :key="feature.title" cols="12" sm="6" md="6" lg="4">
        <v-card :to="feature.to" variant="outlined" height="100%" class="home-feature-card">
          <v-card-text class="pa-5 pa-md-6">
            <div class="d-flex align-center justify-space-between mb-5">
              <v-chip size="small" color="primary" variant="tonal">{{ feature.index }}</v-chip>
              <v-icon :icon="feature.icon" size="26" color="secondary" />
            </div>
            <h3 class="text-h5 font-weight-bold pa-0 ma-0">{{ feature.title }}</h3>
            <p class="text-body-2 text-medium-emphasis mt-3 mb-5 home-feature-card__description">{{ feature.description }}</p>
            <div class="d-flex align-center text-primary text-body-2 font-weight-bold ga-2">{{ feature.link }}<v-icon size="16">mdi-arrow-right</v-icon></div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card variant="tonal" color="primary" class="overflow-hidden home-code-callout">
      <v-card-text class="pa-5 pa-md-8">
        <v-row align="center">
          <v-col cols="12" md="5">
            <div class="text-overline mb-2">{{ copy.ctaEyebrow }}</div>
            <h2 class="text-h4 font-weight-bold">{{ copy.ctaTitleLineOne }}<br />{{ copy.ctaTitleLineTwo }}</h2>
          </v-col>
          <v-col cols="12" md="7">
            <pre class="home-code pa-4 rounded-lg"><code>{{ copy.codeExample }}</code></pre>
          </v-col>
          <v-col cols="12">
            <v-btn color="primary" variant="flat" to="/docs" append-icon="mdi-arrow-right">{{ copy.ctaButton }}</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<style scoped>
.home-hero__title { letter-spacing: -.06em; line-height: 1.05; }
.home-hero__description { max-width: 540px; line-height: 1.85; }
.home-playground-description { max-width: 78ch; line-height: 1.75; }
.home-feature-card { min-width: 0; height: 100%; border-radius: 8px; transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease; }
.home-feature-card:hover { border-color: rgba(var(--v-theme-primary), .62); transform: translateY(-3px); box-shadow: 0 12px 36px rgba(var(--v-theme-primary), .08); }
.home-feature-card__description { min-height: 4.5em; line-height: 1.75; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .home-feature-card { transition: none; } .home-feature-card:hover { transform: none; } }
</style>
