<script setup lang="ts">
import roadmap from '../data/roadmap.json';

const { features, principles } = roadmap;
</script>

<template>
  <v-container max-width="1240" class="py-8 py-md-12 px-4 px-md-8">
    <v-row align="center" class="mb-10" dense>
      <v-col cols="12" md="8">
        <div class="text-overline text-primary mb-2">PRODUCT DIRECTION</div>
        <h1 class="text-h4 text-md-h3 font-weight-bold mb-3">The re;Flux roadmap<span class="text-primary">.</span></h1>
        <p class="text-body-1 text-medium-emphasis" style="max-width: 760px">
          {{ roadmap.overview }}
        </p>
        <v-btn class="mt-4" to="/api" color="primary" variant="flat" append-icon="mdi-arrow-right">Explore keyframes & DOM API</v-btn>
      </v-col>
      <v-col cols="12" md="4" class="d-flex justify-md-end mt-4 mt-md-0">
        <v-chip color="secondary" variant="tonal" prepend-icon="mdi-map-outline">{{ roadmap.statusBadge }}</v-chip>
      </v-col>
    </v-row>

    <v-row class="mb-10">
      <v-col v-for="principle in principles" :key="principle.title" cols="12" sm="6" md="3">
        <v-card variant="tonal" color="surface-variant" rounded="lg" height="100%">
          <v-card-text class="pa-4">
            <div class="text-subtitle-1 font-weight-bold mb-2">{{ principle.title }}</div>
            <p class="text-body-2 text-medium-emphasis">{{ principle.text }}</p>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row>
      <v-col v-for="feature in features" :key="feature.number" cols="12" lg="6">
        <v-card variant="outlined" rounded="lg" height="100%">
          <v-card-text class="pa-4 pa-md-6">
            <div class="d-flex align-start ga-3 mb-4">
              <v-avatar color="primary" variant="tonal" size="48" rounded="lg">
                <v-icon :icon="feature.icon" size="24" />
              </v-avatar>
              <div class="flex-grow-1">
                <div class="d-flex align-center flex-wrap ga-2 mb-1">
                  <span class="text-overline text-medium-emphasis">FEATURE {{ feature.number }}</span>
                  <v-chip size="x-small" :color="feature.status.toLowerCase().includes('planned') ? 'warning' : feature.status.toLowerCase().includes('implemented') ? 'success' : 'default'" variant="tonal">{{ feature.status }}</v-chip>
                </div>
                <h2 class="text-h6 text-md-h5 font-weight-bold">{{ feature.title }}</h2>
              </div>
            </div>
            <p class="text-body-2 mb-5">{{ feature.summary }}</p>

            <v-row dense class="mb-4">
              <v-col cols="12" sm="6">
                <v-sheet rounded="lg" color="surface-variant" class="pa-3 h-100">
                  <div class="text-overline text-medium-emphasis mb-1">PROBLEM</div>
                  <p class="text-body-2">{{ feature.problem }}</p>
                </v-sheet>
              </v-col>
              <v-col cols="12" sm="6">
                <v-sheet rounded="lg" color="surface-variant" class="pa-3 h-100">
                  <div class="text-overline text-medium-emphasis mb-1">DIRECTION</div>
                  <p class="text-body-2">{{ feature.approach }}</p>
                </v-sheet>
              </v-col>
            </v-row>

            <div class="text-overline text-primary mb-2">{{ feature.status.toLowerCase().includes('implemented') && feature.status.toLowerCase().includes('planned') ? 'IMPLEMENTED API / FOLLOW-UP PLANNED' : feature.status.toLowerCase().includes('planned') ? 'PROPOSED API' : 'API / USAGE EXAMPLE' }}</div>
            <v-card variant="tonal" color="surface-variant" class="mb-5" rounded="lg">
              <pre class="pa-4 text-body-2 overflow-x-auto"><code>{{ feature.api }}</code></pre>
            </v-card>

            <div class="text-subtitle-2 font-weight-bold mb-2">Acceptance criteria</div>
            <v-list density="compact" class="bg-transparent pa-0">
              <v-list-item v-for="criterion in feature.criteria" :key="criterion" prepend-icon="mdi-check-circle-outline" class="px-0" min-height="36">
                <v-list-item-title class="text-body-2 text-wrap">{{ criterion }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-card variant="tonal" color="primary" rounded="lg" class="mt-8">
      <v-card-text class="pa-5 pa-md-7">
        <div class="text-overline mb-2">IMPLEMENTATION ORDER</div>
        <h2 class="text-h5 font-weight-bold mb-3">{{ roadmap.implementationHeading }}</h2>
        <p class="text-body-2 mb-4" style="max-width: 850px">{{ roadmap.implementationSummary }}</p>
        <v-list density="compact" class="bg-transparent pa-0">
          <v-list-item v-for="step in roadmap.implementationOrder" :key="step.id" prepend-icon="mdi-arrow-right-circle-outline" class="px-0" min-height="48">
            <v-list-item-title class="text-body-2 font-weight-medium text-wrap">{{ step.title }}</v-list-item-title>
            <v-list-item-subtitle class="text-wrap">{{ step.detail }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
        <v-btn class="mt-4" color="primary" variant="flat" href="https://rxjs.dev/api/index/const/animationFrameScheduler" target="_blank" rel="noreferrer" append-icon="mdi-open-in-new">
          RxJS frame scheduler reference
        </v-btn>
      </v-card-text>
    </v-card>
  </v-container>
</template>
