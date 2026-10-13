import { validateFrame } from './helpers.js';
import type { CanvasDemoSize } from './types.js';

export interface WaveFieldOptions {
  readonly layers?: number;
  readonly samples?: number;
  readonly amplitude?: number;
  readonly lineWidth?: number;
  readonly colors?: readonly string[];
}

const DEFAULT_WAVE_COLORS = ['#67e8f9', '#a78bfa', '#f0abfc', '#818cf8'] as const;

/** Draw a layered harmonic wave field. `phase` is in radians. */
export function drawWaveField(
  context: CanvasRenderingContext2D,
  phase: number,
  size: CanvasDemoSize,
  options: WaveFieldOptions = {},
): void {
  validateFrame(phase, size);
  const layers = options.layers ?? 4;
  const samples = options.samples ?? Math.max(90, Math.round(size.width / 2.5));
  const amplitude = options.amplitude ?? 0.15;
  const lineWidth = options.lineWidth ?? 2;
  if (!Number.isInteger(layers) || layers < 1 || layers > 12) throw new RangeError('Wave layers must be an integer from 1 to 12.');
  if (!Number.isInteger(samples) || samples < 8 || samples > 2000) throw new RangeError('Wave samples must be an integer from 8 to 2000.');
  if (!Number.isFinite(amplitude) || amplitude < 0) throw new RangeError('Wave amplitude must be finite and non-negative.');
  if (!Number.isFinite(lineWidth) || lineWidth <= 0) throw new RangeError('Wave line width must be finite and greater than zero.');

  const { width, height } = size;
  const midY = height / 2;
  const palette = options.colors?.length ? options.colors : DEFAULT_WAVE_COLORS;
  context.save();
  try {
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    for (let layer = 0; layer < layers; layer += 1) {
      context.beginPath();
      for (let sample = 0; sample <= samples; sample += 1) {
        const normalX = sample / samples;
        const envelope = Math.sin(normalX * Math.PI);
        const layerAmplitude = height * amplitude * (0.4 + layer * 0.22);
        const y = midY
          + Math.sin(normalX * Math.PI * (2 + layer) + phase * (1 + layer * 0.11)) * layerAmplitude * envelope
          + Math.cos(normalX * Math.PI * (4 + layer) - phase * 0.5) * layerAmplitude * 0.28 * envelope;
        const x = normalX * width;
        if (sample === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = palette[layer % palette.length]!;
      context.globalAlpha = Math.max(0.28, 0.86 - layer * (0.52 / Math.max(1, layers - 1)));
      context.stroke();
    }
  } finally {
    context.restore();
  }
}
