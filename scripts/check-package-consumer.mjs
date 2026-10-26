import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 're-flux-consumer-'));

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (error) {
    const output = error?.stdout?.toString?.() ?? '';
    const detail = error?.stderr?.toString?.() ?? '';
    throw new Error(`${command} ${args.join(' ')} failed.\n${output}${detail}`, { cause: error });
  }
}

try {
  const packOutput = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', tempRoot]);
  const reports = JSON.parse(packOutput);
  assert.equal(reports.length, 1, 'npm pack should produce exactly one package');
  const tarball = path.join(tempRoot, reports[0].filename);

  const consumerRoot = path.join(tempRoot, 'consumer');
  const packageDir = path.join(consumerRoot, 'node_modules', '@re-code', 'flux');
  const modulesDir = path.join(consumerRoot, 'node_modules');
  await mkdir(packageDir, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', packageDir, '--strip-components=1']);

  // The consumer gets RxJS as a peer dependency, just like a real application.
  await symlink(path.join(root, 'node_modules', 'rxjs'), path.join(modulesDir, 'rxjs'), process.platform === 'win32' ? 'junction' : 'dir');

  await writeFile(path.join(consumerRoot, 'package.json'), JSON.stringify({
    name: 're-flux-consumer-smoke',
    private: true,
    type: 'module',
  }, null, 2));

  const packageJson = JSON.parse(await readFile(path.join(packageDir, 'package.json'), 'utf8'));
  const exportPaths = Object.keys(packageJson.exports ?? {});
  assert(exportPaths.includes('.'), 'Root export is missing');
  const specifiers = exportPaths.map((entry) => entry === '.' ? '@re-code/flux' : `@re-code/flux/${entry.slice(2)}`);
  const runtimeFixture = `
    const specifiers = ${JSON.stringify(specifiers)};
    for (const specifier of specifiers) {
      const namespace = await import(specifier);
      if (!namespace || Object.keys(namespace).length === 0) {
        throw new Error(specifier + ' did not expose any runtime exports');
      }
      console.log('✓ ESM import ' + specifier);
    }
    const root = await import('@re-code/flux');
    for (const name of ['Animation', 'Timeline', 'Tween', 'seek', 'flee', 'addVectors', 'limitVector', 'stepSteeringAgent', 'followFlowField', 'createFlowField', 'sampleFlowField']) {
      if (typeof root[name] !== 'function') throw new Error('Root export missing ' + name);
    }
  `;
  run(process.execPath, ['--input-type=module', '-e', runtimeFixture], { cwd: consumerRoot });

  const typeFixture = `
import * as root from '@re-code/flux';
import * as core from '@re-code/flux/core';
import * as values from '@re-code/flux/values';
import * as physics from '@re-code/flux/physics';
import * as steering from '@re-code/flux/steering';
import * as flowField from '@re-code/flux/flow-field';
import { createFlowField, sampleFlowField, type FlowField } from '@re-code/flux/flow-field';
import { stepSteeringAgent, followFlowField } from '@re-code/flux/steering';
import * as operators from '@re-code/flux/operators';
import * as utils from '@re-code/flux/utils';
import { seek, separate, type SteeringAgent } from '@re-code/flux/steering';
import { limitVector, type Vector2 } from '@re-code/flux/utils';
import * as dom from '@re-code/flux/dom';
import * as svg from '@re-code/flux/svg';
import * as canvas from '@re-code/flux/canvas';
import * as three from '@re-code/flux/three';
import * as canvasEffects from '@re-code/flux/effects/canvas';
import { Animation } from '@re-code/flux';
import { Timeline } from '@re-code/flux/core';
import { Tween } from '@re-code/flux/values';

const animation = new Animation({ duration: 100 });
const timeline = new Timeline().add(animation);
const tween = new Tween({ from: 0, to: 1, duration: 100 });
void [root, core, values, physics, steering, flowField, operators, utils, dom, svg, canvas, three, canvasEffects, timeline, tween, seek, separate, limitVector, stepSteeringAgent, followFlowField, createFlowField, sampleFlowField];
const vector: Vector2 = { x: 1, y: 2 };
const steeringAgent: SteeringAgent = { x: 0, y: 0, vx: 0, vy: 0 };
const flow: FlowField = createFlowField({ columns: 2, rows: 2, cellSize: 10, vectorAtCell: () => ({ x: 1, y: 0 }) });
void [vector, steeringAgent, flow, sampleFlowField(flow, vector), followFlowField(steeringAgent, flow), stepSteeringAgent(steeringAgent, vector, 1 / 60)];
`;
  await writeFile(path.join(consumerRoot, 'consumer.ts'), typeFixture);
  await writeFile(path.join(consumerRoot, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    },
    files: ['consumer.ts'],
  }, null, 2));
  run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--project', path.join(consumerRoot, 'tsconfig.json')], { cwd: consumerRoot });

  process.stdout.write(`✓ Consumer package validation passed (${specifiers.length} ESM subpath imports and TypeScript declarations)\n`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
