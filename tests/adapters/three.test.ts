import { describe, expect, it } from '@jest/globals';
import { Subject } from 'rxjs';
import { bindThreeObject, type ThreeObjectLike, type ThreeTransformSnapshot } from '../../src/adapters/three.js';

function fakeObject(): ThreeObjectLike & { matrixUpdates: number } {
  return {
    position: { x: 1, y: 2, z: 3 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    matrixUpdates: 0,
    updateMatrix() { this.matrixUpdates += 1; },
  };
}

describe('bindThreeObject', () => {
  it('applies snapshots, restores omitted axes and restores original transforms on unsubscribe', () => {
    const target = fakeObject();
    const source = new Subject<ThreeTransformSnapshot>();
    const binding = bindThreeObject(target, source);

    source.next({ position: { x: 100, y: 200 }, scale: { x: 2 } });
    expect(target.position).toEqual({ x: 100, y: 200, z: 3 });
    expect(target.scale).toEqual({ x: 2, y: 1, z: 1 });

    source.next({ position: { x: 50 }, rotation: { z: 1 } });
    expect(target.position).toEqual({ x: 50, y: 2, z: 3 });
    expect(target.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(target.rotation.z).toBe(1);

    binding.unsubscribe();
    expect(target.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(target.rotation).toEqual({ x: 0, y: 0, z: 0 });
    expect(target.scale).toEqual({ x: 1, y: 1, z: 1 });
    expect(target.matrixUpdates).toBe(3);
  });

  it('restores a touched transform when a later snapshot marks its group null', () => {
    const target = fakeObject();
    const source = new Subject<ThreeTransformSnapshot>();
    const binding = bindThreeObject(target, source);
    source.next({ position: { x: 10 } });
    source.next({ position: null });
    expect(target.position.x).toBe(1);
    binding.unsubscribe();
    expect(target.position.x).toBe(1);
  });
});
