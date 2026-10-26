import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('..', import.meta.url));
const entries = path.join(root, 'tests/tree-shaking/entries');

const cases = [
  {
    name: 'root',
    entry: path.join(entries, 'root.ts'),
    entryModule: 'dist/index.js',
    required: ['dist/core/Animation.js'],
    forbidden: ['dist/adapters/', 'dist/effects/', 'dist/operators/', 'dist/physics/', 'dist/values/'],
  },
  {
    name: 'core',
    entry: path.join(entries, 'core.ts'),
    entryModule: 'dist/core.js',
    required: ['dist/core/Animation.js'],
    forbidden: ['dist/adapters/dom/', 'dist/adapters/svg.js', 'dist/adapters/canvas.js', 'dist/adapters/three.js', 'dist/effects/canvas.js', 'dist/operators/', 'dist/physics/'],
  },
  {
    name: 'steering',
    entry: path.join(entries, 'steering.ts'),
    entryModule: 'dist/steering.js',
    required: ['dist/steering.js'],
    forbidden: ['dist/adapters/', 'dist/effects/', 'dist/core/', 'dist/values/'],
  },
  {
    name: 'flow-field',
    entry: path.join(entries, 'flow-field.ts'),
    entryModule: 'dist/flowField.js',
    required: ['dist/flowField.js'],
    forbidden: ['dist/adapters/', 'dist/effects/', 'dist/core/', 'dist/physics/', 'dist/values/'],
  },
  {
    name: 'dom',
    entry: path.join(entries, 'dom.ts'),
    entryModule: 'dist/adapters/dom.js',
    required: ['dist/adapters/dom/animation.js'],
    forbidden: ['dist/adapters/dom/draggable.js', 'dist/adapters/dom/text.js', 'dist/adapters/dom/layout.js', 'dist/adapters/dom/scrollTrigger.js', 'dist/adapters/svg.js', 'dist/adapters/canvas.js', 'dist/adapters/three.js', 'dist/effects/canvas.js'],
  },
  {
    name: 'svg',
    entry: path.join(entries, 'svg.ts'),
    entryModule: 'dist/adapters/svg.js',
    required: ['dist/adapters/svg.js'],
    forbidden: ['dist/adapters/dom/', 'dist/adapters/canvas.js', 'dist/adapters/three.js', 'dist/effects/canvas.js'],
  },
  {
    name: 'canvas',
    entry: path.join(entries, 'canvas.ts'),
    entryModule: 'dist/adapters/canvas.js',
    required: ['dist/adapters/canvas.js'],
    forbidden: ['dist/adapters/dom/', 'dist/adapters/svg.js', 'dist/adapters/three.js', 'dist/effects/canvas.js'],
  },
  {
    name: 'three',
    entry: path.join(entries, 'three.ts'),
    entryModule: 'dist/adapters/three.js',
    required: ['dist/adapters/three.js'],
    forbidden: ['dist/adapters/dom/', 'dist/adapters/svg.js', 'dist/adapters/canvas.js', 'dist/effects/canvas.js'],
  },
];

for (const testCase of cases) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: [testCase.entry],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    treeShaking: true,
    minify: true,
    external: ['rxjs'],
    logLevel: 'silent',
  });

   
   
   
  const resolvedInputs = Object.keys(result.metafile.inputs)
    .map((input) => input.replaceAll('\\', '/'));
  assert(
    resolvedInputs.some((input) => input.endsWith(testCase.entryModule)),
    `${testCase.name}: expected package entry ${testCase.entryModule} to be resolved; inputs were:\n${resolvedInputs.join('\n')}`,
  );

  const contributingInputs = [...new Set(Object.values(result.metafile.outputs)
    .flatMap((output) => Object.entries(output.inputs ?? []))
    .filter(([, details]) => details.bytesInOutput > 0)
    .map(([input]) => input.replaceAll('\\', '/')))];

  for (const expected of testCase.required) {
    assert(
      contributingInputs.some((input) => input.endsWith(expected)),
      `${testCase.name}: expected emitted code from ${expected}; contributing modules were:\n${contributingInputs.join('\n')}`,
    );
  }
  for (const forbidden of testCase.forbidden) {
    assert(
      !contributingInputs.some((input) => input.includes(forbidden)),
      `${testCase.name}: unwanted code from ${forbidden} was included`,
    );
  }
  const bytes = result.outputFiles.reduce((total, output) => total + output.contents.byteLength, 0);
  process.stdout.write(`✓ ${testCase.name.padEnd(8)} ${String(bytes).padStart(6)} bytes; entry ${testCase.entryModule} resolved; ${contributingInputs.length} contributing modules\n`);
}

process.stdout.write('Tree-shaking checks passed. Optional adapters are not pulled into unrelated bundles.\n');
