import { describe, expect, it, jest } from '@jest/globals';
import { animate } from '../../src/adapters/dom.js';
import { compileCssInterpolator, compiledCssInterpolator, interpolateCssValue } from '../../src/adapters/dom/cssInterpolation.js';
import { withInterpolatorCompiler } from '../../src/values/compiledInterpolators.js';
import { Keyframes } from '../../src/values/Keyframes.js';
import {
  formatNumber,
  formatRgba,
  mixRgba,
  parseColor,
  renderNumericTemplate,
  roundChannel,
  tokenizeNumbers,
  type Rgba,
} from '../../src/utils/valueTemplate.js';

/**
 * PERF-003 differential test. `oracleInterpolateCssValue` is a verbatim copy of `interpolateCssValue` as it was
 * before the compiled path existed (parse both strings on every call). The compiled interpolator must return exactly
 * the same string for every pair and progress, including 0, 1, overshoot and non-finite progress.
 */

// ---- Oracle: the pre-PERF-003 implementation, copied unchanged -------------------------------------------------

function oracleInterpolateCssValue(from: string, to: string, progress: number): string {
  if (progress === 0) return from;
  if (progress === 1) return to;

  const fromTemplate = tokenizeNumbers(from);
  const toTemplate = tokenizeNumbers(to);
  const compatibleTemplate = fromTemplate.template === toTemplate.template
    && fromTemplate.values.length === toTemplate.values.length;

  const fromColor = parseColor(from);
  const toColor = parseColor(to);
  if (fromColor && toColor) {
    const mixed = mixRgba(fromColor, toColor, progress);
    return compatibleTemplate && !from.trim().startsWith('#')
      ? oracleRenderColorFunction(fromTemplate.template, mixed)
      : formatRgba(mixed);
  }
  if (!compatibleTemplate) return progress < 1 ? from : to;

  return renderNumericTemplate(fromTemplate.template, (index) => {
    const start = fromTemplate.values[index]!;
    const end = toTemplate.values[index]!;
    return formatNumber(start + (end - start) * progress);
  });
}

function oracleRenderColorFunction(template: string, color: Rgba): string {
  const slots = template.split('\u0000');
  const channels = [color.r, color.g, color.b];
  return renderNumericTemplate(template, (index) => {
    const percent = slots[index + 1]!.startsWith('%');
    if (index < 3) {
      const channel = channels[index]!;
      return formatNumber(percent ? (channel / 255) * 100 : roundChannel(channel));
    }
    return formatNumber(percent ? color.a * 100 : color.a);
  });
}

// ---- Candidate under test --------------------------------------------------------------------------------------

type Compile = (from: string, to: string) => (progress: number) => string;

const compile: Compile = compileCssInterpolator;

// ---- Seeded generators -----------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20261124);
const int = (max: number): number => Math.floor(random() * max);
const pick = <T>(items: readonly T[]): T => items[int(items.length)]!;
const chance = (probability: number): boolean => random() < probability;

/** A number in one of the spellings the tokenizer has to handle. */
function numberText(): string {
  const base = Math.round((random() * 600 - 300) * 1000) / 1000;
  switch (int(9)) {
    case 0: return String(int(500));
    case 1: return `+${int(500)}`;
    case 2: return `-${int(500)}.${int(100)}`;
    case 3: return `.${int(1000)}`;
    case 4: return `${int(50)}.`;
    case 5: return `${int(9) + 1}e${pick(['-', '+', ''])}${int(4)}`;
    case 6: return `-.${int(99)}e-${int(3)}`;
    default: return String(base);
  }
}

const UNITS = ['px', '%', 'em', 'rem', 'deg', 'vh', 's', ''] as const;
const SEPARATORS = [' ', ', ', ',', ' / ', '  ', ' '] as const;
const FUNCTIONS = ['translate', 'scale', 'rotate', 'matrix', 'translate3d', 'blur', 'calc'] as const;

interface Skeleton {
  readonly prefix: string;
  readonly units: readonly string[];
  readonly separators: readonly string[];
  readonly suffix: string;
}

function skeleton(): Skeleton {
  const count = 1 + int(6);
  const fn = chance(0.6) ? pick(FUNCTIONS) : '';
  return {
    prefix: fn ? `${fn}(` : chance(0.2) ? 'inset ' : '',
    units: Array.from({ length: count }, () => pick(UNITS)),
    separators: Array.from({ length: count }, () => pick(SEPARATORS)),
    suffix: fn ? ')' : chance(0.15) ? ' red' : '',
  };
}

function fill(shape: Skeleton, numbers: readonly string[], units = shape.units): string {
  let out = shape.prefix;
  numbers.forEach((text, index) => {
    out += `${text}${units[index]!}`;
    if (index < numbers.length - 1) out += shape.separators[index]!;
  });
  return out + shape.suffix;
}

function templatePair(): readonly [string, string] {
  const shape = skeleton();
  const count = shape.units.length;
  const from = Array.from({ length: count }, numberText);
  const mode = int(10);
  if (mode < 6) return [fill(shape, from), fill(shape, Array.from({ length: count }, numberText))]; // compatible
  if (mode === 6) { // one unit differs
    const units = shape.units.map((unit, index) => index === 0 ? (unit === 'px' ? 'em' : 'px') : unit);
    return [fill(shape, from), fill(shape, Array.from({ length: count }, numberText), units)];
  }
  if (mode === 7) { // different number of values
    const other = { ...shape, units: [...shape.units, 'px'], separators: [...shape.separators, ' '] };
    return [fill(shape, from), fill(other, Array.from({ length: count + 1 }, numberText))];
  }
  if (mode === 8) return [fill(shape, from), pick(['auto', 'none', 'inherit', '', ' ', 'calc(100% - 4px)'])];
  return [pick(['auto', 'none', 'red', 'currentColor', '']), fill(shape, from)];
}

/** Long templates (more than the joined-path threshold of 8 numbers): matrices, shadow lists, dash arrays. */
function longTemplatePair(): readonly [string, string] {
  const kind = int(4);
  const nums = (count: number): string[] => Array.from({ length: count }, numberText);
  if (kind === 0) return [`matrix3d(${nums(16).join(', ')})`, `matrix3d(${nums(16).join(', ')})`];
  if (kind === 1) {
    const shadow = (): string => `${nums(4).map((n, i) => n + (i < 3 ? 'px' : '')).join(' ')} rgba(${int(255)}, ${int(255)}, ${int(255)}, ${random().toFixed(2)})`;
    const count = 2 + int(2);
    return [Array.from({ length: count }, shadow).join(', '), Array.from({ length: count }, shadow).join(', ')];
  }
  if (kind === 2) { const count = 9 + int(12); return [nums(count).join(' '), nums(count).join(' ')]; }
  const count = 9 + int(8); // incompatible: different counts
  return [nums(count).join(' '), nums(count + 1).join(' ')];
}

const hexDigits = (length: number): string => Array.from({ length }, () => int(16).toString(16)).join('');
const channelText = (): string => pick([String(int(256)), String(int(300) - 20), `${int(60) + 0.5}`, `${int(101)}%`, `${int(130) - 10}%`]);
const alphaText = (): string => pick([String(Math.round(random() * 100) / 100), `${int(101)}%`, `.${int(100)}`, '1', '0']);

function colorText(): string {
  switch (int(8)) {
    case 0: return `#${hexDigits(3)}`;
    case 1: return `#${hexDigits(4)}`;
    case 2: return `#${hexDigits(6)}`;
    case 3: return `#${hexDigits(8)}`.toUpperCase();
    case 4: return `rgb(${channelText()}, ${channelText()}, ${channelText()})`;
    case 5: return `rgba(${channelText()},${channelText()},${channelText()},${alphaText()})`;
    case 6: return `rgb(${channelText()} ${channelText()} ${channelText()} / ${alphaText()})`;
    default: return pick([' ', '']) + `RGB( ${channelText()} ${channelText()} ${channelText()} )` + pick([' ', '']);
  }
}

function sameShapeColor(): readonly [string, string] {
  const style = int(5);
  const make = (): string => {
    switch (style) {
      case 0: return `rgb(${channelText()}, ${channelText()}, ${channelText()})`;
      case 1: return `rgba(${int(300) - 20},${int(300) - 20},${int(300) - 20},${alphaText()})`;
      case 2: return `rgb(${int(256)} ${int(256)} ${int(256)} / ${alphaText()})`;
      case 3: return `rgb(${int(101)}% ${int(101)}% ${int(101)}% / ${int(101)}%)`;
      default: return `#${hexDigits(pick([3, 4, 6, 8]))}`;
    }
  };
  return [make(), make()];
}

function mixedColorPair(): readonly [string, string] {
  return chance(0.5) ? sameShapeColor() : [colorText(), colorText()];
}

function randomPair(): readonly [string, string] {
  const roll = int(10);
  if (roll === 0) return longTemplatePair();
  if (roll < 5) return templatePair();
  if (roll < 8) return mixedColorPair();
  return [colorText(), pick(['auto', '10px', 'red', colorText()])];
}

const LONG_PAIRS = Array.from({ length: 200 }, longTemplatePair);

const FIXED_PROGRESS = [0, 1, -0, 0.001, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1.2, -0.2, 2.5, -3, Number.NaN, Infinity, -Infinity] as const;

const HAND_PICKED: ReadonlyArray<readonly [string, string]> = [
  ['0px', '320px'], ['0', '1'], ['auto', '100px'], ['auto', 'auto'], ['', ''],
  ['translate(0px, 0px) scale(1)', 'translate(100px, 50px) scale(2)'],
  ['0 0 4px rgba(0,0,0,0.2)', '10px 10px 12px rgba(0,0,0,0.9)'],
  ['0px 0px 4px #000', '10px 10px 12px #fff'],
  ['+5px', '-5px'], ['1e-3px', '2e-3px'], ['1e3px', '2e3px'], ['1em', '3em'], ['.5', '5.'],
  ['50%', '75.5%'], ['10px', '10em'], ['10px', '10px 20px'],
  ['#102030', '#f0e0d0'], ['#fff', '#000'], ['#f008', '#0f08'], ['#112233', 'rgb(100, 120, 140)'],
  ['rgb(10, 20, 30)', 'rgba(240, 220, 200, 0.5)'], ['rgb(10, 20, 30)', 'rgb(240, 220, 200)'],
  ['rgba(0,0,0,.123456)', 'rgba(0,0,0,.9)'], ['rgb(300 0 0 / 50%)', 'rgb(0 0 300 / 100%)'],
  ['rgb(10% 20% 30%)', 'rgb(50% 60% 70%)'], ['rgb(10% 20% 30%)', '#ffffff'],
  ['rgb(0, 0, 0)', 'rgb(255, 255, 255)'], ['  rgb(0,0,0)  ', 'rgb(255,255,255)'], [' #000', ' #fff'],
  ['rgb(1,2,3)', 'rgb(1,2,3)'], ['#abc', '#abc'], ['red', 'blue'], ['Infinity', '1e999px'],
];

describe('Given the compiled CSS interpolator and the pre-PERF-003 implementation', () => {
  describe('When both receive at least 1,000 seeded random pairs at 17 progress values', () => {
    it('Then every returned string is identical (templates, colors, units, incompatible pairs, overshoot, NaN/Infinity)', () => {
      const pairs = [...HAND_PICKED, ...LONG_PAIRS, ...Array.from({ length: 1500 }, randomPair)];
      expect(pairs.length).toBeGreaterThanOrEqual(1000);
      let compared = 0;
      const mismatches: string[] = [];
      for (const [from, to] of pairs) {
        const interpolator = compile(from, to);
        const progressValues = [...FIXED_PROGRESS, random(), random(), random() * 2 - 0.5];
        for (const progress of progressValues) {
          const expected = oracleInterpolateCssValue(from, to, progress);
          const actual = interpolator(progress);
          compared += 1;
          if (!Object.is(actual, expected)) mismatches.push(`${JSON.stringify(from)} -> ${JSON.stringify(to)} @ ${progress}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
        }
      }
      expect(mismatches.slice(0, 10)).toEqual([]);
      expect(compared).toBeGreaterThan(25_000);
    });

    it('Then more than 100 compatible pairs use the joined path with more than 8 numbers, and the 4-8 number range is covered too', () => {
      const compatible = (counts: (n: number) => boolean, pairs: ReadonlyArray<readonly [string, string]>): number => pairs.filter(([from, to]) => {
        const a = tokenizeNumbers(from);
        const b = tokenizeNumbers(to);
        return counts(a.values.length) && a.template === b.template && !parseColor(from);
      }).length;
      expect(compatible((n) => n > 8, LONG_PAIRS)).toBeGreaterThan(100);
      expect(compatible((n) => n >= 4 && n <= 8, Array.from({ length: 1500 }, templatePair))).toBeGreaterThan(100);
    });

    it('Then the generator really exercises each branch (compatible templates, color functions, rgba() fallbacks, discrete switches)', () => {
      const branches = { numeric: 0, colorFunction: 0, rgba: 0, discrete: 0, hex: 0 };
      for (const [from, to] of [...HAND_PICKED, ...Array.from({ length: 1500 }, randomPair)]) {
        const out = oracleInterpolateCssValue(from, to, 0.5);
        if (parseColor(from) && parseColor(to)) {
          if (out.startsWith('rgba(') && out.includes(', ')) branches.rgba += 1;
          else branches.colorFunction += 1;
          if (from.trim().startsWith('#')) branches.hex += 1;
        } else if (out === from && from !== to) branches.discrete += 1;
        else branches.numeric += 1;
      }
      expect(branches.numeric).toBeGreaterThan(150);
      expect(branches.colorFunction).toBeGreaterThan(50);
      expect(branches.rgba).toBeGreaterThan(50);
      expect(branches.discrete).toBeGreaterThan(30);
      expect(branches.hex).toBeGreaterThan(30);
    });
  });

  describe('When progress is exactly 0 or 1', () => {
    it('Then the exact input strings come back, including their original spacing and case', () => {
      for (const [from, to] of [[' #FFF ', 'RGB( 1 2 3 )'], ['0PX', '10px'], ['auto', '1px']] as const) {
        const interpolator = compile(from, to);
        expect(interpolator(0)).toBe(from);
        expect(interpolator(1)).toBe(to);
      }
    });
  });
});

describe('Given interpolateCssValue after PERF-003', () => {
  describe('When it is called one-shot on the same random pairs', () => {
    it('Then it still equals the pre-PERF-003 implementation (the public function is unchanged)', () => {
      for (const [from, to] of [...HAND_PICKED, ...Array.from({ length: 300 }, randomPair)]) {
        for (const progress of [0, 0.3, 0.5, 1, 1.4, -0.4, Number.NaN]) {
          expect(Object.is(interpolateCssValue(from, to, progress), oracleInterpolateCssValue(from, to, progress))).toBe(true);
        }
      }
    });
  });
});

describe('Given Keyframes receives an interpolator that carries a compiler', () => {
  describe('When it is constructed and then seeked many times', () => {
    it('Then the compiler runs once per segment at construction, never per frame, and its closure produces the values', () => {
      const compiler = jest.fn((from: string, to: string) => (_start: string, _end: string, progress: number) => `${from}>${to}@${progress}`);
      const interpolate = withInterpolatorCompiler<string>(() => 'one-shot', compiler);
      const keyframes = new Keyframes<string>({
        duration: 1000,
        easing: 'linear',
        keyframes: [{ value: 'a' }, { value: 'b' }, { value: 'c' }],
        interpolate,
      });
      try {
        expect(compiler).toHaveBeenCalledTimes(2);
        expect(compiler).toHaveBeenNthCalledWith(1, 'a', 'b');
        expect(compiler).toHaveBeenNthCalledWith(2, 'b', 'c');
        for (let time = 50; time < 1000; time += 50) keyframes.seek(time);
        keyframes.seek(250);
        expect(keyframes.value$.value).toBe('a>b@0.5');
        keyframes.seek(750);
        expect(keyframes.value$.value).toBe('b>c@0.5');
        expect(compiler).toHaveBeenCalledTimes(2);
      } finally {
        keyframes.stop();
      }
    });
  });

  describe('When the interpolator has no compiler', () => {
    it('Then the plain interpolator is called per frame exactly as before', () => {
      const interpolate = jest.fn((from: string, to: string, progress: number) => `${from}>${to}@${progress}`);
      const keyframes = new Keyframes<string>({ duration: 1000, easing: 'linear', keyframes: [{ value: 'a' }, { value: 'b' }], interpolate });
      try {
        keyframes.seek(500);
        expect(interpolate).toHaveBeenCalledWith('a', 'b', 0.5);
        expect(keyframes.value$.value).toBe('a>b@0.5');
      } finally {
        keyframes.stop();
      }
    });
  });
});

describe('Given animate() drives mock elements with the compiled CSS interpolator', () => {
  function mockElement(): HTMLElement {
    const values = new Map<string, string>();
    const style = {
      getPropertyValue: (name: string) => values.get(name) ?? '',
      getPropertyPriority: () => '',
      setProperty: (name: string, value: string) => { values.set(name, value); },
      removeProperty: (name: string) => { values.delete(name); },
    };
    return {
      nodeType: 1,
      style,
      ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } },
    } as unknown as HTMLElement;
  }

  describe('When it seeks through multi-keyframe values (lengths, transforms, colors, incompatible)', () => {
    it('Then every written declaration equals a Keyframes that uses the pre-PERF-003 interpolateCssValue per frame', () => {
      const sequences: Record<string, string[]> = {
        width: ['0px', '120px', '40px'],
        transform: ['translate(0px, 0px) scale(1)', 'translate(100px, 50px) scale(2)', 'translate(-20px, 10px) scale(0.5)'],
        'background-color': ['#102030', 'rgb(240, 220, 200)', '#f0e0d0cc'],
        color: ['rgb(0 0 0 / 0)', 'rgb(255 128 64 / 0.5)', 'rgb(10% 20% 30%)'],
        display: ['auto', '100px', 'auto'],
        opacity: ['0', '1', '0.25'],
      };
      const element = mockElement();
      const properties = Object.fromEntries(Object.entries(sequences).map(([name, values]) => [name, { values }]));
      const animation = animate(element, { duration: 1000, easing: 'linear', properties });
      const references = Object.entries(sequences).map(([name, values]) => ({
        name,
        keyframes: new Keyframes<string>({
          duration: 1000,
          easing: 'linear',
          keyframes: values.map((value) => ({ value })),
          interpolate: oracleInterpolateCssValue,
        }),
      }));
      try {
        for (const time of [0, 1, 123, 250, 499, 500, 501, 777, 999, 1000, 321]) {
          animation.seek(time);
          for (const { name, keyframes } of references) {
            keyframes.seek(time);
            expect(`${name}@${time}: ${element.style.getPropertyValue(name)}`).toBe(`${name}@${time}: ${keyframes.value$.value}`);
          }
        }
      } finally {
        animation.dispose();
        for (const { keyframes } of references) keyframes.stop();
      }
    });
  });

  describe('When compiledCssInterpolator() is requested repeatedly', () => {
    it('Then it hands out one shared interpolator that is itself a correct one-shot implementation', () => {
      const interpolate = compiledCssInterpolator();
      expect(compiledCssInterpolator()).toBe(interpolate);
      expect(interpolate('0px', '100px', 0.25)).toBe('25px');
      expect(interpolate('#000', '#fff', 0.5)).toBe(oracleInterpolateCssValue('#000', '#fff', 0.5));
    });
  });
});
