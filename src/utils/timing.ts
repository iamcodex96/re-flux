/** Validate a time/position value that must be a finite, non-negative number. */
export function assertFiniteNonNegative(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number greater than or equal to zero.`);
  }
}

/** Repeats are additional cycles: allow non-negative safe integers and Infinity only. */
export function assertRepeatCount(value: number): void {
  if (value !== Infinity && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError('Animation repeat must be a non-negative safe integer or Infinity.');
  }
}
