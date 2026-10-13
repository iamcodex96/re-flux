import { validateFrame } from './helpers.js';
import type { CanvasDemoSize } from './types.js';

export interface ParticleConstellationOptions {
  readonly count?: number;
  readonly connectionDistance?: number;
  readonly speed?: number;
  readonly nodeColor?: string;
  readonly accentColor?: string;
  readonly linkColor?: string;
}

/** Draw a deterministic particle constellation. `phase` is in radians and should be driven by a stream. */
export function drawParticleConstellation(
  context: CanvasRenderingContext2D,
  phase: number,
  size: CanvasDemoSize,
  options: ParticleConstellationOptions = {},
): void {
  validateFrame(phase, size);
  const count = options.count ?? 76;
  const connectionDistance = options.connectionDistance ?? 54;
  const speed = options.speed ?? 0.32;
  if (!Number.isInteger(count) || count < 2 || count > 240) throw new RangeError('Particle count must be an integer from 2 to 240.');
  if (!Number.isFinite(connectionDistance) || connectionDistance <= 0) throw new RangeError('Connection distance must be finite and greater than zero.');
  if (!Number.isFinite(speed)) throw new RangeError('Particle speed must be finite.');

  const { width, height } = size;
  const scale = Math.min(width, height);
  const points = Array.from({ length: count }, (_, index) => {
    const seed = index * 2.399963229728653;
    const normalizedRadius = 0.08 + Math.sqrt((index + 1) / count) * 0.41;
    const wobble = 0.82 + Math.sin(phase * 0.73 + seed) * 0.1;
    return {
      x: width / 2 + Math.cos(seed + phase * speed) * scale * normalizedRadius * wobble,
      y: height / 2 + Math.sin(seed + phase * speed) * scale * normalizedRadius * 0.72 * wobble,
      radius: 1.05 + (index % 4) * 0.34,
      accent: index % 7 === 0 || index % 13 === 0,
    };
  });

  context.save();
  try {
    context.lineWidth = 0.8;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index]!;
      for (let otherIndex = index + 1; otherIndex < points.length; otherIndex += 1) {
        const other = points[otherIndex]!;
        const distance = Math.hypot(point.x - other.x, point.y - other.y);
        if (distance >= connectionDistance) continue;
        const alpha = 0.22 * (1 - distance / connectionDistance);
        context.globalAlpha = alpha;
        context.strokeStyle = options.linkColor ?? '#67e8f9';
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(other.x, other.y);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
    points.forEach((point) => {
      context.beginPath();
      context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      context.fillStyle = point.accent ? (options.accentColor ?? '#d8b4fe') : (options.nodeColor ?? '#67e8f9');
      context.fill();
    });
  } finally {
    context.restore();
  }
}

