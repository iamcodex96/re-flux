import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['ci.yml', 'deploy-docs.yml', 'publish-npm.yml'];
for (const name of names) {
  const activePath = resolve(root, '.github/workflows', name);
  const copyPath = resolve(root, 'ci/workflows', name);
  const [active, copy] = await Promise.all([readFile(activePath, 'utf8'), readFile(copyPath, 'utf8')]);
  assert.equal(copy, active, `${name} differs between .github/workflows/ and ci/workflows/`);
}
process.stdout.write(`✓ ${names.length} workflow copies are synchronized\n`);
