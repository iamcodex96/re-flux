import { describe, expect, it } from '@jest/globals';
import { BehaviorSubject, Subject } from 'rxjs';
import { bindSvgAttributes, bindSvgPathDrawing, bindSvgPathMorph, createSvgPathInterpolator, followSvgPath$, normalizeSvgPathPair, type SvgAttributeMap } from '../../src/adapters/svg.js';

function fakeSvg(initial: Record<string, string> = {}): SVGElement {
  const attributes = new Map(Object.entries(initial));
  return {
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    removeAttribute: (name: string) => { attributes.delete(name); },
  } as unknown as SVGElement;
}

describe('bindSvgAttributes', () => {
  it('applies attribute snapshots and restores the initial SVG state on unsubscribe', () => {
    const element = fakeSvg({ opacity: '0.2', fill: 'red' });
    const source = new Subject<SvgAttributeMap>();
    const binding = bindSvgAttributes(element, source);

    source.next({ opacity: 0.8, fill: 'blue', hidden: true });
    expect(element.getAttribute('opacity')).toBe('0.8');
    expect(element.getAttribute('fill')).toBe('blue');
    expect(element.hasAttribute('hidden')).toBe(true);

    source.next({ opacity: 0.5, hidden: false });
    expect(element.getAttribute('opacity')).toBe('0.5');
    expect(element.getAttribute('fill')).toBe('red');
    expect(element.hasAttribute('hidden')).toBe(false);

    binding.unsubscribe();
    expect(element.getAttribute('opacity')).toBe('0.2');
    expect(element.getAttribute('fill')).toBe('red');
    expect(element.hasAttribute('hidden')).toBe(false);
  });
});


describe('SVG path animation helpers', () => {
  it('reveals a path and restores its original stroke attributes on unsubscribe', () => {
    const element = fakeSvg({ 'stroke-dasharray': '4 2', 'stroke-dashoffset': '3' }) as SVGElement & { getTotalLength: () => number };
    element.getTotalLength = () => 120;
    const progress = new BehaviorSubject(0.25);
    const binding = bindSvgPathDrawing(element as unknown as SVGGeometryElement, progress);
    expect(element.getAttribute('stroke-dasharray')).toBe('120');
    expect(element.getAttribute('stroke-dashoffset')).toBe('90');
    progress.next(0.5);
    expect(element.getAttribute('stroke-dashoffset')).toBe('60');
    binding.unsubscribe();
    expect(element.getAttribute('stroke-dasharray')).toBe('4 2');
    expect(element.getAttribute('stroke-dashoffset')).toBe('3');
  });

  it('morphs compatible path data and restores the original path during teardown', () => {
    const element = fakeSvg({ d: 'M 2 2 L 12 12' }) as SVGPathElement;
    const progress = new BehaviorSubject(0.5);
    const binding = bindSvgPathMorph(element, progress, 'M 0 0 L 10 10', 'M 10 20 L 30 40');
    expect(element.getAttribute('d')).toBe('M 5 10 C 10 15 15 20 20 25');
    expect(createSvgPathInterpolator('M 0 0 L 10 10', 'M 10 20 L 30 40')(1)).toBe(normalizeSvgPathPair('M 0 0 L 10 10', 'M 10 20 L 30 40').to);
    binding.unsubscribe();
    expect(element.getAttribute('d')).toBe('M 2 2 L 12 12');
  });

  it('normalizes different commands and segment counts to matching cubic geometry', () => {
    const pair = normalizeSvgPathPair('M 0 0 H 100 V 100 Z', 'M 10 10 C 40 -5 80 120 90 90 Z');
    expect(pair.subpathCount).toBe(1);
    expect(pair.segmentsPerSubpath).toEqual([3]);
    expect((pair.from.match(/ C /g) ?? []).length).toBe(3);
    expect((pair.to.match(/ C /g) ?? []).length).toBe(3);
    expect(pair.from.endsWith('Z')).toBe(true);
    expect(pair.to.endsWith('Z')).toBe(true);
    expect(createSvgPathInterpolator('M 0 0 L 10 10', 'M 0 0 C 2 2 8 8 10 10')(0.5)).toContain(' C ');
  });

  it('converts smooth, quadratic and arc commands into cubic segments', () => {
    const pair = normalizeSvgPathPair(
      'M 0 50 A 50 50 0 1 1 100 50 Z',
      'M 0 50 Q 50 -15 100 50 T 0 50 Z',
    );
    expect(pair.from).toContain(' C ');
    expect(pair.to).toContain(' C ');
    expect((pair.from.match(/ C /g) ?? []).length).toBe((pair.to.match(/ C /g) ?? []).length);
    expect(pair.from.endsWith('Z')).toBe(true);
    expect(pair.to.endsWith('Z')).toBe(true);
    const compactArc = normalizeSvgPathPair('M 0 50 A 50 50 0 01100 50 Z', 'M 0 50 A 50 50 0 1 1 100 50 Z');
    expect(compactArc.from).toContain(' C ');
  });

  it('aligns closed contours with different start points and directions', () => {
    const pair = normalizeSvgPathPair(
      'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      'M 100 100 L 100 0 L 0 0 L 0 100 Z',
    );
    expect(pair.from).toBe(pair.to);
  });

  it('supports multiple paired subpaths and rejects incompatible contour counts or closure', () => {
    const pair = normalizeSvgPathPair(
      'M 0 0 L 10 0 Z M 20 20 L 30 20 Z',
      'M 0 0 C 3 0 7 0 10 0 Z M 20 20 H 30 Z',
    );
    expect(pair.subpathCount).toBe(2);
    expect(pair.segmentsPerSubpath).toHaveLength(2);
    expect(() => normalizeSvgPathPair('M 0 0 L 10 0', 'M 0 0 L 10 0 M 20 20 L 30 20')).toThrow('same number of subpaths');
    expect(() => normalizeSvgPathPair('M 0 0 L 10 0 Z', 'M 0 0 L 10 0')).toThrow('open in both paths or closed in both paths');
  });

  it('rejects unsupported commands and excessive normalization requests', () => {
    expect(() => createSvgPathInterpolator('M 0 0 R 10 10', 'M 0 0 L 10 10')).toThrow('Unsupported SVG path command');
    expect(() => normalizeSvgPathPair('M 0 0 L 10 10', 'M 0 0 L 20 20', { maxSegmentsPerSubpath: 0 })).toThrow('between 1 and 2048');
    expect(() => normalizeSvgPathPair('M 0 0 L 10 0 L 10 10 Z', 'M 0 0 L 20 0 Z', { maxSegmentsPerSubpath: 2 })).toThrow('exceeding maxSegmentsPerSubpath');
    expect(() => normalizeSvgPathPair('M 0 0 A 10 10 0 2 1 20 20', 'M 0 0 L 20 20')).toThrow('arc flags must be 0 or 1');
  });
});


describe('SVG motion paths', () => {
  it('emits position and tangent angle samples and clamps progress by default', () => {
    const geometry = {
      getTotalLength: () => 100,
      getPointAtLength: (distance: number) => ({ x: distance, y: distance * 2 }),
    } as unknown as SVGGeometryElement;
    const source = new BehaviorSubject(0.5);
    const samples: Array<{ x: number; y: number; angle: number; progress: number }> = [];
    const subscription = followSvgPath$(geometry, source).subscribe((sample) => samples.push(sample));

    source.next(2);
    expect(samples[0]?.x).toBe(50);
    expect(samples[0]?.y).toBe(100);
    expect(samples[0]?.angle).toBeCloseTo(Math.atan2(4, 2) * 180 / Math.PI);
    expect(samples[0]?.progress).toBe(0.5);
    expect(samples[1]?.progress).toBe(1);
    expect(samples[1]?.x).toBe(100);
    expect(samples[1]?.y).toBe(200);
    subscription.unsubscribe();
  });

  it('rejects invalid look-ahead distances', () => {
    const geometry = { getTotalLength: () => 10, getPointAtLength: () => ({ x: 0, y: 0 }) } as unknown as SVGGeometryElement;
    expect(() => followSvgPath$(geometry, new BehaviorSubject(0.5), { lookAhead: 0 })).toThrow('greater than zero');
  });
});
