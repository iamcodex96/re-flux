import { Subscription, type Observable } from 'rxjs';

/** Minimal writable vector shape compatible with Three.js Vector3 and Euler instances. */
export interface ThreeVectorLike {
  x: number;
  y: number;
  z: number;
}

/** Structural subset of Object3D; no Three.js package import or runtime dependency is required. */
export interface ThreeObjectLike {
  readonly position: ThreeVectorLike;
  readonly rotation: ThreeVectorLike;
  readonly scale: ThreeVectorLike;
  updateMatrix?: () => void;
}

export type ThreeVectorSnapshot = Readonly<Partial<ThreeVectorLike>>;

/** Complete transform snapshot. Omitted groups/axes that were previously controlled are restored. */
export interface ThreeTransformSnapshot {
  readonly position?: ThreeVectorSnapshot | null;
  readonly rotation?: ThreeVectorSnapshot | null;
  readonly scale?: ThreeVectorSnapshot | null;
}

type TransformGroup = 'position' | 'rotation' | 'scale';
type Axis = 'x' | 'y' | 'z';
type ComponentKey = `${TransformGroup}.${Axis}`;

const GROUPS: readonly TransformGroup[] = ['position', 'rotation', 'scale'];
const AXES: readonly Axis[] = ['x', 'y', 'z'];

/**
 * Binds transform snapshots to a Three.js-like Object3D without importing Three.js. Values are applied
 * synchronously when emitted, so they can be consumed by the renderer's own loop. Every touched axis
 * is restored to its original value when omitted later or when the returned subscription is unsubscribed.
 */
export function bindThreeObject(
  target: ThreeObjectLike,
  transforms$: Observable<ThreeTransformSnapshot>,
): Subscription {
  const originals = new Map<ComponentKey, number>();
  let activeKeys = new Set<ComponentKey>();
  const binding = new Subscription();

  const restore = (key: ComponentKey): void => {
    const [group, axis] = key.split('.') as [TransformGroup, Axis];
    const original = originals.get(key);
    if (original !== undefined) target[group][axis] = original;
  };

  const updateMatrix = (): void => target.updateMatrix?.();

  const upstream = transforms$.subscribe((snapshot) => {
    const nextKeys = new Set<ComponentKey>();

    for (const group of GROUPS) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, group)) continue;
      const vector = snapshot[group];
      if (vector === null || vector === undefined) continue;
      for (const axis of AXES) {
        const value = vector[axis];
        if (value === undefined) continue;
        if (!Number.isFinite(value)) throw new RangeError(`Three transform ${group}.${axis} must be finite.`);
        nextKeys.add(`${group}.${axis}`);
      }
    }

    for (const key of activeKeys) {
      if (!nextKeys.has(key)) restore(key);
    }

    for (const group of GROUPS) {
      const vector = snapshot[group];
      if (!vector) continue;
      for (const axis of AXES) {
        const value = vector[axis];
        if (value === undefined) continue;
        const key: ComponentKey = `${group}.${axis}`;
        if (!originals.has(key)) originals.set(key, target[group][axis]);
        target[group][axis] = value;
      }
    }

    activeKeys = nextKeys;
    updateMatrix();
  });

  binding.add(upstream);
  binding.add(() => {
    for (const key of originals.keys()) restore(key);
    originals.clear();
    activeKeys.clear();
    updateMatrix();
  });

  return binding;
}
