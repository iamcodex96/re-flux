import { readFileSync } from 'node:fs';
const trace = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const groups = {};
for (const e of trace.traceEvents) {
  if (!['UpdateLayoutTree', 'Layout'].includes(e.name) || e.ph !== 'X') continue;
  const stack = e.args?.beginData?.stackTrace ?? [];
  const names = stack.map((f) => f.functionName);
  const key = ['flipGrid', 'animateGrid', 'controlThrash', 'controlBatched', 'build'].find((n) => names.includes(n)) ?? (stack.length ? 'other-js' : 'browser-frame');
  const g = (groups[key] ??= {});
  const o = (g[e.name] ??= { count: 0, ms: 0 });
  o.count += 1; o.ms = Math.round((o.ms + (e.dur ?? 0) / 1000) * 10) / 10;
}
console.log(process.argv[2].split('/').pop()); for (const [k, v] of Object.entries(groups)) console.log(' ', k.padEnd(15), JSON.stringify(v));
