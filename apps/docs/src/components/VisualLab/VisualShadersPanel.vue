<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { MotionPreferences } from '@lib';
import VisualLabShaderPreview from './VisualLabShaderPreview.vue';
import type { VisualLabShaderKind } from './visualLabTypes';

const preferences = new MotionPreferences();
const activeShader = ref<VisualLabShaderKind>('dispersion');
const reducedMotion = ref(preferences.snapshot.reducedMotion);
const preferenceSubscription = preferences.state$.subscribe((state) => { reducedMotion.value = state.reducedMotion; });
const shaders: readonly { id: VisualLabShaderKind; title: string; category: string; description: string }[] = [
  { id: 'dispersion', title: 'Chromatic dispersion', category: 'COLOR SEPARATION', description: 'Independent spectral channels form a moving interference field. This is a WebGL fragment-shader demo rather than a published re;Flux GPU adapter.' },
  { id: 'shader-aurora', title: 'Aurora interference', category: 'WAVE INTERFERENCE', description: 'Two moving bands blend cyan and violet light, reacting to the pointer position in the shader canvas.' },
  { id: 'shader-spectrum', title: 'Spectral refraction', category: 'RADIAL SPECTRUM', description: 'Radial interference and pointer offset demonstrate a simple uniform-driven shader effect.' },
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
    <div class="visual-shaders-panel__eyebrow">EXPERIMENTAL GPU / WEBGL</div>
    <div class="visual-shaders-panel__heading">
      <div>
        <h1>Shaders &amp; uniforms</h1>
        <p>re;Flux animates the data; WebGL renders the pixels. These standalone experiments use a Tween value stream to drive a fragment-shader time uniform.</p>
      </div>
      <span class="visual-shaders-panel__status"><i /> {{ reducedMotion ? 'STATIC MOTION PREFERENCE' : 'LIVE UNIFORM STREAM' }}</span>
    </div>

    <div class="visual-shaders-panel__selector" role="group" aria-label="Choose shader experiment">
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

    <section class="visual-shaders-panel__stage" :aria-label="`${selected.title} live shader preview`">
      <div class="visual-shaders-panel__stage-meta">
        <span><i /> WEBGL FRAGMENT STAGE</span>
        <span>{{ selected.id }}.glsl</span>
      </div>
      <VisualLabShaderPreview :key="activeShader" :kind="activeShader" :active="true" :preferences="preferences" />
      <div class="visual-shaders-panel__stage-caption">
        <div><span>{{ selected.category }}</span><h2>{{ selected.title }}</h2><p>{{ selected.description }}</p></div>
        <span class="visual-shaders-panel__stage-tag">POINTER + TIME UNIFORMS</span>
      </div>
    </section>

    <section class="visual-shaders-panel__code" aria-labelledby="shader-code-title">
      <div class="visual-shaders-panel__code-header">
        <div><span class="visual-shaders-panel__eyebrow">TYPESCRIPT BINDING</span><h2 id="shader-code-title">Animate a uniform with re;Flux</h2></div>
        <button type="button" @click="copySnippet">{{ copied ? 'Copied' : copyFailed ? 'Clipboard unavailable' : 'Copy snippet' }}</button>
      </div>
      <pre><code>{{ snippet }}</code></pre>
      <p>Example binding shown for explanation. Each preview in this lab is a standalone WebGL implementation; it does not add a GPU adapter dependency to the re;Flux core.</p>
    </section>
  </main>
</template>
