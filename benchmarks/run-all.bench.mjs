import { spawnSync } from 'node:child_process';

const scripts = [
  { name: 'frameCoordinator', path: 'benchmarks/frame-coordinator.bench.mjs' },
  { name: 'timeline', path: 'benchmarks/timeline.bench.mjs' },
  { name: 'animationLoad', path: 'benchmarks/animation-load.bench.mjs' },
  { name: 'adapterUpdates', path: 'benchmarks/adapters.bench.mjs' },
];
const reports = [];

for (const script of scripts) {
  const result = spawnSync(process.execPath, [script.path], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${script.path} exited with status ${result.status ?? 'unknown'}.`);
  }

  try {
    reports.push({ name: script.name, report: JSON.parse(result.stdout) });
  } catch (error) {
    throw new Error(`Expected ${script.path} to print one valid JSON report.`, { cause: error });
  }
}

console.log(JSON.stringify({
  benchmark: 're;Flux benchmark suite',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  note: 'Subreports contain per-run timings and summaries. Benchmarks are descriptive, not pass/fail thresholds.',
  reports,
}, null, 2));
