import type { Vector2 } from './utils/vector2.js';

/** A cell passed to a flow-field vector factory. x/y identify the cell centre in world units. */
export interface FlowFieldCell extends Vector2 {
  readonly column: number;
  readonly row: number;
  readonly index: number;
}

export interface FlowFieldOptions {
  /** Number of columns. Must be a positive integer. */
  readonly columns: number;
  /** Number of rows. Must be a positive integer. */
  readonly rows: number;
  /** Square cell width and height in world units. */
  readonly cellSize: number;
  /** World-space top-left origin. Defaults to (0, 0). */
  readonly origin?: Vector2;
  /** Provides the vector stored in each cell, called once per cell during construction. */
  readonly vectorAtCell: (cell: FlowFieldCell) => Vector2;
}

/** Immutable row-major vector grid used to steer autonomous agents through a field. */
export interface FlowField {
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly origin: Vector2;
  /** Row-major cells: vectors[row * columns + column]. */
  readonly vectors: readonly Vector2[];
}

/** How sampling behaves when the requested position lies outside the field. */
export type FlowFieldEdgeMode = 'clamp' | 'wrap' | 'zero';

const ZERO_VECTOR: Vector2 = Object.freeze({ x: 0, y: 0 });

/**
 * Build an immutable vector field from a deterministic cell callback.
 * Vectors are sampled at cell centres; the callback is invoked once per cell.
 */
export function createFlowField(options: FlowFieldOptions): FlowField {
  const { columns, rows, cellSize } = options;
  const origin = options.origin ?? ZERO_VECTOR;
  if (!Number.isSafeInteger(columns) || columns <= 0) {
    throw new RangeError('Flow field columns must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(rows) || rows <= 0) {
    throw new RangeError('Flow field rows must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(columns * rows)) {
    throw new RangeError('Flow field cell count must be a safe integer.');
  }
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError('Flow field cellSize must be a finite number greater than zero.');
  }
  assertFiniteVector(origin, 'Flow field origin');
  if (typeof options.vectorAtCell !== 'function') {
    throw new TypeError('Flow field vectorAtCell must be a function.');
  }

  const vectors: Vector2[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = origin.x + (column + 0.5) * cellSize;
      const y = origin.y + (row + 0.5) * cellSize;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new RangeError(`Flow field cell centre at column ${column}, row ${row} exceeds finite coordinates.`);
      }
      const cell: FlowFieldCell = Object.freeze({ column, row, index: row * columns + column, x, y });
      const vector = options.vectorAtCell(cell);
      assertFiniteVector(vector, `Flow field vector at column ${column}, row ${row}`);
      vectors.push(Object.freeze({ x: vector.x, y: vector.y }));
    }
  }

  return Object.freeze({
    columns,
    rows,
    cellSize,
    origin: Object.freeze({ x: origin.x, y: origin.y }),
    vectors: Object.freeze(vectors),
  });
}

/**
 * Read the vector at a world-space position. Sampling is nearest-cell rather than bilinear;
 * use `clamp` (default), `wrap`, or `zero` to define out-of-bounds behavior.
 */
export function sampleFlowField(
  field: FlowField,
  position: Vector2,
  edgeMode: FlowFieldEdgeMode = 'clamp',
): Vector2 {
  assertFlowField(field);
  assertFiniteVector(position, 'Flow field sample position');
  if (edgeMode !== 'clamp' && edgeMode !== 'wrap' && edgeMode !== 'zero') {
    throw new RangeError(`Unknown flow field edge mode: ${String(edgeMode)}.`);
  }

  const rawColumn = Math.floor((position.x - field.origin.x) / field.cellSize);
  const rawRow = Math.floor((position.y - field.origin.y) / field.cellSize);
  const outside = rawColumn < 0 || rawRow < 0 || rawColumn >= field.columns || rawRow >= field.rows;
  if (outside && edgeMode === 'zero') return { ...ZERO_VECTOR };

  let column = rawColumn;
  let row = rawRow;
  if (edgeMode === 'clamp') {
    column = clampIndex(column, field.columns);
    row = clampIndex(row, field.rows);
  } else if (edgeMode === 'wrap') {
    if (!Number.isSafeInteger(column) || !Number.isSafeInteger(row)) {
      throw new RangeError('Flow field wrap sampling requires coordinates that map to safe integer cells.');
    }
    column = wrapIndex(column, field.columns);
    row = wrapIndex(row, field.rows);
  }

  const vector = field.vectors[row * field.columns + column];
  if (!vector) throw new RangeError('Flow field does not contain the vector for the sampled cell.');
  assertFiniteVector(vector, 'Sampled flow field vector');
  return { x: vector.x, y: vector.y };
}

function wrapIndex(index: number, size: number): number {
  return ((index % size) + size) % size;
}

function clampIndex(index: number, size: number): number {
  if (!Number.isFinite(index)) return index < 0 ? 0 : size - 1;
  return Math.min(size - 1, Math.max(0, index));
}

function assertFiniteVector(value: Vector2, label: string): void {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new RangeError(`${label} must contain finite x and y coordinates.`);
  }
}

function assertFlowField(field: FlowField): void {
  if (!field || !Number.isSafeInteger(field.columns) || field.columns <= 0
    || !Number.isSafeInteger(field.rows) || field.rows <= 0
    || !Number.isFinite(field.cellSize) || field.cellSize <= 0
    || !field.origin || !Array.isArray(field.vectors)
    || field.vectors.length !== field.columns * field.rows) {
    throw new RangeError('Invalid flow field structure. Create fields with createFlowField().');
  }
  assertFiniteVector(field.origin, 'Flow field origin');
}
