import { validateFrame } from './helpers.js';
import type { CanvasDemoSize } from './types.js';

/** Configuration for deterministic, time-driven Canvas fireworks. */
export interface FireworksOptions {
  readonly burstCount?: number;
  readonly particlesPerBurst?: number;
  readonly maxRadius?: number;
  readonly trailLength?: number;
  readonly color?: string;
  readonly accentColor?: string;
}

/**
 * Draws a looping firework field from a single phase value. It is intentionally stateless:
 * the same phase and dimensions always produce the same frame, so it can be scheduled by bindCanvas.
 */
export function drawFireworks(
  context: CanvasRenderingContext2D,
  phase: number,
  size: CanvasDemoSize,
  options: FireworksOptions = {},
): void {
  validateFrame(phase, size);
  const burstCount = options.burstCount ?? 4;
  const particlesPerBurst = options.particlesPerBurst ?? 28;
  const maxRadius = options.maxRadius ?? Math.min(size.width, size.height) * 0.28;
  const trailLength = options.trailLength ?? 0.075;
  if (!Number.isInteger(burstCount) || burstCount < 1 || burstCount > 12) {
    throw new RangeError('Firework burstCount must be an integer from 1 to 12.');
  }
  if (!Number.isInteger(particlesPerBurst) || particlesPerBurst < 4 || particlesPerBurst > 160) {
    throw new RangeError('Firework particlesPerBurst must be an integer from 4 to 160.');
  }
  if (!Number.isFinite(maxRadius) || maxRadius < 0 || !Number.isFinite(trailLength) || trailLength <= 0 || trailLength > 0.3) {
    throw new RangeError('Firework radius must be non-negative and trailLength must be in (0, 0.3].');
  }

  const cycle = phase / (Math.PI * 2);
  const baseColor = options.color ?? '#67e8f9';
  const accentColor = options.accentColor ?? '#c4b5fd';
  context.save();
  try {
    for (let burst = 0; burst < burstCount; burst += 1) {
      const local = ((cycle + burst / burstCount) % 1 + 1) % 1;
      const activeDuration = 0.78;
      if (local >= activeDuration) continue;
      const age = local / activeDuration;
      const fade = Math.pow(1 - age, 1.55);
      const centerX = size.width * (0.16 + 0.68 * pseudoRandom(burst * 11 + 3));
      const centerY = size.height * (0.22 + 0.52 * pseudoRandom(burst * 17 + 9));
      const radius = maxRadius * Math.pow(age, 0.88);
      const previousRadius = maxRadius * Math.pow(Math.max(0, age - trailLength), 0.88);
      context.globalAlpha = fade;
      context.lineWidth = 1.15 + (1 - age) * 1.2;
      for (let particle = 0; particle < particlesPerBurst; particle += 1) {
        const angle = (particle / particlesPerBurst) * Math.PI * 2 + burst * 0.21;
        const irregularity = 0.72 + pseudoRandom(burst * 997 + particle * 31 + 5) * 0.56;
        const distance = radius * irregularity;
        const previousDistance = previousRadius * irregularity;
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * previousDistance, centerY + Math.sin(angle) * previousDistance);
        context.lineTo(centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance);
        context.strokeStyle = particle % 5 === 0 ? accentColor : baseColor;
        context.stroke();
      }
      context.globalAlpha = fade * 0.85;
      context.beginPath();
      context.arc(centerX, centerY, Math.max(0.8, 2.5 * (1 - age)), 0, Math.PI * 2);
      context.fillStyle = accentColor;
      context.fill();
    }
  } finally {
    context.restore();
  }
}


function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
}
