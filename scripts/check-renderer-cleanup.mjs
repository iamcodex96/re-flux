import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourceRoots = ['src', 'apps/docs/src'];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.vue', '.html', '.scss', '.css']);
const rendererResidue = /\bfrom\s*['"]p5(?:\.js)?['"]|\bimport\s*\(\s*['"]p5(?:\.js)?['"]\s*\)|\bP5Instance\b|\bp5Runtime\b|\bnew\s+p5\s*\(|\bcreateGraphics\s*\(|\brandomSeed\s*\(|\bnoiseSeed\s*\(/i;

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const sourceFiles = (await Promise.all(sourceRoots.map((directory) => collect(resolve(root, directory))))).flat();
for (const path of sourceFiles) {
  const source = await readFile(path, 'utf8');
  assert.doesNotMatch(source, rendererResidue, `${path.slice(root.length + 1)} contains an obsolete p5.js renderer reference.`);
}

for (const path of ['package.json', 'apps/docs/package.json']) {
  const manifest = JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  };
  assert.ok(!Object.keys(dependencies).some((name) => /^p5(?:\.js)?$/i.test(name)), `${path} must not declare p5.js.`);
}
const lockfile = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const lockedP5Packages = Object.keys(lockfile.packages ?? {}).filter((path) => /(?:^|\/)node_modules\/p5(?:\.js)?$/i.test(path));
assert.deepEqual(lockedP5Packages, [], 'The package lockfile must not include p5.js.');

const obsoleteRendererFiles = (await collect(resolve(root, 'apps/docs/src')))
  .filter((path) => /(?:^|[/\\])(?:p5Runtime|p5-renderer|processing-runtime)\.(?:ts|js|vue)$/i.test(path));
assert.deepEqual(obsoleteRendererFiles, [], 'Remove obsolete p5/Processing runtime files from the docs source.');

const card = await readFile(resolve(root, 'apps/docs/src/components/VisualLab/VisualExperimentCard.vue'), 'utf8');
const types = await readFile(resolve(root, 'apps/docs/src/components/VisualLab/visualLabTypes.ts'), 'utf8');
assert.doesNotMatch(card, /drawLattice|kind\s*===\s*['"]lattice['"]|['"]lattice['"]/, 'The old, unregistered lattice preview must be removed.');
assert.doesNotMatch(types, /['"]lattice['"]/, 'The public Visual Lab demo-kind union must not retain the obsolete lattice variant.');

console.log(`✓ Renderer cleanup passed: scanned ${sourceFiles.length} source files, found no p5.js/Processing runtime residue, and removed the orphaned lattice preview.`);
