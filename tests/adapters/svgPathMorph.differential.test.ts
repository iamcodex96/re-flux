import { describe, expect, it } from '@jest/globals';
import {
  createSvgPathInterpolator,
  normalizeSvgPathPair,
  type SvgPathNormalizationOptions,
} from '../../src/adapters/svg.js';
import { formatNumber, renderNumericTemplate, tokenizeNumbers } from '../../src/utils/valueTemplate.js';

/**
 * Differential test for PERF-004. Two frozen reference implementations are kept in this file as oracles; the shipped
 * `createSvgPathInterpolator` must produce byte-identical strings for every pair and every progress value:
 *
 * - `currentInterpolator`: a verbatim copy of the interpolator at commit ea69062 (after REFACTOR-003: the path is
 *   tokenized once, then every frame fills the template slots through `renderNumericTemplate` + `formatNumber`).
 * - `legacyInterpolator`: the original implementation, independent of `valueTemplate.ts` (regex-replace plus
 *   `Number()` on every token, every frame, with its own copy of `formatNumber`).
 */

function currentInterpolator(
  from: string,
  to: string,
  options: SvgPathNormalizationOptions = {},
): (progress: number) => string {
  const normalized = normalizeSvgPathPair(from, to, options);
  const fromTemplate = tokenizeNumbers(normalized.from);
  const toTemplate = tokenizeNumbers(normalized.to);
  if (fromTemplate.values.length !== toTemplate.values.length || fromTemplate.template !== toTemplate.template) {
    throw new TypeError('SVG path normalization did not produce compatible command structures.');
  }

  return (progress: number): string => {
    if (!Number.isFinite(progress)) throw new RangeError('SVG path morph progress must be finite.');
    return renderNumericTemplate(fromTemplate.template, (index) => {
      const start = fromTemplate.values[index]!;
      return formatNumber(start + (toTemplate.values[index]! - start) * progress);
    });
  };
}

const TOKEN = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

function legacyFormatNumber(value: number): string {
  const rounded = Number(value.toFixed(5));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function legacyInterpolator(
  from: string,
  to: string,
  options: SvgPathNormalizationOptions = {},
): (progress: number) => string {
  const normalized = normalizeSvgPathPair(from, to, options);
  const fromNumbers = normalized.from.match(TOKEN) ?? [];
  const toNumbers = normalized.to.match(TOKEN) ?? [];
  const fromTemplate = normalized.from.replace(TOKEN, '#');
  const toTemplate = normalized.to.replace(TOKEN, '#');
  if (fromNumbers.length !== toNumbers.length || fromTemplate !== toTemplate) {
    throw new TypeError('SVG path normalization did not produce compatible command structures.');
  }
  return (progress: number): string => {
    if (!Number.isFinite(progress)) throw new RangeError('SVG path morph progress must be finite.');
    let index = 0;
    return normalized.from.replace(TOKEN, (token) => {
      const start = Number(token);
      const endToken = toNumbers[index];
      if (endToken === undefined)
        throw new TypeError('SVG path interpolation encountered a missing numeric parameter.');
      index += 1;
      return legacyFormatNumber(start + (Number(endToken) - start) * progress);
    });
  };
}

/** Both oracles, so a drift in the shared `formatNumber` cannot hide a difference. */
function oracles(
  from: string,
  to: string,
  options?: SvgPathNormalizationOptions,
): readonly ((progress: number) => string)[] {
  return [currentInterpolator(from, to, options), legacyInterpolator(from, to, options)];
}

interface PathCase {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly options?: SvgPathNormalizationOptions;
}

const PROGRESS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A closed ring of `segments` cubic segments; `wobble` and `phase` make two rings differ. */
function ringPath(segments: number, radius: number, wobble: number, phase: number, cx = 200, cy = 200): string {
  const point = (index: number): [number, number] => {
    const angle = (index / segments) * Math.PI * 2;
    const r = radius * (1 + wobble * Math.sin(angle * 3 + phase));
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };
  const [startX, startY] = point(0);
  const parts = [`M ${startX.toFixed(3)} ${startY.toFixed(3)}`];
  for (let index = 0; index < segments; index += 1) {
    const [x0, y0] = point(index);
    const [x3, y3] = point(index + 1);
    parts.push(
      `C ${(x0 + (x3 - x0) / 3 + 2).toFixed(3)} ${(y0 + (y3 - y0) / 3 - 2).toFixed(3)} ${(x0 + (2 * (x3 - x0)) / 3 - 2).toFixed(3)} ${(y0 + (2 * (y3 - y0)) / 3 + 2).toFixed(3)} ${x3.toFixed(3)} ${y3.toFixed(3)}`,
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Compact ring using integer coordinates and no separators beyond one space, to fit many segments in 100k chars. */
function compactRing(segments: number, radius: number, phase: number): string {
  const point = (index: number): [number, number] => {
    const angle = (index / segments) * Math.PI * 2;
    const r = radius * (1 + 0.2 * Math.sin(angle * 5 + phase));
    return [Math.round(300 + r * Math.cos(angle)), Math.round(300 + r * Math.sin(angle))];
  };
  const [x, y] = point(0);
  const parts = [`M${x} ${y}`];
  for (let index = 1; index <= segments; index += 1) {
    const [px, py] = point(index);
    parts.push(`L${px} ${py}`);
  }
  parts.push('Z');
  return parts.join('');
}

function randomPath(random: () => number, closedFlags: readonly boolean[]): string {
  const num = (): string => {
    const base = (random() - 0.35) * 400;
    const style = random();
    if (style < 0.08) return `${(base / 100).toExponential(2)}`;
    if (style < 0.2) return String(Math.round(base));
    if (style < 0.3) return base.toFixed(1).replace(/^(-?)0\./, '$1.');
    return base.toFixed(1 + Math.floor(random() * 5));
  };
  const flag = (): string => (random() < 0.5 ? '0' : '1');
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const parts: string[] = [];
  for (const closed of closedFlags) {
    parts.push(`${pick(['M', 'm'])} ${num()} ${num()}`);
    const commandCount = 1 + Math.floor(random() * 6);
    let previous = '';
    for (let index = 0; index < commandCount; index += 1) {
      // S only after C/S and T only after Q/T keep reflection paths exercised without relying on defaults.
      const options = ['L', 'l', 'H', 'h', 'V', 'v', 'C', 'c', 'Q', 'q', 'A', 'a'];
      if (previous === 'C' || previous === 'c' || previous === 'S' || previous === 's') options.push('S', 's');
      if (previous === 'Q' || previous === 'q' || previous === 'T' || previous === 't') options.push('T', 't');
      const command = pick(options);
      previous = command;
      switch (command.toUpperCase()) {
        case 'H':
        case 'V':
          parts.push(`${command} ${num()}`);
          break;
        case 'L':
        case 'T':
          parts.push(`${command} ${num()} ${num()}`);
          break;
        case 'Q':
        case 'S':
          parts.push(`${command} ${num()} ${num()} ${num()} ${num()}`);
          break;
        case 'C':
          parts.push(`${command} ${num()} ${num()} ${num()} ${num()} ${num()} ${num()}`);
          break;
        default:
          parts.push(
            `${command} ${(10 + random() * 60).toFixed(2)} ${(10 + random() * 60).toFixed(2)} ${(random() * 90).toFixed(1)} ${flag()} ${flag()} ${num()} ${num()}`,
          );
      }
    }
    // Guarantee a drawable, non-degenerate tail segment so arcs that collapse to nothing cannot empty a subpath.
    parts.push(`L ${(500 + random() * 50).toFixed(2)} ${(500 + random() * 50).toFixed(2)}`);
    if (closed) parts.push(pick(['Z', 'z']));
  }
  return parts.join(' ');
}

function buildCases(): PathCase[] {
  const cases: PathCase[] = [
    { name: 'open line to open line', from: 'M 0 0 L 100 50', to: 'M 10 10 L 20 200' },
    {
      name: 'triangle to square (closed, split to match)',
      from: 'M 0 0 L 100 0 L 50 80 Z',
      to: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
    },
    {
      name: 'relative commands',
      from: 'm 10 10 l 30 0 h 20 v 40 c 5 5 10 5 15 0 s 10 10 20 0 q 5 -20 10 0 t 15 5 z',
      to: 'm 0 0 l 50 10 h -20 v 30 c 0 10 10 10 20 0 s 5 5 10 10 q 10 -10 20 0 t 10 10 z',
    },
    {
      name: 'absolute smooth curves',
      from: 'M 0 0 C 10 20 30 20 40 0 S 70 -20 80 0 S 110 20 120 0',
      to: 'M 5 5 C 15 30 25 30 45 5 S 65 -25 85 5 S 100 30 130 5',
    },
    {
      name: 'quadratic chain',
      from: 'M 0 50 Q 25 0 50 50 T 100 50 T 150 50',
      to: 'M 0 0 Q 30 80 60 0 T 120 0 T 140 40',
    },
    { name: 'arc half circle to line', from: 'M 0 0 A 50 50 0 0 1 100 0', to: 'M 0 0 L 100 20' },
    { name: 'arc compact flags', from: 'M10 10a5 5 0 1,1 10 0', to: 'M10 10a5 5 0 1 0 10 0' },
    {
      name: 'arc large sweep rotated ellipse',
      from: 'M 20 50 A 40 20 30 1 1 120 60',
      to: 'M 20 50 A 30 60 -45 0 0 120 60',
    },
    {
      name: 'two arcs closed circle to polygon',
      from: 'M 50 0 A 50 50 0 1 1 50 100 A 50 50 0 1 1 50 0 Z',
      to: 'M 50 0 L 100 50 L 50 100 L 0 50 Z',
    },
    { name: 'zero-radius arc degenerates to a line', from: 'M 0 0 A 0 0 0 0 0 40 40', to: 'M 0 0 L 10 90' },
    {
      name: 'multiple subpaths closed and open',
      from: 'M 0 0 L 40 0 L 40 40 Z M 60 60 L 100 60 L 100 100',
      to: 'M 5 5 L 50 5 L 45 60 L 5 40 Z M 70 70 C 80 90 90 90 120 70',
    },
    { name: 'implicit lineto after moveto', from: 'M 0 0 10 10 20 0 30 10 Z', to: 'M 0 0 10 20 20 0 Z' },
    {
      name: 'implicit repeated commands',
      from: 'M 0 0 L 10 0 20 10 30 0 C 1 2 3 4 5 6 7 8 9 10 11 12',
      to: 'M 5 5 L 15 5 25 15 C 2 3 4 5 6 7 8 9 10 11 12 13',
    },
    {
      name: 'negative and exponent notation',
      from: 'M -1.5e1 .5e1 L +2E+1 -3.25 L -.75 1e-3 Z',
      to: 'M 1e1 -5e0 L -2e1 +4.5 L 1.5e-1 -1E-2 Z',
    },
    {
      name: 'leading-dot and trailing-dot numbers',
      from: 'M .5 .25 L 5. 7. L 3.5.5 Z',
      to: 'M 1.5 .75 L 9. 2. L .5 8. Z',
    },
    { name: 'compact separators', from: 'M0,0L10,0,10,10Z', to: 'M0-5L12-5,12,8Z' },
    {
      name: 'values beyond toFixed range use exponent output',
      from: 'M 1e21 0 L 2e21 5 L -1e22 -7 Z',
      to: 'M 3e21 1 L -4e21 5 L 1e21 7 Z',
    },
    {
      name: 'values that round to zero and negative zero',
      from: 'M 0.000001 -0.000001 L -0.000004 1e-9 L 1e-7 -1e-7 Z',
      to: 'M -0.000002 0.000003 L 0.000001 -1e-8 L -1e-6 1e-6 Z',
    },
    {
      name: 'long fractions needing rounding',
      from: `M ${1 / 3} ${2 / 3} L ${Math.PI} ${Math.E} L ${Math.SQRT2} ${-Math.LN2}`,
      to: `M ${-Math.PI} ${Math.E / 7} L ${Math.LN10} ${1 / 7} L ${2 / 9} ${5 / 11}`,
    },
    {
      name: 'closed paths aligned by rotation',
      from: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      to: 'M 100 100 L 0 100 L 0 0 L 100 0 Z',
    },
    {
      name: 'closed paths aligned by reversal',
      from: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      to: 'M 0 0 L 0 100 L 100 100 L 100 0 Z',
    },
    {
      name: 'closing line added implicitly',
      from: 'M 0 0 L 100 0 L 100 100 Z',
      to: 'M 10 10 L 110 10 L 110 110 L 10 110 Z',
    },
    { name: 'single point repeated (zero-length segment)', from: 'M 5 5 L 5 5 L 20 20', to: 'M 0 0 L 10 10 L 20 20' },
  ];
  for (const [a, b] of [
    [8, 8],
    [3, 5],
    [16, 64],
    [64, 64],
    [8, 128],
    [128, 128],
    [5, 33],
  ] as const) {
    cases.push({
      name: `ring ${a} to ring ${b} segments`,
      from: ringPath(a, 100, 0.1, 0),
      to: ringPath(b, 120, 0.3, 1.2, 210, 190),
    });
  }
  cases.push({
    name: 'ring with alignment disabled',
    from: ringPath(12, 100, 0.2, 0),
    to: ringPath(12, 90, 0.4, 2),
    options: { alignClosedContours: false },
  });
  cases.push({
    name: 'ring capped by a lower maxSegmentsPerSubpath',
    from: ringPath(6, 100, 0.2, 0),
    to: ringPath(10, 90, 0.4, 2),
    options: { maxSegmentsPerSubpath: 10 },
  });

  // Largest case the limits allow: the 100,000-character input cap is reached with 15 default-limit subpaths of 128
  // segments, and with one subpath of 2,000 segments when the per-subpath limit is raised to its 2,048 maximum.
  const manyRings = (phase: number, offset: number): string =>
    Array.from({ length: 15 }, (_, ring) => ringPath(128, 20 + ring, 0.1, phase + ring, offset + ring * 10, 200)).join(
      ' ',
    );
  cases.push({
    name: 'maximum-size input: 15 subpaths x 128 segments',
    from: manyRings(0, 100),
    to: manyRings(1.3, 110),
  });
  cases.push({
    name: 'maximum-size input: 1 subpath x 2000 segments',
    from: compactRing(1_900, 250, 0),
    to: compactRing(2_000, 240, 1),
    options: { maxSegmentsPerSubpath: 2_048 },
  });
  const manyTiny = (shift: number): string =>
    Array.from(
      { length: 64 },
      (_, index) => `M ${index * 5 + shift} 0 L ${index * 5 + shift + 3} 4 L ${index * 5 + shift} 8 Z`,
    ).join(' ');
  cases.push({ name: 'maximum subpaths: 64 closed triangles', from: manyTiny(0), to: manyTiny(1.5) });

  const random = mulberry32(0x5eed1234);
  for (let index = 0; index < 30; index += 1) {
    const subpathCount = 1 + Math.floor(random() * 3);
    const closedFlags = Array.from({ length: subpathCount }, () => random() < 0.5);
    cases.push({
      name: `random pair #${index + 1} (${subpathCount} subpath${subpathCount === 1 ? '' : 's'})`,
      from: randomPath(random, closedFlags),
      to: randomPath(random, closedFlags),
    });
  }
  return cases;
}

const cases = buildCases();

describe('Given the precomputed SVG path interpolator and the two pre-PERF-004 reference implementations', () => {
  it('Then there are at least 50 path pairs and each stays inside the documented input limit', () => {
    expect(cases.length).toBeGreaterThanOrEqual(50);
    for (const entry of cases) {
      expect(entry.from.length).toBeLessThanOrEqual(100_000);
      expect(entry.to.length).toBeLessThanOrEqual(100_000);
    }
  });

  describe('When every pair is rendered at 11 progress values', () => {
    it.each(cases.map((entry) => [entry.name, entry] as const))(
      'Then %s renders byte-identical strings',
      (_name, entry) => {
        const references = oracles(entry.from, entry.to, entry.options);
        const actual = createSvgPathInterpolator(entry.from, entry.to, entry.options);
        for (const progress of PROGRESS) {
          const rendered = actual(progress);
          for (const reference of references) expect(rendered).toBe(reference(progress));
        }
      },
    );
  });

  describe('And When progress is out of range or called repeatedly in any order', () => {
    it('Then overshooting progress and repeated, out-of-order calls still match the reference', () => {
      const entry = cases.find((candidate) => candidate.name === 'relative commands')!;
      const references = oracles(entry.from, entry.to);
      const actual = createSvgPathInterpolator(entry.from, entry.to);
      for (const progress of [1, -0.25, 0.5, 1.5, 0, 2, -3, 0.5, 1e-9, 0.999999999]) {
        const rendered = actual(progress);
        for (const reference of references) expect(rendered).toBe(reference(progress));
      }
    });

    it('Then non-finite progress throws the same RangeError and the interpolator keeps working afterwards', () => {
      const entry = cases[0]!;
      const references = oracles(entry.from, entry.to);
      const actual = createSvgPathInterpolator(entry.from, entry.to);
      for (const progress of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        for (const reference of references) expect(() => reference(progress)).toThrow(RangeError);
        expect(() => actual(progress)).toThrow(RangeError);
        expect(() => actual(progress)).toThrow('SVG path morph progress must be finite.');
      }
      for (const reference of references) expect(actual(0.5)).toBe(reference(0.5));
    });
  });

  describe('And When pairs are rejected during normalization', () => {
    it.each([
      ['a different number of subpaths', 'M 0 0 L 1 1', 'M 0 0 L 1 1 M 2 2 L 3 3'],
      ['an open subpath paired with a closed one', 'M 0 0 L 1 1', 'M 0 0 L 1 1 Z'],
      ['malformed path data', 'M 0 0 L 1', 'M 0 0 L 1 1'],
    ] as const)('Then %s throws at creation exactly like the reference', (_name, from, to) => {
      let referenceError: unknown;
      let actualError: unknown;
      try {
        currentInterpolator(from, to);
      } catch (error) {
        referenceError = error;
      }
      try {
        createSvgPathInterpolator(from, to);
      } catch (error) {
        actualError = error;
      }
      expect(referenceError).toBeInstanceOf(Error);
      expect(actualError).toBeInstanceOf((referenceError as Error).constructor);
      expect((actualError as Error).message).toBe((referenceError as Error).message);
    });
  });
});
