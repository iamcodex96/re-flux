#!/usr/bin/env node
/**
 * Run the complete benchmark suite and save the JSON report.
 *
 *   npm run bench:save                      # writes benchmarks/results/bench-<date>-<platform>-<arch>-node<version>.json
 *   npm run bench:save -- --out my.json     # explicit destination
 *
 * The file name records platform, architecture and Node.js version because reports are only
 * comparable on the same machine and runtime (see benchmarks/README.md).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOutPath } from './benchmark-utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().slice(0, 10);
const defaultName = `bench-${stamp}-${process.platform}-${process.arch}-node${process.versions.node}.json`;
const out = resolveOutPath() ?? path.join(root, 'benchmarks', 'results', defaultName);

const result = spawnSync(process.execPath, [path.join(root, 'benchmarks', 'run-all.bench.mjs')], {
  cwd: root,
  stdio: ['ignore', 'inherit', 'inherit'],
  env: { ...process.env, BENCH_OUT: out },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
