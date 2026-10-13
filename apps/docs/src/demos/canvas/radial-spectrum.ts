import { validateFrame } from './helpers.js';
import type { CanvasDemoSize } from './types.js';

export interface RadialSpectrumOptions {
  readonly bars?: number;
  readonly innerRadius?: number;
  readonly maxBarLength?: number;
  readonly color?: string;
  readonly accentColor?: string;
}

/** Draw a radial procedural spectrum, useful for audio-reactive or data-reactive visuals. */
export function drawRadialSpectrum(
  context: CanvasRenderingContext2D,
  phase: number,
  size: CanvasDemoSize,
  options: RadialSpectrumOptions = {},
): void {
  validateFrame(phase, size);
  const bars = options.bars ?? 96;
  const innerRadius = options.innerRadius ?? Math.min(size.width, size.height) * 0.18;
  const maxBarLength = options.maxBarLength ?? Math.min(size.width, size.height) * 0.19;
  if (!Number.isInteger(bars) || bars < 12 || bars > 256) throw new RangeError('Spectrum bars must be an integer from 12 to 256.');
  if (!Number.isFinite(innerRadius) || innerRadius < 0) throw new RangeError('Inner radius must be finite and non-negative.');
  if (!Number.isFinite(maxBarLength) || maxBarLength < 0) throw new RangeError('Maximum bar length must be finite and non-negative.');

  const centerX = size.width / 2;
  const centerY = size.height / 2;
  context.save();
  try {
    context.lineCap = 'round';
    for (let index = 0; index < bars; index += 1) {
      const angle = (index / bars) * Math.PI * 2 + phase * 0.08;
      const envelope = 0.16 + 0.84 * Math.pow(Math.abs(Math.sin(index * 0.29 + phase * (0.75 + (index % 5) * 0.03))), 1.7);
      const length = maxBarLength * envelope;
      const startX = centerX + Math.cos(angle) * innerRadius;
      const startY = centerY + Math.sin(angle) * innerRadius;
      const endX = centerX + Math.cos(angle) * (innerRadius + length);
      const endY = centerY + Math.sin(angle) * (innerRadius + length);
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.strokeStyle = index % 6 === 0 ? (options.accentColor ?? '#d8b4fe') : (options.color ?? '#67e8f9');
      context.globalAlpha = 0.52 + envelope * 0.48;
      context.lineWidth = index % 6 === 0 ? 2.8 : 1.55;
      context.stroke();
    }

    context.globalAlpha = 0.85;
    context.beginPath();
    context.arc(centerX, centerY, innerRadius * 0.72, 0, Math.PI * 2);
    context.strokeStyle = options.accentColor ?? '#a78bfa';
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.arc(centerX, centerY, innerRadius * 0.42, 0, Math.PI * 2);
    context.fillStyle = options.color ?? '#67e8f9';
    context.fill();
  } finally {
    context.restore();
  }
}
