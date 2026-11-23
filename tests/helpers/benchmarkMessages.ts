import type { BenchmarkMessages } from '../../apps/docs/src/benchmarks/types';

/** Messages whose text is their own key, so assertions can tell which one was used. */
export const messages = new Proxy({} as BenchmarkMessages, {
  get: (_target, key) => {
    if (key === 'repetitionOf') return 'rep {current}/{total} {engine} {scenario}';
    if (key === 'allMeasuredRunsComplete') return 'done {count}';
    return String(key);
  },
});
