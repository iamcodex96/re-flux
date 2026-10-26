/**
 * Renderer-independent steering behaviours inspired by autonomous-agent simulations.
 * Behaviours return steering forces; callers own integration, scheduling and rendering.
 */
import { sampleFlowField, type FlowField, type FlowFieldEdgeMode } from './flowField.js';
import {
  addVectors,
  limitVector,
  normalizeVector,
  scaleVector,
  subtractVectors,
  vectorMagnitude,
  type Vector2,
} from './utils/vector2.js';

/** Position and velocity of an autonomous agent. Velocity is measured in units per second. */
export interface SteeringAgent extends Vector2 {
  readonly vx: number;
  readonly vy: number;
}

export interface SteeringOptions {
  /** Desired maximum speed, in units per second. Defaults to 100. */
  readonly maxSpeed?: number;
  /** Maximum steering force (acceleration), in units per second squared. Defaults to 10. */
  readonly maxForce?: number;
}

export interface ArriveOptions extends SteeringOptions {
  /** Distance over which desired speed decreases to zero. Defaults to 100 units. */
  readonly slowingRadius?: number;
}

export interface FleeOptions extends SteeringOptions {
  /** Optional radius outside which no flee force is returned. */
  readonly radius?: number;
}

export interface SeparationOptions extends SteeringOptions {
  /** Minimum preferred separation distance. Defaults to 24 units. */
  readonly distance?: number;
}

export interface SteeringStepOptions {
  /** Maximum velocity magnitude after each step, in units per second. Defaults to 100. */
  readonly maxSpeed?: number;
  /** Exponential velocity damping coefficient in 1/seconds. Defaults to no damping. */
  readonly linearDamping?: number;
  /** Optional cap for a single integration step, in seconds. No cap is applied by default. */
  readonly maxDeltaSeconds?: number;
}

export interface FlowFollowingOptions extends SteeringOptions {
  /** Sampling behavior outside the field. Defaults to 'clamp'. */
  readonly edgeMode?: FlowFieldEdgeMode;
}

export interface WeightedSteeringForce {
  readonly force: Vector2;
  /** Multiplier for this force. Negative weights can intentionally reverse a behavior. */
  readonly weight?: number;
}

const DEFAULT_MAX_SPEED = 100;
const DEFAULT_MAX_FORCE = 10;
const DEFAULT_ARRIVE_RADIUS = 100;
const DEFAULT_SEPARATION_DISTANCE = 24;
const ZERO_VECTOR: Vector2 = Object.freeze({ x: 0, y: 0 });


/**
 * Turn a steering force into a new agent state using semi-implicit Euler integration.
 * The steering force is treated as acceleration (equivalent to unit mass); no input is mutated.
 */
export function stepSteeringAgent(
  agent: SteeringAgent,
  steeringForce: Vector2,
  deltaSeconds: number,
  options: SteeringStepOptions = {},
): SteeringAgent {
  assertFiniteAgent(agent);
  assertFiniteVector(steeringForce, 'Steering force');
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Steering deltaSeconds must be a finite non-negative number.');
  }

  const maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED;
  const linearDamping = options.linearDamping ?? 0;
  const maxDeltaSeconds = options.maxDeltaSeconds;
  if (!Number.isFinite(maxSpeed) || maxSpeed < 0) {
    throw new RangeError('Steering step maxSpeed must be a finite non-negative number.');
  }
  if (!Number.isFinite(linearDamping) || linearDamping < 0) {
    throw new RangeError('Steering linearDamping must be a finite non-negative number.');
  }
  if (maxDeltaSeconds !== undefined && (!Number.isFinite(maxDeltaSeconds) || maxDeltaSeconds <= 0)) {
    throw new RangeError('Steering maxDeltaSeconds must be a finite number greater than zero when supplied.');
  }
  if (deltaSeconds === 0) return { x: agent.x, y: agent.y, vx: agent.vx, vy: agent.vy };

  const delta = maxDeltaSeconds === undefined ? deltaSeconds : Math.min(deltaSeconds, maxDeltaSeconds);
  const acceleratedVelocity = {
    x: agent.vx + steeringForce.x * delta,
    y: agent.vy + steeringForce.y * delta,
  };
  assertFiniteVector(acceleratedVelocity, 'Integrated velocity');
  const dampingFactor = Math.exp(-linearDamping * delta);
  const dampedVelocity = scaleVector(acceleratedVelocity, dampingFactor);
  assertFiniteVector(dampedVelocity, 'Damped velocity');
  if (!Number.isFinite(vectorMagnitude(dampedVelocity))) {
    throw new RangeError('Integrated velocity magnitude exceeds the finite numeric range.');
  }
  const velocity = limitVector(dampedVelocity, maxSpeed);
  const position = { x: agent.x + velocity.x * delta, y: agent.y + velocity.y * delta };
  assertFiniteVector(position, 'Integrated position');
  return { ...position, vx: velocity.x, vy: velocity.y };
}

/** Steer toward the vector direction sampled from a flow field at the agent's position. */
export function followFlowField(
  agent: SteeringAgent,
  field: FlowField,
  options: FlowFollowingOptions = {},
): Vector2 {
  assertFiniteAgent(agent);
  const { maxSpeed, maxForce } = resolveLimits(options);
  const flow = sampleFlowField(field, agent, options.edgeMode ?? 'clamp');
  const desiredVelocity = scaleVector(normalizeVector(flow), maxSpeed);
  return limitVector(subtractVectors(desiredVelocity, velocityOf(agent)), maxForce);
}

/** Steer an agent toward a target at its desired maximum speed. */
export function seek(agent: SteeringAgent, target: Vector2, options: SteeringOptions = {}): Vector2 {
  const { maxSpeed, maxForce } = resolveLimits(options);
  const desiredVelocity = scaleVector(normalizeVector(subtractVectors(target, agent)), maxSpeed);
  return limitVector(subtractVectors(desiredVelocity, velocityOf(agent)), maxForce);
}

/** Steer toward a target while reducing desired speed inside a slowing radius. */
export function arrive(agent: SteeringAgent, target: Vector2, options: ArriveOptions = {}): Vector2 {
  const { maxSpeed, maxForce } = resolveLimits(options);
  const slowingRadius = options.slowingRadius ?? DEFAULT_ARRIVE_RADIUS;
  if (!Number.isFinite(slowingRadius) || slowingRadius <= 0) {
    throw new RangeError('Arrive slowingRadius must be a finite number greater than zero.');
  }

  const offset = subtractVectors(target, agent);
  const distance = vectorMagnitude(offset);
  const desiredSpeed = Math.min(maxSpeed, (distance / slowingRadius) * maxSpeed);
  const desiredVelocity = scaleVector(normalizeVector(offset), desiredSpeed);
  return limitVector(subtractVectors(desiredVelocity, velocityOf(agent)), maxForce);
}

/** Steer away from a target. If radius is supplied, the force is zero outside it. */
export function flee(agent: SteeringAgent, target: Vector2, options: FleeOptions = {}): Vector2 {
  const { maxSpeed, maxForce } = resolveLimits(options);
  const offset = subtractVectors(agent, target);
  const distance = vectorMagnitude(offset);
  if (options.radius !== undefined) {
    if (!Number.isFinite(options.radius) || options.radius <= 0) {
      throw new RangeError('Flee radius must be a finite number greater than zero when supplied.');
    }
    if (distance >= options.radius) return { ...ZERO_VECTOR };
  }
  // At exactly the target there is no geometrically meaningful flee direction.
  if (distance === 0) return { ...ZERO_VECTOR };
  const desiredVelocity = scaleVector(normalizeVector(offset), maxSpeed);
  return limitVector(subtractVectors(desiredVelocity, velocityOf(agent)), maxForce);
}

/**
 * Steer away from nearby agents. Neighbours outside `distance` and the agent itself are ignored.
 * Coincident neighbours are skipped because their separation direction is undefined.
 */
export function separate(
  agent: SteeringAgent,
  neighbours: Iterable<SteeringAgent>,
  options: SeparationOptions = {},
): Vector2 {
  const { maxSpeed, maxForce } = resolveLimits(options);
  const separationDistance = options.distance ?? DEFAULT_SEPARATION_DISTANCE;
  if (!Number.isFinite(separationDistance) || separationDistance <= 0) {
    throw new RangeError('Separation distance must be a finite number greater than zero.');
  }

  let accumulated = { x: 0, y: 0 };
  let count = 0;
  for (const neighbour of neighbours) {
    if (neighbour === agent) continue;
    const offset = subtractVectors(agent, neighbour);
    const distance = vectorMagnitude(offset);
    if (distance === 0 || distance >= separationDistance) continue;
    const strength = (separationDistance - distance) / separationDistance;
    accumulated = addVectors(accumulated, scaleVector(offset, strength / distance));
    count += 1;
  }

  if (count === 0) return { ...ZERO_VECTOR };
  const average = scaleVector(accumulated, 1 / count);
  const influence = Math.min(1, vectorMagnitude(average));
  if (influence === 0) return { ...ZERO_VECTOR };
  const desiredVelocity = scaleVector(normalizeVector(average), maxSpeed * influence);
  return limitVector(subtractVectors(desiredVelocity, velocityOf(agent)), maxForce);
}

/** Combine weighted steering forces, then cap their resulting magnitude. */
export function combineSteering(
  forces: Iterable<WeightedSteeringForce>,
  maxForce = DEFAULT_MAX_FORCE,
): Vector2 {
  if (!Number.isFinite(maxForce) || maxForce < 0) {
    throw new RangeError('Maximum combined steering force must be a finite non-negative number.');
  }
  let combined: Vector2 = { x: 0, y: 0 };
  for (const item of forces) {
    const weight = item.weight ?? 1;
    if (!Number.isFinite(weight)) throw new RangeError('Steering force weights must be finite numbers.');
    combined = addVectors(combined, scaleVector(item.force, weight));
  }
  return limitVector(combined, maxForce);
}

function resolveLimits(options: SteeringOptions): { maxSpeed: number; maxForce: number } {
  const maxSpeed = options.maxSpeed ?? DEFAULT_MAX_SPEED;
  const maxForce = options.maxForce ?? DEFAULT_MAX_FORCE;
  if (!Number.isFinite(maxSpeed) || maxSpeed < 0) {
    throw new RangeError('Steering maxSpeed must be a finite non-negative number.');
  }
  if (!Number.isFinite(maxForce) || maxForce < 0) {
    throw new RangeError('Steering maxForce must be a finite non-negative number.');
  }
  return { maxSpeed, maxForce };
}

function assertFiniteAgent(agent: SteeringAgent): void {
  if (!agent || !Number.isFinite(agent.x) || !Number.isFinite(agent.y)
    || !Number.isFinite(agent.vx) || !Number.isFinite(agent.vy)) {
    throw new RangeError('Steering agent position and velocity must be finite numbers.');
  }
}

function assertFiniteVector(vector: Vector2, label: string): void {
  if (!vector || !Number.isFinite(vector.x) || !Number.isFinite(vector.y)) {
    throw new RangeError(`${label} must contain finite x and y coordinates.`);
  }
}

function velocityOf(agent: SteeringAgent): Vector2 {
  return { x: agent.vx, y: agent.vy };
}
