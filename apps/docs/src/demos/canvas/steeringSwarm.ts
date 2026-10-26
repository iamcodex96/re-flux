import {
  arrive,
  combineSteering,
  followFlowField,
  seek,
  separate,
  stepSteeringAgent,
  type SteeringAgent,
  type WeightedSteeringForce,
} from '@lib/steering';
import { createFlowField, type FlowField } from '@lib/flow-field';
import type { Vector2 } from '../../../../../src/utils/vector2.js';

export type SteeringDemoMode = 'flow' | 'seek' | 'arrive';

export interface SteeringSwarmAgent {
  readonly id: number;
  readonly phase: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: Vector2[];
}

export interface SteeringSwarmSimulation {
  readonly width: number;
  readonly height: number;
  readonly field: FlowField;
  readonly agents: SteeringSwarmAgent[];
  elapsed: number;
}

export interface SteeringSwarmDrawOptions {
  readonly showField?: boolean;
  readonly target?: Vector2;
  readonly agentColor?: string;
  readonly accentColor?: string;
  readonly fieldColor?: string;
  readonly linkColor?: string;
  readonly targetColor?: string;
}

export interface SteeringSwarmStepOptions {
  readonly mode: SteeringDemoMode;
  readonly target: Vector2;
  readonly maxSpeed: number;
  readonly maxForce: number;
  /** Optional pointer/target attraction when following a field, from 0 (off) to 1 (full). */
  readonly targetInfluence?: number;
}

const DEFAULT_AGENT_COUNT = 38;
const MAX_TRAIL_LENGTH = 14;
const DEFAULT_AGENT_COLOR = '#67e8f9';
const DEFAULT_ACCENT_COLOR = '#a78bfa';
const DEFAULT_FIELD_COLOR = 'rgba(103, 232, 249, 0.24)';
const DEFAULT_LINK_COLOR = 'rgba(103, 232, 249, 0.16)';
const DEFAULT_TARGET_COLOR = '#f6b96e';

/** Create a deterministic, resize-specific swarm and its immutable flow field. */
export function createSteeringSwarm(
  width: number,
  height: number,
  count = DEFAULT_AGENT_COUNT,
): SteeringSwarmSimulation {
  assertPositiveFinite(width, 'Swarm width');
  assertPositiveFinite(height, 'Swarm height');
  if (!Number.isSafeInteger(count) || count < 2 || count > 180) {
    throw new RangeError('Swarm agent count must be an integer from 2 to 180.');
  }

  const cellSize = Math.max(26, Math.min(42, Math.min(width, height) / 6.5));
  const columns = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const centerX = width / 2;
  const centerY = height / 2;
  const field = createFlowField({
    columns,
    rows,
    cellSize,
    vectorAtCell: (cell) => {
      const dx = cell.x - centerX;
      const dy = cell.y - centerY;
      const angle = Math.atan2(dy, dx) + Math.PI / 2 + Math.sin(cell.x * 0.012 + cell.y * 0.018) * 0.62;
      return { x: Math.cos(angle), y: Math.sin(angle) };
    },
  });

  const agents = Array.from({ length: count }, (_, index): SteeringSwarmAgent => {
    const seed = index + 1;
    const x = ((seed * 0.618033988749895) % 1) * width;
    const y = ((seed * 0.754877666246693) % 1) * height;
    const angle = seed * 2.399963229728653;
    return {
      id: index,
      phase: angle,
      x,
      y,
      vx: Math.cos(angle) * 12,
      vy: Math.sin(angle) * 12,
      trail: [{ x, y }],
    };
  });

  return { width, height, field, agents, elapsed: 0 };
}

/** Step all agents from one immutable snapshot so the result is independent of array order. */
export function stepSteeringSwarm(
  simulation: SteeringSwarmSimulation,
  deltaSeconds: number,
  options: SteeringSwarmStepOptions,
): SteeringSwarmSimulation {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError('Swarm deltaSeconds must be a finite non-negative number.');
  }
  assertPositiveFinite(options.maxSpeed, 'Swarm maximum speed');
  assertPositiveFinite(options.maxForce, 'Swarm maximum force');
  if (!Number.isFinite(options.target.x) || !Number.isFinite(options.target.y)) {
    throw new RangeError('Swarm target must contain finite x and y coordinates.');
  }
  const targetInfluence = options.targetInfluence ?? 0;
  if (!Number.isFinite(targetInfluence) || targetInfluence < 0 || targetInfluence > 1) {
    throw new RangeError('Swarm targetInfluence must be a finite number from 0 to 1.');
  }
  if (deltaSeconds === 0) return simulation;

  const delta = Math.min(deltaSeconds, 0.04);
  simulation.elapsed += delta;
  const snapshot: SteeringAgent[] = simulation.agents.map(({ x, y, vx, vy }) => ({ x, y, vx, vy }));
  const maxForce = options.maxForce;
  const maxSpeed = options.maxSpeed;

  simulation.agents.forEach((agent, index) => {
    const body = snapshot[index];
    if (!body) return;
    const separation = separate(body, snapshot, {
      distance: Math.max(18, Math.min(34, maxSpeed * 0.22)),
      maxSpeed,
      maxForce: maxForce * 0.72,
    });
    const primary = options.mode === 'flow'
      ? followFlowField(body, simulation.field, { maxSpeed, maxForce, edgeMode: 'wrap' })
      : options.mode === 'arrive'
        ? arrive(body, options.target, { maxSpeed, maxForce, slowingRadius: Math.min(simulation.width, simulation.height) * 0.34 })
        : seek(body, options.target, { maxSpeed, maxForce });

    const wander: Vector2 = options.mode === 'flow'
      ? { x: Math.cos(simulation.elapsed * 0.8 + agent.phase) * 1.5, y: Math.sin(simulation.elapsed * 0.73 + agent.phase) * 1.5 }
      : { x: Math.cos(simulation.elapsed * 1.1 + agent.phase) * 3, y: Math.sin(simulation.elapsed * 0.95 + agent.phase) * 3 };
    const forces: WeightedSteeringForce[] = [
      { force: primary, weight: 1 },
      { force: separation, weight: 0.85 },
      { force: wander, weight: 0.3 },
    ];
    if (options.mode === 'flow' && targetInfluence > 0) {
      forces.push({
        force: seek(body, options.target, { maxSpeed, maxForce: maxForce * 0.72 }),
        weight: targetInfluence,
      });
    }
    const force = combineSteering(forces, maxForce * 1.35);
    const next = stepSteeringAgent(body, force, delta, {
      maxSpeed,
      linearDamping: 0.32,
      maxDeltaSeconds: 0.04,
    });

    const wrappedX = next.x < 0 || next.x >= simulation.width;
    const wrappedY = next.y < 0 || next.y >= simulation.height;
    agent.x = wrap(next.x, simulation.width);
    agent.y = wrap(next.y, simulation.height);
    agent.vx = next.vx;
    agent.vy = next.vy;
    if (wrappedX || wrappedY) {
      agent.trail = [{ x: agent.x, y: agent.y }];
    } else {
      agent.trail.push({ x: agent.x, y: agent.y });
      if (agent.trail.length > MAX_TRAIL_LENGTH) agent.trail.shift();
    }
  });

  return simulation;
}

/** Draw the flow vectors, agent trails, proximity links and optional interaction target. */
export function drawSteeringSwarm(
  context: CanvasRenderingContext2D,
  simulation: SteeringSwarmSimulation,
  options: SteeringSwarmDrawOptions = {},
): void {
  const { width, height } = simulation;
  context.save();
  try {
    context.clearRect(0, 0, width, height);
    if (options.showField) drawFlowField(context, simulation.field, options.fieldColor ?? DEFAULT_FIELD_COLOR);

    const linkDistance = Math.max(34, Math.min(62, Math.min(width, height) * 0.16));
    context.lineWidth = 0.7;
    context.strokeStyle = options.linkColor ?? DEFAULT_LINK_COLOR;
    for (let index = 0; index < simulation.agents.length; index += 1) {
      const first = simulation.agents[index];
      if (!first) continue;
      for (let otherIndex = index + 1; otherIndex < simulation.agents.length; otherIndex += 1) {
        const other = simulation.agents[otherIndex];
        if (!other) continue;
        if (Math.hypot(first.x - other.x, first.y - other.y) > linkDistance) continue;
        context.beginPath();
        context.moveTo(first.x, first.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    }

    simulation.agents.forEach((agent) => {
      if (agent.trail.length > 1) {
        context.beginPath();
        agent.trail.forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        context.strokeStyle = options.agentColor ?? DEFAULT_AGENT_COLOR;
        context.globalAlpha = 0.23;
        context.lineWidth = 1.15;
        context.stroke();
        context.globalAlpha = 1;
      }
      context.beginPath();
      context.arc(agent.x, agent.y, agent.id % 7 === 0 ? 2.6 : 1.8, 0, Math.PI * 2);
      context.fillStyle = agent.id % 7 === 0 ? (options.accentColor ?? DEFAULT_ACCENT_COLOR) : (options.agentColor ?? DEFAULT_AGENT_COLOR);
      context.fill();
    });

    if (options.target) {
      context.beginPath();
      context.arc(options.target.x, options.target.y, 7, 0, Math.PI * 2);
      context.strokeStyle = options.targetColor ?? DEFAULT_TARGET_COLOR;
      context.lineWidth = 1.4;
      context.stroke();
      context.beginPath();
      context.arc(options.target.x, options.target.y, 2, 0, Math.PI * 2);
      context.fillStyle = options.targetColor ?? DEFAULT_TARGET_COLOR;
      context.fill();
    }
  } finally {
    context.restore();
  }
}

function drawFlowField(context: CanvasRenderingContext2D, field: FlowField, color: string): void {
  context.strokeStyle = color;
  context.lineWidth = 0.85;
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns; column += 1) {
      const index = row * field.columns + column;
      const vector = field.vectors[index];
      if (!vector) continue;
      const x = field.origin.x + (column + 0.5) * field.cellSize;
      const y = field.origin.y + (row + 0.5) * field.cellSize;
      const length = Math.min(8, field.cellSize * 0.22);
      const endX = x + vector.x * length;
      const endY = y + vector.y * length;
      const head = 2.1;
      const angle = Math.atan2(vector.y, vector.x);
      context.beginPath();
      context.moveTo(x - vector.x * length * 0.55, y - vector.y * length * 0.55);
      context.lineTo(endX, endY);
      context.moveTo(endX - Math.cos(angle - 0.55) * head, endY - Math.sin(angle - 0.55) * head);
      context.lineTo(endX, endY);
      context.lineTo(endX - Math.cos(angle + 0.55) * head, endY - Math.sin(angle + 0.55) * head);
      context.stroke();
    }
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and greater than zero.`);
}

function wrap(value: number, extent: number): number {
  return ((value % extent) + extent) % extent;
}
