import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const libraryPackage = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 're-flux';
const base = process.env.VITE_BASE_PATH ?? (process.env.GITHUB_ACTIONS ? `/${repositoryName}/` : '/');

export default defineConfig({
  base,
  plugins: [vue()],
  define: {
    __RE_FLUX_VERSION__: JSON.stringify(libraryPackage.version),
  },
  resolve: {
    alias: [
      { find: '@lib/dom', replacement: fileURLToPath(new URL('../../src/adapters/dom.ts', import.meta.url)) },
      { find: '@lib/svg', replacement: fileURLToPath(new URL('../../src/adapters/svg.ts', import.meta.url)) },
      { find: '@lib/canvas', replacement: fileURLToPath(new URL('../../src/adapters/canvas.ts', import.meta.url)) },
      { find: '@lib/three', replacement: fileURLToPath(new URL('../../src/adapters/three.ts', import.meta.url)) },
      { find: '@lib/steering', replacement: fileURLToPath(new URL('../../src/steering.ts', import.meta.url)) },
      { find: '@lib/flow-field', replacement: fileURLToPath(new URL('../../src/flowField.ts', import.meta.url)) },
      { find: '@lib/utils', replacement: fileURLToPath(new URL('../../src/utils.ts', import.meta.url)) },
      { find: '@lib/effects/canvas', replacement: fileURLToPath(new URL('../../src/effects/canvas.ts', import.meta.url)) },
      { find: '@demos/canvas', replacement: fileURLToPath(new URL('./src/demos/canvas/index.ts', import.meta.url)) },
      { find: '@lib', replacement: fileURLToPath(new URL('../../src/index.ts', import.meta.url)) },
    ],
  },
});
