<script setup lang="ts">
import { useAppStore } from '../../stores/app';
import { computed, onBeforeUnmount, ref } from 'vue';
import { MotionPreferences } from '@lib';
import VisualLabShaderPreview from './VisualLabShaderPreview.vue';
import type { VisualLabShaderKind } from './visualLabTypes';


const appStore = useAppStore();
const copy = computed(() => appStore.app.view.visualShadersPanel);
const preferences = new MotionPreferences();
const activeShader = ref<VisualLabShaderKind>('dispersion');
const reducedMotion = ref(preferences.snapshot.reducedMotion);
const preferenceSubscription = preferences.state$.subscribe((state) => { reducedMotion.value = state.reducedMotion; });
const shaders: readonly { id: VisualLabShaderKind; title: string; category: string; description: string }[] = [
  { id: 'dispersion', title: copy.value.staticText.chromaticDispersion, category: 'COLOR SEPARATION', description: copy.value.staticText.independentSpectralChannelsFormAMovingInterference4483fe },
  { id: 'shader-aurora', title: copy.value.staticText.auroraInterference, category: 'WAVE INTERFERENCE', description: copy.value.staticText.twoMovingBandsBlendCyanAndViolet192ad4 },
  { id: 'shader-spectrum', title: copy.value.staticText.spectralRefraction, category: 'RADIAL SPECTRUM', description: copy.value.staticText.radialInterferenceAndPointerOffsetDemonstrateA87b4ff },
];
const selected = computed(() => shaders.find((shader) => shader.id === activeShader.value) ?? shaders[0]!);
const snippet = computed(() => `import { Tween } from '@re-code/flux';

// Call after your WebGL program and geometry are ready.
export function animateShaderTime(gl: WebGLRenderingContext, program: WebGLProgram) {
  const uTime = gl.getUniformLocation(program, 'u_time');
  const clock = new Tween({
    from: 0,
    to: Math.PI * 2,
    duration: 4800,
    easing: 'linear',
    repeat: Infinity,
  });

  const subscription = clock.value$.subscribe((time) => {
    if (uTime === null) return;
    gl.useProgram(program);
    gl.uniform1f(uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  });
  void clock.play().catch(() => undefined);

  return () => {
    subscription.unsubscribe();
    clock.stop();
  };
}`);
const copied = ref(false);
const copyFailed = ref(false);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

async function copySnippet(): Promise<void> {
  copied.value = false;
  copyFailed.value = false;
  try {
    await navigator.clipboard.writeText(snippet.value);
    copied.value = true;
  } catch {
    copyFailed.value = true;
  }
  if (feedbackTimer !== null) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    copied.value = false;
    copyFailed.value = false;
    feedbackTimer = null;
  }, 2000);
}

onBeforeUnmount(() => {
  preferenceSubscription.unsubscribe();
  preferences.destroy();
  if (feedbackTimer !== null) clearTimeout(feedbackTimer);
});
</script>

<template>
  <main class="visual-shaders-panel">
    <div class="visual-shaders-panel__eyebrow">{{ copy.staticText.experimentalGPUWEBGL }}</div>
    <div class="visual-shaders-panel__heading">
      <div>
        <h1>{{ copy.staticText.shadersUniforms }}</h1>
        <p>{{ copy.staticText.reFluxAnimatesTheDataWebGLRendersd2228b }}</p>
      </div>
      <span class="visual-shaders-panel__status"><i /> {{ reducedMotion ? copy.staticText.staticMotionPreference : copy.staticText.liveUniformStream }}</span>
    </div>

    <div class="visual-shaders-panel__selector" role="group" :aria-label="copy.staticText.chooseShaderExperiment">
      <button
        v-for="shader in shaders"
        :key="shader.id"
        type="button"
        :class="{ 'is-active': activeShader === shader.id }"
        :aria-pressed="activeShader === shader.id"
        @click="activeShader = shader.id"
      >
        <span>{{ shader.category }}</span>
        <strong>{{ shader.title }}</strong>
      </button>
    </div>

    <section class="visual-shaders-panel__stage" :aria-label="copy.staticText.liveShaderPreviewAriaLabel.replace('{title}', selected.title)">
      <div class="visual-shaders-panel__stage-meta">
        <span><i /> {{ copy.staticText.webglFRAGMENTSTAGE }}</span>
        <span>{{ selected.id }}{{ copy.staticText.glsl }}</span>
      </div>
      <VisualLabShaderPreview :key="activeShader" :kind="activeShader" :active="true" :preferences="preferences" />
      <div class="visual-shaders-panel__stage-caption">
        <div><span>{{ selected.category }}</span><h2>{{ selected.title }}</h2><p>{{ selected.description }}</p></div>
        <span class="visual-shaders-panel__stage-tag">{{ copy.staticText.pointerTIMEUNIFORMS }}</span>
      </div>
    </section>

    <section class="visual-shaders-panel__code" aria-labelledby="shader-code-title">
      <div class="visual-shaders-panel__code-header">
        <div><span class="visual-shaders-panel__eyebrow">{{ copy.staticText.typescriptBINDING }}</span><h2 id="shader-code-title">{{ copy.staticText.animateAUniformWithReFlux }}</h2></div>
        <button type="button" @click="copySnippet">{{ copied ? copy.staticText.copied : copyFailed ? copy.staticText.clipboardUnavailable : copy.staticText.copySnippet }}</button>
      </div>
      <pre><code>{{ snippet }}</code></pre>
      <p>{{ copy.staticText.exampleBindingShownForExplanationEachPreviewdefc87 }}</p>
    </section>
  </main>
</template>
