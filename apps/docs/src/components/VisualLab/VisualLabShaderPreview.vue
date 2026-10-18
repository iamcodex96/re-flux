<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Tween, type MotionPreferences } from '@lib';
import type { ShaderPreviewKind } from './visualLabTypes';

type UniformLocationSet = {
  time: WebGLUniformLocation | null;
  resolution: WebGLUniformLocation | null;
  pointer: WebGLUniformLocation | null;
};

const props = defineProps<{
  kind: ShaderPreviewKind;
  active: boolean;
  preferences: MotionPreferences;
}>();

const root = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const webglUnavailable = ref(false);
const fallbackReason = ref('');
const reducedMotion = ref(props.preferences.snapshot.reducedMotion);
const pointer = { x: 0.5, y: 0.5 };

let gl: WebGLRenderingContext | null = null;
let contextForCleanup: WebGLRenderingContext | null = null;
let initializationAttempted = false;
let program: WebGLProgram | null = null;
let buffer: WebGLBuffer | null = null;
let uniforms: UniformLocationSet = { time: null, resolution: null, pointer: null };
let timeTween: Tween<number> | null = null;
let timeSubscription: { unsubscribe(): void } | null = null;
let preferenceSubscription: { unsubscribe(): void } | null = null;
let resizeObserver: ResizeObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let windowResize: (() => void) | null = null;
let currentTime = 0;

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

function fragmentShader(kind: ShaderPreviewKind): string {
  const common = `
precision mediump float;
varying vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform float u_time;
vec3 palette(float t) {
  vec3 a = vec3(0.015, 0.04, 0.09);
  vec3 b = vec3(0.03, 0.78, 0.91);
  vec3 c = vec3(0.63, 0.43, 1.0);
  vec3 d = vec3(0.2, 0.25, 0.55);
  return a + b * cos(6.28318 * (c * t + d));
}
`;

  const effects: Record<ShaderPreviewKind, string> = {
    dispersion: `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  float r = length(p);
  float a = atan(p.y, p.x);
  float wave = sin(r * 27.0 - u_time * 2.2 + sin(a * 4.0) * 0.8);
  float red = smoothstep(-0.25, 0.9, wave + sin(a * 2.0 + u_time) * 0.25);
  float green = smoothstep(-0.3, 0.85, sin(r * 25.0 - u_time * 2.0 + 0.8));
  float blue = smoothstep(-0.3, 0.85, sin(r * 23.0 - u_time * 1.8 + 1.7));
  vec3 color = vec3(red * 0.9, green * 0.8, blue);
  float ring = exp(-abs(wave) * 5.0) * 0.18;
  color += vec3(0.04, 0.65, 0.9) * ring;
  color *= 0.65 + 0.35 * (1.0 - smoothstep(0.15, 1.1, r));
  gl_FragColor = vec4(color, 1.0);
}`,
    'shader-fluid': `
float hash12(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise2d(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * noise2d(p);
    p = p * 2.02 + vec2(9.2, 4.7);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = v_uv;
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / max(u_resolution.y, 1.0), 1.0);
  float t = u_time;
  vec2 loopPhase = vec2(cos(t), sin(t));
  vec2 warp = vec2(
    fbm(p * 1.85 + loopPhase * 0.38),
    fbm(p * 1.85 + vec2(4.1, 2.3) + loopPhase.yx * 0.42)
  );
  float field = fbm(p * 2.25 + warp * 3.2 + loopPhase.yx * 0.18);
  float broad = fbm(p * 0.9 - warp * 1.15 + loopPhase * 0.15);
  float tealMask = smoothstep(0.24, 0.66, field + warp.x * 0.18);
  float violetMask = smoothstep(0.43, 0.78, broad + warp.y * 0.2);
  vec3 deep = vec3(0.004, 0.012, 0.022);
  vec3 teal = vec3(0.005, 0.24, 0.31);
  vec3 blue = vec3(0.015, 0.10, 0.22);
  vec3 violet = vec3(0.11, 0.065, 0.30);
  vec3 color = deep;
  color = mix(color, teal, tealMask * 0.85);
  color = mix(color, blue, smoothstep(0.33, 0.72, field + warp.y * 0.22) * 0.75);
  color = mix(color, violet, violetMask * 0.72);
  float contour = 1.0 - smoothstep(0.015, 0.055, abs(fract(field * 7.0) - 0.5));
  float fineContour = 1.0 - smoothstep(0.012, 0.04, abs(fract(broad * 6.0) - 0.5));
  color += vec3(0.025, 0.17, 0.22) * contour * 0.44;
  color += vec3(0.26, 0.12, 0.55) * fineContour * 0.24;
  float specular = pow(max(0.0, 1.0 - abs(field - broad)), 6.0);
  color += vec3(0.035, 0.32, 0.4) * specular * 0.28;
  float vignette = 1.0 - smoothstep(0.28, 0.9, length(p * vec2(0.72, 1.0)));
  color *= 0.55 + vignette * 0.45;
  float pointerGlow = exp(-length(uv - u_pointer) * 4.0) * 0.035;
  color += vec3(0.02, 0.22, 0.30) * pointerGlow;
  gl_FragColor = vec4(color, 1.0);
}`,
    'shader-aurora': `
void main() {
  vec2 p = v_uv;
  float t = u_time * 0.35;
  float waveA = sin(p.x * 7.0 + t) * 0.16 + sin(p.x * 15.0 - t * 0.7) * 0.05;
  float waveB = cos(p.x * 4.5 - t * 1.1) * 0.12;
  float band = (1.0 - smoothstep(0.0, 0.22, abs(p.y - 0.55 - waveA)));
  float band2 = (1.0 - smoothstep(0.0, 0.16, abs(p.y - 0.37 - waveB)));
  vec3 base = vec3(0.015, 0.02, 0.045);
  vec3 color = base;
  color += vec3(0.05, 0.8, 0.62) * band;
  color += vec3(0.36, 0.24, 0.98) * band2;
  color += vec3(0.04, 0.25, 0.62) * band * band2;
  float glow = exp(-length(p - u_pointer) * 2.2) * 0.15;
  color += vec3(0.1, 0.65, 1.0) * glow;
  gl_FragColor = vec4(color, 1.0);
}`,
    'shader-spectrum': `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
  vec2 pointerOffset = (u_pointer - 0.5) * 0.9;
  float d = length(p - pointerOffset);
  float rings = 0.5 + 0.5 * sin(d * 45.0 - u_time * 3.1);
  float envelope = exp(-d * 2.5);
  float bars = abs(sin(atan(p.y, p.x) * 22.0 + d * 6.0));
  vec3 color = vec3(0.012, 0.02, 0.045);
  color += palette(rings * 0.38 + bars * 0.16) * envelope * (0.24 + rings * 0.5);
  color += vec3(0.0, 0.65, 0.95) * pow(max(0.0, 1.0 - abs(rings - 0.5) * 5.0), 4.0) * 0.23;
  gl_FragColor = vec4(color, 1.0);
}`,
  };

  return common + (effects[kind] ?? effects.dispersion);
}

function compileShader(context: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = context.createShader(type);
  if (!shader) throw new Error('Could not allocate a WebGL shader.');
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    const message = context.getShaderInfoLog(shader) || 'Shader compilation failed.';
    context.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function initializeWebGL(): void {
  if (initializationAttempted || webglUnavailable.value) return;
  const element = canvas.value;
  if (!element) return;
  initializationAttempted = true;

  try {
    const context = element.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!context) throw new Error('WebGL is unavailable in this browser.');
    contextForCleanup = context;

    const vertexShader = compileShader(context, context.VERTEX_SHADER, VERTEX_SHADER);
    let pixelShader: WebGLShader | null = null;
    let nextProgram: WebGLProgram | null = null;
    let nextBuffer: WebGLBuffer | null = null;
    try {
      pixelShader = compileShader(context, context.FRAGMENT_SHADER, fragmentShader(props.kind));
      nextProgram = context.createProgram();
      if (!nextProgram) throw new Error('Could not allocate a WebGL program.');
      context.attachShader(nextProgram, vertexShader);
      context.attachShader(nextProgram, pixelShader);
      context.linkProgram(nextProgram);
      if (!context.getProgramParameter(nextProgram, context.LINK_STATUS)) {
        throw new Error(context.getProgramInfoLog(nextProgram) || 'Shader program linking failed.');
      }

      const position = context.getAttribLocation(nextProgram, 'a_position');
      nextBuffer = context.createBuffer();
      if (position < 0 || !nextBuffer) throw new Error('WebGL preview could not initialize its geometry.');
      context.bindBuffer(context.ARRAY_BUFFER, nextBuffer);
      context.bufferData(context.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), context.STATIC_DRAW);
      context.useProgram(nextProgram);
      context.enableVertexAttribArray(position);
      context.vertexAttribPointer(position, 2, context.FLOAT, false, 0, 0);

      const readyProgram = nextProgram;
      const readyBuffer = nextBuffer;
      gl = context;
      contextForCleanup = null;
      program = readyProgram;
      buffer = readyBuffer;
      uniforms = {
        time: context.getUniformLocation(readyProgram, 'u_time'),
        resolution: context.getUniformLocation(readyProgram, 'u_resolution'),
        pointer: context.getUniformLocation(readyProgram, 'u_pointer'),
      };
      nextProgram = null;
      nextBuffer = null;
      resize();
      draw(0);
    } finally {
      context.deleteShader(vertexShader);
      if (pixelShader) context.deleteShader(pixelShader);
      if (nextBuffer) context.deleteBuffer(nextBuffer);
      if (nextProgram) context.deleteProgram(nextProgram);
    }
  } catch (error) {
    resizeObserver?.disconnect();
    resizeObserver = null;
    contextForCleanup?.getExtension('WEBGL_lose_context')?.loseContext();
    contextForCleanup = null;
    webglUnavailable.value = true;
    fallbackReason.value = error instanceof Error ? error.message : 'WebGL preview is unavailable.';
  }
}

function resize(): void {
  const element = canvas.value;
  if (!element || !gl) return;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (element.width !== width || element.height !== height) {
    element.width = width;
    element.height = height;
  }
  gl.viewport(0, 0, width, height);
  draw(currentTime);
}

function draw(time: number): void {
  if (!gl || !program || !canvas.value) return;
  currentTime = time;
  gl.useProgram(program);
  if (uniforms.time) gl.uniform1f(uniforms.time, time);
  if (uniforms.resolution) gl.uniform2f(uniforms.resolution, canvas.value.width, canvas.value.height);
  if (uniforms.pointer) gl.uniform2f(uniforms.pointer, pointer.x, pointer.y);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function syncAnimation(): void {
  if (!timeTween) return;
  if (props.active) {
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    initializeWebGL();
    if (webglUnavailable.value || !gl) {
      timeTween.stop();
      return;
    }
    if (reducedMotion.value) {
      timeTween.stop();
      draw(0);
    } else {
      void timeTween.restart().catch(() => undefined);
    }
  } else {
    timeTween.stop();
    draw(0);
  }
}

function onPointerMove(event: PointerEvent): void {
  const element = canvas.value;
  if (!element || !gl) return;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  pointer.x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  pointer.y = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
  draw(currentTime);
}

watch(() => props.active, syncAnimation);

onMounted(() => {
  timeTween = new Tween({
    from: 0,
    to: Math.PI * 2,
    duration: 4800,
    easing: 'linear',
    repeat: Infinity,
    motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
  });
  timeSubscription = timeTween.value$.subscribe((time) => draw(time));
  preferenceSubscription = props.preferences.state$.subscribe((state) => {
    const changed = reducedMotion.value !== state.reducedMotion;
    reducedMotion.value = state.reducedMotion;
    if (changed) syncAnimation();
  });
  if (typeof ResizeObserver !== 'undefined' && canvas.value) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas.value);
  } else {
    windowResize = resize;
    window.addEventListener('resize', windowResize, { passive: true });
  }
  if (!props.active && typeof IntersectionObserver !== 'undefined' && root.value) {
    intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      initializeWebGL();
      draw(0);
      intersectionObserver?.disconnect();
      intersectionObserver = null;
    }, { rootMargin: '96px', threshold: 0.01 });
    intersectionObserver.observe(root.value);
  }
  syncAnimation();
});

onBeforeUnmount(() => {
  timeTween?.stop();
  timeSubscription?.unsubscribe();
  preferenceSubscription?.unsubscribe();
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  if (windowResize) window.removeEventListener('resize', windowResize);
  if (gl && buffer) gl.deleteBuffer(buffer);
  if (gl && program) gl.deleteProgram(program);
  // Release the browser's context slot promptly when its owning view unmounts.
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  contextForCleanup?.getExtension('WEBGL_lose_context')?.loseContext();
  contextForCleanup = null;
  buffer = null;
  program = null;
  gl = null;
  timeTween = null;
  timeSubscription = null;
  preferenceSubscription = null;
  resizeObserver = null;
  intersectionObserver = null;
  windowResize = null;
});
</script>

<template>
  <div ref="root" class="lab-shader-preview" :class="{ 'is-active': active, 'is-fallback': webglUnavailable }" aria-hidden="true">
    <canvas v-if="!webglUnavailable" ref="canvas" class="lab-shader-preview__canvas" @pointermove="onPointerMove" />
    <div v-else class="lab-shader-preview__fallback" :class="`lab-shader-preview__fallback--${kind}`">
      <span class="lab-shader-preview__fallback-orb" />
      <span class="lab-shader-preview__fallback-ring" />
      <span class="lab-shader-preview__fallback-label">CSS fallback</span>
    </div>
    <span v-if="webglUnavailable" class="lab-shader-preview__hint">{{ fallbackReason ? 'WEBGL UNAVAILABLE · FALLBACK ACTIVE' : 'FALLBACK ACTIVE' }}</span>
  </div>
</template>
