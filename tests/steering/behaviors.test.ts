import { describe, expect, it } from '@jest/globals';
import { arrive, combineSteering, flee, seek, separate, type SteeringAgent } from '../../src/steering.js';

const stationary = (x: number, y: number): SteeringAgent => ({ x, y, vx: 0, vy: 0 });

describe('Given renderer-independent steering behaviours', () => {
  describe('When an agent seeks a target', () => {
    it('Then it returns a bounded force toward the target', () => {
      expect(seek(stationary(0, 0), { x: 10, y: 0 }, { maxSpeed: 10, maxForce: 3 })).toEqual({ x: 3, y: 0 });
    });

    it('Then it brakes an agent that has reached its target', () => {
      expect(seek({ x: 10, y: 0, vx: 8, vy: 0 }, { x: 10, y: 0 }, { maxSpeed: 10, maxForce: 2 })).toEqual({ x: -2, y: 0 });
    });
  });

  describe('When an agent arrives inside a slowing radius', () => {
    it('Then desired speed decreases proportionally with target distance', () => {
      expect(arrive(stationary(0, 0), { x: 10, y: 0 }, { maxSpeed: 10, maxForce: 5, slowingRadius: 100 })).toEqual({ x: 1, y: 0 });
    });

    it('Then it rejects a non-positive slowing radius', () => {
      expect(() => arrive(stationary(0, 0), { x: 1, y: 1 }, { slowingRadius: 0 })).toThrow(RangeError);
    });
  });

  describe('When an agent flees from a target', () => {
    it('Then it moves away only while inside an optional radius', () => {
      expect(flee(stationary(10, 0), { x: 0, y: 0 }, { maxSpeed: 10, maxForce: 3, radius: 20 })).toEqual({ x: 3, y: 0 });
      expect(flee(stationary(30, 0), { x: 0, y: 0 }, { radius: 20 })).toEqual({ x: 0, y: 0 });
      expect(flee(stationary(0, 0), { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe('When an agent has nearby neighbours', () => {
    it('Then separation pushes it away and ignores distant or coincident neighbours safely', () => {
      const agent = stationary(0, 0);
      expect(separate(agent, [agent, stationary(5, 0)], { distance: 10, maxSpeed: 10, maxForce: 2 })).toEqual({ x: -2, y: 0 });
      expect(separate(agent, [stationary(20, 0)], { distance: 10 })).toEqual({ x: 0, y: 0 });
      expect(separate(agent, [stationary(0, 0)], { distance: 10 })).toEqual({ x: 0, y: 0 });
    });

    it('Then it rejects a non-positive separation distance', () => {
      expect(() => separate(stationary(0, 0), [], { distance: -1 })).toThrow(RangeError);
    });
  });

  describe('When multiple weighted steering forces are combined', () => {
    it('Then it applies weights before limiting the result', () => {
      expect(combineSteering([
        { force: { x: 3, y: 4 } },
        { force: { x: 6, y: 8 }, weight: 0.5 },
      ], 5)).toEqual({ x: 3, y: 4 });
    });

    it('Then it rejects non-finite weights', () => {
      expect(() => combineSteering([{ force: { x: 1, y: 2 }, weight: Number.NaN }])).toThrow(RangeError);
    });
  });
});
