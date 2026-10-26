import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveLocaleReferences } from './lib/locale.mjs';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// Load sources by explicit name instead of positional array destructuring. This
// keeps each contract attached to its intended file when the audit grows.
const sourcePaths = {
  packageSource: 'package.json',
  docsPackageSource: 'apps/docs/package.json',
  lockSource: 'package-lock.json',
  readme: 'README.md',
  home: 'apps/docs/src/views/Home.vue',
  gettingStarted: 'apps/docs/src/components/DocsComponents/DocsGettingStarted.vue',
  installHelperSource: 'apps/docs/src/utils/packageInstall.ts',
  localeSource: 'apps/docs/src/locales/en.json',
  docsView: 'apps/docs/src/views/Docs.vue',
  appView: 'apps/docs/src/App.vue',
  viteConfig: 'apps/docs/vite.config.ts',
  workflow: '.github/workflows/publish-npm.yml',
  publishingGuide: 'guidelines/PUBLISHING.md',
  publishingRuntimeCheck: 'scripts/check-trusted-publishing-runtime.mjs',
  changelog: 'CHANGELOG.md',
  benchmarkGuide: 'benchmarks/README.md',
  benchmarkRunner: 'benchmarks/run-all.bench.mjs',
  adaptersBenchmark: 'benchmarks/adapters.bench.mjs',
};
const loadedSources = Object.fromEntries(await Promise.all(
  Object.entries(sourcePaths).map(async ([name, path]) => [name, await read(path)]),
));
const {
  packageSource, docsPackageSource, lockSource, readme, home, gettingStarted,
  installHelperSource, localeSource, docsView, appView, viteConfig, workflow,
  publishingGuide, publishingRuntimeCheck, changelog, benchmarkGuide,
  benchmarkRunner, adaptersBenchmark,
} = loadedSources;
const packageJson = JSON.parse(packageSource);
const docsPackageJson = JSON.parse(docsPackageSource);
const packageLock = JSON.parse(lockSource);
assert.equal(docsPackageJson.version, packageJson.version, 'Docs workspace version must match the root package.');
assert.equal(packageLock.version, packageJson.version, 'Lockfile version must match the root package.');
assert.equal(packageLock.packages[''].version, packageJson.version, 'Root lockfile package version must match package.json.');
assert.equal(packageLock.packages['apps/docs'].version, packageJson.version, 'Docs lockfile version must match apps/docs/package.json.');
const locale = resolveLocaleReferences(JSON.parse(localeSource));
const installCommand = locale.app.view.docs.ui.installCommand;

assert.match(readme, /npm install @re-code\/flux rxjs/, 'README must include the standard install command.');
assert.match(readme, /npm install @re-code\/flux@beta rxjs/, 'README must document how to install the beta dist-tag.');
assert.match(readme, /Public beta.*0\.5\.0-beta\.0/s, 'README must identify this as the feedback beta.');
assert.match(readme, /RxJS is a peer dependency/i, 'README must explain the RxJS peer dependency.');
assert.match(home, /store\.app\.view\.docs\.ui\.installCommand/, 'Landing install command must come from locale data.');
assert.equal(installCommand, 'npm install @re-code/flux rxjs', 'The localized landing install command must include RxJS.');
assert.match(home, /versionInstallCommand\(store\.app\.view\.docs\.ui\.installCommand, __RE_FLUX_VERSION__\)/, 'Home install CTA must adapt to prerelease versions.');
assert.match(gettingStarted, /installCommandForManager\(activeManager\.value, __RE_FLUX_VERSION__\)/, 'Getting Started install tabs must adapt to prerelease versions.');
const compiledInstallHelpers = ts.transpileModule(installHelperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const installHelpers = await import(`data:text/javascript;base64,${Buffer.from(compiledInstallHelpers).toString('base64')}`);
assert.equal(installHelpers.versionInstallCommand(installCommand, '0.5.0-beta.0'), 'npm install @re-code/flux@beta rxjs');
assert.equal(installHelpers.installCommandForManager('pnpm', '0.5.0-beta.0'), 'pnpm add @re-code/flux@beta rxjs');
assert.equal(installHelpers.installCommandForManager('npm', '0.5.0-beta.0'), 'npm install @re-code/flux@beta rxjs');
assert.equal(installHelpers.installCommandForManager('yarn', '0.5.0-beta.0'), 'yarn add @re-code/flux@beta rxjs');
assert.equal(installHelpers.installCommandForManager('bun', '0.5.0-beta.0'), 'bun add @re-code/flux@beta rxjs');
assert.equal(installHelpers.installCommandForManager('npm', '1.0.0'), 'npm install @re-code/flux rxjs');
assert.equal(installHelpers.installCommandForManager('npm', '0.6.0-alpha.1'), 'npm install @re-code/flux@alpha rxjs');
assert.equal(installHelpers.installCommandForManager('npm', '0.9.0-rc.0'), 'npm install @re-code/flux@rc rxjs');

assert.match(viteConfig, /readFileSync\(new URL\('\.\.\/\.\.\/package\.json'/, 'Docs Vite config must read the library package version.');
assert.match(viteConfig, /__RE_FLUX_VERSION__:\s*JSON\.stringify\(libraryPackage\.version\)/, 'Docs build must expose the root library version.');
assert.match(docsPackageSource, /check-built-route-fallback\.mjs/, 'Docs production build must verify the emitted GitHub Pages route fallback.');
assert.match(docsView, /`v\$\{__RE_FLUX_VERSION__\}`/, 'Docs version badge must use the injected root package version.');
assert.doesNotMatch(docsView, /v0\.2\.0/, 'Docs view must not hard-code an old release version.');
assert.equal(locale.app.view.docs.ui.version, undefined, 'Locale data must not retain an unused hard-coded release badge.');
assert.match(appView, /copy\.strictTypeScript/, 'Footer must use the established Strict TypeScript badge instead of an unverified compiler minimum.');
assert.doesNotMatch(appView, /copy\.typescript54/, 'Footer must not reference the obsolete TypeScript 5.4+ badge.');
assert.equal(locale.app.view.navigation.typescript54, undefined, 'Locale data must not retain the obsolete TypeScript 5.4+ badge.');
assert.match(readme, /API reference, detailed guides, and interactive Playground and Visual Lab examples/i, 'README should link readers to the website for full documentation rather than duplicate the full API guide.');

assert.match(workflow, /name: Publish to npm/, 'Publishing workflow source must be loaded from .github/workflows/publish-npm.yml.');
assert.match(workflow, /DIST_TAG="\$\{VERSION#\*-\}"/, 'Publishing workflow must derive a dist-tag from prerelease versions.');
assert.match(workflow, /DIST_TAG="latest"/, 'Stable releases must use the latest dist-tag.');
assert.match(workflow, /npm publish --provenance --access public --tag "\$DIST_TAG"/, 'npm publish must pass an explicit dist-tag.');
assert.match(workflow, /check-trusted-publishing-runtime\.mjs/, 'Publishing must verify the OIDC publishing runtime before installing dependencies.');
assert.match(publishingRuntimeCheck, /22, 14, 0/);
assert.match(publishingRuntimeCheck, /11, 5, 1/);
assert.match(publishingGuide, /Explicitly allow direct `npm publish`/);
assert.match(publishingGuide, /0\.5\.0-beta\.0/);
assert.match(publishingGuide, /npm view @re-code\/flux dist-tags/);

assert.match(benchmarkRunner, /adapters\.bench\.mjs/, 'Complete benchmark runner must include the adapter benchmark.');
assert.match(benchmarkGuide, /DOM\/SVG\/Canvas adapter updates/i, 'Benchmark guide must describe adapter update workloads.');
assert.ok(adaptersBenchmark.includes("benchmark: 're;Flux DOM-style, SVG-attribute and Canvas adapter update workloads'"));
assert.match(changelog, /Historical validation note/i, 'Old release-preparation caveat must be labeled as historical.');
assert.doesNotMatch(changelog, /Run the public package-consumer and full documentation contract checks in CI\./, 'The current changelog should not present completed work as an imperative task.');

assert.match(changelog, new RegExp(`## ${packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), 'Changelog must contain a section for the current package version.');
console.log(`✓ Release documentation metadata is consistent for ${packageJson.name}@${packageJson.version}; prerelease install commands follow the version.`);
