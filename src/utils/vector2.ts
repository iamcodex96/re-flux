/** A two-dimensional vector in caller-defined units. */
export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/** Add two vectors component-wise. */
export function addVectors(left: Vector2, right: Vector2): Vector2 {
  return { x: left.x + right.x, y: left.y + right.y };
}

/** Subtract the right vector from the left vector. */
export function subtractVectors(left: Vector2, right: Vector2): Vector2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

/** Scale a vector by a scalar. */
export function scaleVector(vector: Vector2, scalar: number): Vector2 {
  return { x: vector.x * scalar, y: vector.y * scalar };
}

/** Return the squared magnitude without calculating a square root. */
export function vectorMagnitudeSquared(vector: Vector2): number {
  return vector.x * vector.x + vector.y * vector.y;
}

/** Return the Euclidean magnitude of a vector. */
export function vectorMagnitude(vector: Vector2): number {
  return Math.hypot(vector.x, vector.y);
}

/** Normalize a vector; a zero vector remains zero instead of producing NaN. */
export function normalizeVector(vector: Vector2): Vector2 {
  const magnitude = vectorMagnitude(vector);
  if (magnitude === 0) return { x: 0, y: 0 };
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

/** Limit a vector's magnitude while preserving its direction. */
export function limitVector(vector: Vector2, maximumMagnitude: number): Vector2 {
  if (!Number.isFinite(maximumMagnitude) || maximumMagnitude < 0) {
    throw new RangeError('Maximum vector magnitude must be a finite non-negative number.');
  }
  const magnitude = vectorMagnitude(vector);
  if (magnitude === 0 || magnitude <= maximumMagnitude) return { x: vector.x, y: vector.y };
  const ratio = maximumMagnitude / magnitude;
  return { x: vector.x * ratio, y: vector.y * ratio };
}

/** Calculate the Euclidean distance between two points or vectors. */
export function distanceBetween(left: Vector2, right: Vector2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

/** Calculate the dot product of two vectors. */
export function dotProduct(left: Vector2, right: Vector2): number {
  return left.x * right.x + left.y * right.y;
}

/** Create a vector from an angle in radians and an optional magnitude. */
export function vectorFromAngle(angle: number, magnitude = 1): Vector2 {
  if (!Number.isFinite(angle) || !Number.isFinite(magnitude)) {
    throw new RangeError('Vector angle and magnitude must be finite numbers.');
  }
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
}

/** Linearly interpolate two vectors. Progress is intentionally not clamped. */
export function lerpVector(from: Vector2, to: Vector2, progress: number): Vector2 {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}
