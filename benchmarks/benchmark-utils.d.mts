/** Types for the statistics helpers of `benchmark-utils.mjs` that unit tests import. The rest of the module is untyped. */
export function median(values: readonly number[]): number;
export function percentile(values: readonly number[], fraction: number): number;
export function standardDeviation(values: readonly number[]): number;
export function variability(values: readonly number[]): {
  readonly cv: number;
  readonly stdev: number;
  readonly min: number;
  readonly median: number;
  readonly max: number;
  readonly maxOverMin: number | null;
};
