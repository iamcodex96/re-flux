/**
 * Internal option normalizers shared by the spring and gesture operators. Not part of the public API: it is
 * deliberately not re-exported from any package entry point.
 */

/** The value when it is a finite number greater than zero, otherwise the fallback. */
export function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The value when it is a finite number of at least zero, otherwise the fallback. */
export function nonNegative(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}
