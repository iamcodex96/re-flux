import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [packageSource, readme, home, gettingStarted, localeSource, docsView, viteConfig, workflow, publishingGuide, changelog, benchmarkGuide, benchmarkRunner, adaptersBenchmark] = await Promise.all([
  read('package.json'), read('README.md'), read('apps/docs/src/views/Home.vue'),
  read('apps/docs/src/components/DocsComponents/DocsGettingStarted.vue'),
  read('apps/docs/src/locales/en.json'), read('apps/docs/src/views/Docs.vue'), read('apps/docs/vite.config.ts'),
  read('.github/workflows/publish-npm.yml'), read('guidelines/PUBLISHING.md'), read('CHANGELOG.md'),
  read('benchmarks/README.md'), read('benchmarks/run-all.bench.mjs'), read('benchmarks/adapters.bench.mjs'),
]);
const packageJson = JSON.parse(packageSource);
const locale = JSON.parse(localeSource);
const installCommand = locale.app.view.docs.ui.installCommand;

assert.match(readme, /npm install @re-code\/flux rxjs/, 'README must install the RxJS peer dependency.');
assert.match(readme, /rxjs` is a peer dependency/i, 'README must explain the RxJS peer dependency.');
assert.match(home, /store\.app\.view\.docs\.ui\.installCommand/, 'Landing install command must come from locale data.');
assert.equal(installCommand, 'npm install @re-code/flux rxjs', 'The localized landing install command must include RxJS.');
assert.match(gettingStarted, /pnpm add @re-code\/flux rxjs/);
assert.match(gettingStarted, /npm install @re-code\/flux rxjs/);
assert.match(gettingStarted, /yarn add @re-code\/flux rxjs/);
assert.match(gettingStarted, /bun add @re-code\/flux rxjs/);

assert.match(viteConfig, /readFileSync\(new URL\('\.\.\/\.\.\/package\.json'/, 'Docs Vite config must read the library package version.');
assert.match(viteConfig, /__RE_FLUX_VERSION__:\s*JSON\.stringify\(libraryPackage\.version\)/, 'Docs build must expose the root library version.');
assert.match(docsView, /`v\$\{__RE_FLUX_VERSION__\}`/, 'Docs version badge must use the injected root package version.');
assert.doesNotMatch(docsView, /v0\.2\.0/, 'Docs view must not hard-code an old release version.');
assert.equal(locale.app.view.docs.ui.version, undefined, 'Locale data must not retain an unused hard-coded release badge.');

assert.match(workflow, /DIST_TAG="\$\{VERSION#\*-\}"/, 'Publishing workflow must derive a dist-tag from prerelease versions.');
assert.match(workflow, /DIST_TAG="latest"/, 'Stable releases must use the latest dist-tag.');
assert.match(workflow, /npm publish --provenance --access public --tag "\$DIST_TAG"/, 'npm publish must pass an explicit dist-tag.');
assert.match(publishingGuide, /0\.5\.0-beta\.0/);
assert.match(publishingGuide, /npm view @re-code\/flux dist-tags/);

assert.match(benchmarkRunner, /adapters\.bench\.mjs/, 'Complete benchmark runner must include the adapter benchmark.');
assert.match(benchmarkGuide, /DOM\/SVG\/Canvas adapter updates/i, 'Benchmark guide must describe adapter update workloads.');
assert.ok(adaptersBenchmark.includes("benchmark: 're;Flux DOM-style, SVG-attribute and Canvas adapter update workloads'"));
assert.match(changelog, /Historical validation note/i, 'Old release-preparation caveat must be labeled as historical.');
assert.doesNotMatch(changelog, /Run the public package-consumer and full documentation contract checks in CI\./, 'The current changelog should not present completed work as an imperative task.');

console.log(`✓ Release documentation metadata is consistent for ${packageJson.name}@${packageJson.version}.`);
