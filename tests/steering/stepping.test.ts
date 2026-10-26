import { describe, expect, it } from '@jest/globals';
import { createFlowField } from '../../src/flowField.js';
import { followFlowField, stepSteeringAgent, type SteeringAgent } from '../../src/steering.js';

const stationary: SteeringAgent = { x: 0, y: 0, vx: 0, vy: 0 };

describe('Given steering integration', () => {
  describe('When an elapsed-time step is applied', () => {
    it('Then it integrates acceleration into velocity and then position without mutating the input', () => {
      const agent = { x: 4, y: 8, vx: 1, vy: -2 };
      const next = stepSteeringAgent(agent, { x: 2, y: 4 }, 0.5, { maxSpeed: 20 });
      expect(next).toEqual({ x: 5, y: 8, vx: 2, vy: 0 });
      expect(agent).toEqual({ x: 4, y: 8, vx: 1, vy: -2 });
    });

    it('Then it caps speed and optionally caps unusually large frame deltas', () => {
      expect(stepSteeringAgent(stationary, { x: 100, y: 0 }, 1, { maxSpeed: 5 })).toEqual({ x: 5, y: 0, vx: 5, vy: 0 });
      expect(stepSteeringAgent(stationary, { x: 10, y: 0 }, 1, { maxDeltaSeconds: 0.1 })).toEqual({ x: 0.1, y: 0, vx: 1, vy: 0 });
    });

    it('Then exponential damping produces equivalent final velocity for split and unsplit time steps', () => {
      const start = { x: 0, y: 0, vx: 12, vy: -3 };
      const whole = stepSteeringAgent(start, { x: 0, y: 0 }, 0.5, { linearDamping: 2 });
      const first = stepSteeringAgent(start, { x: 0, y: 0 }, 0.25, { linearDamping: 2 });
      const split = stepSteeringAgent(first, { x: 0, y: 0 }, 0.25, { linearDamping: 2 });
      expect(split.vx).toBeCloseTo(whole.vx);
      expect(split.vy).toBeCloseTo(whole.vy);
    });

    it('Then a zero delta preserves the supplied state exactly', () => {
      const agent = { x: 2, y: 3, vx: 400, vy: 0 };
      expect(stepSteeringAgent(agent, { x: 4, y: 5 }, 0)).toEqual(agent);
    });

    it('Then it rejects non-finite states and invalid step configuration', () => {
      expect(() => stepSteeringAgent({ ...stationary, vx: Number.NaN }, { x: 0, y: 0 }, 0.01)).toThrow(RangeError);
      expect(() => stepSteeringAgent(stationary, { x: Number.POSITIVE_INFINITY, y: 0 }, 0.01)).toThrow(RangeError);
      expect(() => stepSteeringAgent(stationary, { x: 0, y: 0 }, -1)).toThrow(RangeError);
      expect(() => stepSteeringAgent(stationary, { x: 0, y: 0 }, 0.1, { maxSpeed: -1 })).toThrow(RangeError);
      expect(() => stepSteeringAgent(stationary, { x: 0, y: 0 }, 0.1, { linearDamping: -1 })).toThrow(RangeError);
      expect(() => stepSteeringAgent(stationary, { x: 0, y: 0 }, 0.1, { maxDeltaSeconds: 0 })).toThrow(RangeError);
    });
  });

  describe('When an agent follows a flow field', () => {
    const field = createFlowField({
      columns: 2,
      rows: 2,
      cellSize: 10,
      vectorAtCell: () => ({ x: 1, y: 0 }),
    });

    it('Then it returns a bounded steering force in the field direction', () => {
      expect(followFlowField(stationary, field, { maxSpeed: 10, maxForce: 3 })).toEqual({ x: 3, y: 0 });
    });

    it('Then a zero edge sample brakes a moving agent', () => {
      const moving = { x: -2, y: 2, vx: 3, vy: 0 };
      expect(followFlowField(moving, field, { maxSpeed: 10, maxForce: 2, edgeMode: 'zero' })).toEqual({ x: -2, y: 0 });
    });
  });
});
