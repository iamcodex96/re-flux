import { validateFrame } from './helpers.js';
import type { CanvasDemoSize } from './types.js';

export interface WireframeSphereOptions {
  readonly latitudeLines?: number;
  readonly longitudeLines?: number;
  readonly color?: string;
  readonly accentColor?: string;
  readonly rotationSpeed?: number;
}

/** Draw a perspective wireframe sphere with independent longitude and latitude curves. */
export function drawWireframeSphere(
  context: CanvasRenderingContext2D,
  phase: number,
  size: CanvasDemoSize,
  options: WireframeSphereOptions = {},
): void {
  validateFrame(phase, size);
  const latitudeLines = options.latitudeLines ?? 9;
  const longitudeLines = options.longitudeLines ?? 13;
  const rotationSpeed = options.rotationSpeed ?? 0.7;
  if (!Number.isInteger(latitudeLines) || latitudeLines < 2 || latitudeLines > 24) throw new RangeError('Latitude line count must be an integer from 2 to 24.');
  if (!Number.isInteger(longitudeLines) || longitudeLines < 3 || longitudeLines > 32) throw new RangeError('Longitude line count must be an integer from 3 to 32.');
  if (!Number.isFinite(rotationSpeed)) throw new RangeError('Sphere rotation speed must be finite.');

  const { width, height } = size;
  const radius = Math.min(width, height) * 0.31;
  const rotateY = phase * rotationSpeed;
  const rotateX = Math.sin(phase * 0.43) * 0.34;
  const focalLength = Math.max(120, Math.min(width, height) * 2.8);
  const project = (latitude: number, longitude: number): { x: number; y: number; z: number } => {
    const x0 = Math.cos(latitude) * Math.cos(longitude) * radius;
    const y0 = Math.sin(latitude) * radius;
    const z0 = Math.cos(latitude) * Math.sin(longitude) * radius;
    const x1 = x0 * Math.cos(rotateY) + z0 * Math.sin(rotateY);
    const z1 = -x0 * Math.sin(rotateY) + z0 * Math.cos(rotateY);
    const y2 = y0 * Math.cos(rotateX) - z1 * Math.sin(rotateX);
    const z2 = y0 * Math.sin(rotateX) + z1 * Math.cos(rotateX);
    const perspective = focalLength / (focalLength + z2);
    return { x: width / 2 + x1 * perspective, y: height / 2 + y2 * perspective, z: z2 / radius };
  };

  context.save();
  try {
    for (let line = 1; line <= latitudeLines; line += 1) {
      const latitude = -Math.PI / 2 + (Math.PI * line) / (latitudeLines + 1);
      context.beginPath();
      let averageDepth = 0;
      const samples = 68;
      for (let sample = 0; sample <= samples; sample += 1) {
        const point = project(latitude, (sample / samples) * Math.PI * 2);
        averageDepth += point.z;
        if (sample === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = (options.color ?? '#67e8f9');
      context.globalAlpha = 0.28 + (averageDepth / (samples + 1) + 1) * 0.24;
      context.lineWidth = Math.abs(latitude) < 0.25 ? 1.35 : 0.85;
      context.stroke();
    }

    for (let line = 0; line < longitudeLines; line += 1) {
      const longitude = (line / longitudeLines) * Math.PI * 2;
      context.beginPath();
      let averageDepth = 0;
      const samples = 56;
      for (let sample = 0; sample <= samples; sample += 1) {
        const latitude = -Math.PI / 2 + (sample / samples) * Math.PI;
        const point = project(latitude, longitude);
        averageDepth += point.z;
        if (sample === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.strokeStyle = line % 3 === 0 ? (options.accentColor ?? '#a78bfa') : (options.color ?? '#67e8f9');
      context.globalAlpha = 0.3 + (averageDepth / (samples + 1) + 1) * 0.23;
      context.lineWidth = line % 3 === 0 ? 1.2 : 0.75;
      context.stroke();
    }
  } finally {
    context.restore();
  }
}
