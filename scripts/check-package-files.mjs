import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const packed = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const report = JSON.parse(packed);
assert(Array.isArray(report) && report.length === 1, 'npm pack should return one package report');
const files = report[0].files.map((entry) => entry.path.replaceAll('\\', '/'));
const required = [
  'package.json',
  'README.md',
  'LICENSE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/core.js',
  'dist/core.d.ts',
  'dist/values.js',
  'dist/values.d.ts',
  'dist/physics.js',
  'dist/physics.d.ts',
  'dist/steering.js',
  'dist/steering.d.ts',
  'dist/flowField.js',
  'dist/flowField.d.ts',
  'dist/operators.js',
  'dist/operators.d.ts',
  'dist/utils.js',
  'dist/utils.d.ts',
  'dist/effects/canvas.js',
  'dist/effects/canvas.d.ts',
  'dist/adapters/dom.js',
  'dist/adapters/dom.d.ts',
  'dist/adapters/svg.js',
  'dist/adapters/svg.d.ts',
  'dist/adapters/canvas.js',
  'dist/adapters/canvas.d.ts',
  'dist/adapters/three.js',
  'dist/adapters/three.d.ts',
];
for (const file of required) {
  assert(files.includes(file), `Package is missing required file ${file}`);
}
const allowedRootFiles = new Set(['package.json', 'README.md', 'LICENSE']);
for (const file of files) {
  assert(allowedRootFiles.has(file) || file.startsWith('dist/'), `Unexpected non-package file included: ${file}`);
}

process.stdout.write(`✓ package allowlist verified (${files.length} files)\n`);
