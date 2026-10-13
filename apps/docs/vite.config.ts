import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 're-flux';
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? `/${repositoryName}/` : '/');

export default defineConfig({
  base,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: [
      { find: '@lib/dom', replacement: fileURLToPath(new URL('../../src/adapters/dom.ts', import.meta.url)) },
      { find: '@lib/svg', replacement: fileURLToPath(new URL('../../src/adapters/svg.ts', import.meta.url)) },
      { find: '@lib/canvas', replacement: fileURLToPath(new URL('../../src/adapters/canvas.ts', import.meta.url)) },
      { find: '@lib/three', replacement: fileURLToPath(new URL('../../src/adapters/three.ts', import.meta.url)) },
      { find: '@lib/effects/canvas', replacement: fileURLToPath(new URL('../../src/effects/canvas.ts', import.meta.url)) },
      { find: '@demos/canvas', replacement: fileURLToPath(new URL('./src/demos/canvas/index.ts', import.meta.url)) },
      { find: '@lib', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    ],
  },
});
