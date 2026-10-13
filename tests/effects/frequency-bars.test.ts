import { describe, expect, it } from '@jest/globals';
import { drawFrequencyBars } from '../../src/effects/canvas.js';

function createContext(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    fillRect: () => calls.push('fillRect'),
    set fillStyle(_value: string | CanvasGradient | CanvasPattern) { calls.push('fillStyle'); },
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
}

describe('optional Canvas frequency-bars extension', () => {
  it('draws data-driven bins without owning an audio lifecycle', () => {
    const context = createContext();
    drawFrequencyBars(context, [0.1, 0.3, 0.9, 0.7, 0.2, 0.8], { width: 240, height: 100 }, { barCount: 6 });
    expect(context.calls.filter((call) => call === 'fillRect')).toHaveLength(6);
    expect(context.calls[0]).toBe('save');
    expect(context.calls.at(-1)).toBe('restore');
  });

  it('rejects data outside the normalized range', () => {
    const context = createContext();
    expect(() => drawFrequencyBars(context, [0, 1.1], { width: 100, height: 50 })).toThrow('normalized');
  });
});
