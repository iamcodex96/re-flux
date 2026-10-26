import { describe, expect, it } from '@jest/globals';
import { createFlowField, sampleFlowField, type FlowFieldCell } from '../../src/flowField.js';

describe('Given a generated flow field', () => {
  const cells: FlowFieldCell[] = [];
  const field = createFlowField({
    columns: 2,
    rows: 2,
    cellSize: 10,
    origin: { x: 10, y: 20 },
    vectorAtCell: (cell) => {
      cells.push(cell);
      return { x: cell.column + 1, y: cell.row + 1 };
    },
  });

  describe('When field vectors are created', () => {
    it('Then it invokes the factory once per cell at each cell centre in row-major order', () => {
      expect(cells).toEqual([
        { column: 0, row: 0, index: 0, x: 15, y: 25 },
        { column: 1, row: 0, index: 1, x: 25, y: 25 },
        { column: 0, row: 1, index: 2, x: 15, y: 35 },
        { column: 1, row: 1, index: 3, x: 25, y: 35 },
      ]);
      expect(field.vectors).toEqual([
        { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 1, y: 2 }, { x: 2, y: 2 },
      ]);
      expect(Object.isFrozen(field)).toBe(true);
      expect(Object.isFrozen(field.vectors)).toBe(true);
    });

    it('Then it rejects invalid dimensions, cell sizes, origins and generated vectors', () => {
      expect(() => createFlowField({ columns: 0, rows: 1, cellSize: 10, vectorAtCell: () => ({ x: 1, y: 0 }) })).toThrow(RangeError);
      expect(() => createFlowField({ columns: 1, rows: 1, cellSize: 0, vectorAtCell: () => ({ x: 1, y: 0 }) })).toThrow(RangeError);
      expect(() => createFlowField({ columns: 1, rows: 1, cellSize: 10, origin: { x: Number.NaN, y: 0 }, vectorAtCell: () => ({ x: 1, y: 0 }) })).toThrow(RangeError);
      expect(() => createFlowField({ columns: 1, rows: 1, cellSize: 10, vectorAtCell: () => ({ x: Number.POSITIVE_INFINITY, y: 0 }) })).toThrow(RangeError);
      expect(() => createFlowField({ columns: 2, rows: 1, cellSize: Number.MAX_VALUE, vectorAtCell: () => ({ x: 1, y: 0 }) })).toThrow(RangeError);
    });
  });

  describe('When a world position is sampled', () => {
    it('Then it returns the nearest cell vector', () => {
      expect(sampleFlowField(field, { x: 10, y: 20 })).toEqual({ x: 1, y: 1 });
      expect(sampleFlowField(field, { x: 29.99, y: 39.99 })).toEqual({ x: 2, y: 2 });
    });

    it('Then it supports clamp, wrap and zero behavior outside the field', () => {
      expect(sampleFlowField(field, { x: 0, y: 10 }, 'clamp')).toEqual({ x: 1, y: 1 });
      expect(sampleFlowField(field, { x: 30, y: 40 }, 'wrap')).toEqual({ x: 1, y: 1 });
      expect(sampleFlowField(field, { x: 0, y: 10 }, 'zero')).toEqual({ x: 0, y: 0 });
    });

    it('Then it rejects invalid sample positions and malformed fields', () => {
      expect(() => sampleFlowField(field, { x: Number.NaN, y: 10 })).toThrow(RangeError);
      expect(() => sampleFlowField({ ...field, vectors: [] }, { x: 10, y: 20 })).toThrow(RangeError);
      expect(() => sampleFlowField({ ...field, vectors: [{ x: Number.NaN, y: 0 }, ...field.vectors.slice(1)] }, { x: 10, y: 20 })).toThrow(RangeError);
      expect(() => sampleFlowField(field, { x: 0, y: 0 }, 'invalid' as 'clamp')).toThrow(RangeError);
    });
  });
});
