/** CSS-pixel dimensions used by Canvas effect helpers. */
export interface CanvasEffectSize {
  readonly width: number;
  readonly height: number;
}

/** Settings for a data-driven Canvas frequency spectrum. Values are normalized to the inclusive 0..1 range. */
export interface FrequencyBarsOptions {
  readonly barCount?: number;
  readonly gap?: number;
  readonly maxHeight?: number;
  readonly minHeight?: number;
  readonly symmetric?: boolean;
  readonly color?: string;
  readonly accentColor?: string;
}

/**
 * Draw frequency bins as a crisp bar spectrum. Feed normalized Web Audio analyser bins or any reactive data.
 * The helper intentionally receives values instead of owning an AudioContext, so resource/lifecycle policy
 * stays with the caller and this remains usable in tests, workers and non-audio visualizations.
 */
export function drawFrequencyBars(
  context: CanvasRenderingContext2D,
  values: ArrayLike<number>,
  size: CanvasEffectSize,
  options: FrequencyBarsOptions = {},
): void {
  validateSize(size);
  if (!values || !Number.isInteger(values.length) || values.length < 1) {
    throw new RangeError('Frequency data must contain at least one value.');
  }
  const barCount = options.barCount ?? Math.min(64, values.length);
  const gap = options.gap ?? 2;
  const maxHeight = options.maxHeight ?? size.height * 0.76;
  const minHeight = options.minHeight ?? Math.min(2, maxHeight);
  if (!Number.isInteger(barCount) || barCount < 1 || barCount > 256) {
    throw new RangeError('Frequency bar count must be an integer from 1 to 256.');
  }
  if (barCount > values.length) throw new RangeError('Frequency bar count cannot exceed the supplied data length.');
  if (!Number.isFinite(gap) || gap < 0 || !Number.isFinite(maxHeight) || maxHeight < 0
    || !Number.isFinite(minHeight) || minHeight < 0 || minHeight > maxHeight) {
    throw new RangeError('Frequency bar dimensions must be finite, non-negative, and minHeight must not exceed maxHeight.');
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`Frequency value at index ${index} must be normalized to the 0..1 range.`);
    }
  }

  const barSlot = size.width / barCount;
  const barWidth = Math.max(0, barSlot - gap);
  context.save();
  try {
    for (let index = 0; index < barCount; index += 1) {
       
      const start = Math.floor(index * values.length / barCount);
      const end = Math.max(start + 1, Math.floor((index + 1) * values.length / barCount));
      let total = 0;
      for (let bin = start; bin < Math.min(values.length, end); bin += 1) total += values[bin] ?? 0;
      const average = total / Math.max(1, Math.min(values.length, end) - start);
      const barHeight = minHeight + average * Math.max(0, maxHeight - minHeight);
      const x = index * barSlot + gap / 2;
      const y = options.symmetric === false ? size.height - barHeight : (size.height - barHeight) / 2;
      context.fillStyle = average > 0.7 ? (options.accentColor ?? '#c4b5fd') : (options.color ?? '#67e8f9');
      context.fillRect(x, y, barWidth, barHeight);
    }
  } finally {
    context.restore();
  }
}



function validateSize(size: CanvasEffectSize): void {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width < 0 || size.height < 0) {
    throw new RangeError('Canvas dimensions must be finite and non-negative.');
  }
}
