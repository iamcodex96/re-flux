import { describe, expect, it } from '@jest/globals';
import {
  NUMERIC_TOKEN_SOURCE,
  compileColorMix,
  compileNumericTemplate,
  compileNumericTemplateJoined,
  formatNumber,
  formatRgba,
  mixRgba,
  parseColor,
  renderNumericTemplate,
  tokenizeNumbers,
} from '../../src/utils/valueTemplate.js';

describe('Given the shared numeric tokenizer', () => {
  describe('When a value contains signed, decimal and exponent numbers', () => {
    it('Then it extracts every number and keeps units and text in the template', () => {
      const { template, values } = tokenizeNumbers('translate(+5px, -.5em) scale(1.) 2E-2 1e3px');
      expect(values).toEqual([5, -0.5, 1, 0.02, 1000]);
      expect(template).toBe('translate(\u0000px, \u0000em) scale(\u0000) \u0000 \u0000px');
    });
    it('Then the em and ex units are not read as exponents', () => {
      expect(tokenizeNumbers('1em 2ex 3e').values).toEqual([1, 2, 3]);
    });
    it('Then a value without numbers has no values and an unchanged template', () => {
      expect(tokenizeNumbers('auto')).toEqual({ template: 'auto', values: [] });
    });
    it('Then a token that is not a finite number stays literal in the template', () => {
      expect(tokenizeNumbers('1e999px 2px')).toEqual({ template: '1e999px \u0000px', values: [2] });
    });
    it('Then it is stateless across calls', () => {
      expect(tokenizeNumbers('1 2').values).toEqual([1, 2]);
      expect(tokenizeNumbers('1 2').values).toEqual([1, 2]);
    });
  });
  describe('When the numeric pattern source is reused to build a larger pattern', () => {
    it('Then it matches the same tokens as the tokenizer', () => {
      expect('M1e2-3.5.5L+4'.match(new RegExp(NUMERIC_TOKEN_SOURCE, 'g'))).toEqual(['1e2', '-3.5', '.5', '+4']);
    });
  });
  describe('When a template is rendered', () => {
    it('Then each slot is replaced in order by the produced text', () => {
      const { template } = tokenizeNumbers('a1b2c3');
      expect(renderNumericTemplate(template, (index) => `<${index}>`)).toBe('a<0>b<1>c<2>');
    });
  });
});

describe('Given formatNumber', () => {
  it('Then it rounds to 5 decimals, drops trailing zeros and never prints -0', () => {
    expect(formatNumber(1.0555555)).toBe('1.05556');
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(-0)).toBe('0');
    expect(formatNumber(-0.000001)).toBe('0');
    expect(formatNumber(1e-7)).toBe('0');
    expect(formatNumber(-2.5)).toBe('-2.5');
  });
});

describe('Given the shared color parser', () => {
  describe('When hex colors are supplied', () => {
    it('Then it parses 3, 4, 6 and 8 digit hex, case-insensitively and trimmed', () => {
      expect(parseColor('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor(' #F008 ')).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
      expect(parseColor('#112233')).toEqual({ r: 17, g: 34, b: 51, a: 1 });
      expect(parseColor('#11223380')).toEqual({ r: 17, g: 34, b: 51, a: 128 / 255 });
    });
    it('Then it rejects malformed hex', () => {
      for (const bad of ['#12', '#12345', '#1234567', '#ggg', 'fff']) expect(parseColor(bad)).toBeNull();
    });
  });
  describe('When rgb() and rgba() colors are supplied', () => {
    it('Then it accepts comma, space and slash separated forms', () => {
      expect(parseColor('rgb(1, 2, 3)')).toEqual({ r: 1, g: 2, b: 3, a: 1 });
      expect(parseColor('RGBA(1,2,3,.5)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
      expect(parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
      expect(parseColor('rgb(1 2 3/0.25)')).toEqual({ r: 1, g: 2, b: 3, a: 0.25 });
    });
    it('Then it clamps channels to 0..255 and alpha to 0..1', () => {
      expect(parseColor('rgb(300, -5, 10.5 / 2)')).toEqual({ r: 255, g: 0, b: 10.5, a: 1 });
      expect(parseColor('rgba(0 0 0 / 250%)')?.a).toBe(1);
    });
    it('Then it converts percentage channels to the 0..255 range', () => {
      expect(parseColor('rgb(0% 50% 100%)')).toEqual({ r: 0, g: 127.5, b: 255, a: 1 });
    });
    it('Then it accepts exponent numbers', () => {
      expect(parseColor('rgb(1e2, 0, 0)')).toEqual({ r: 100, g: 0, b: 0, a: 1 });
    });
    it('Then it rejects anything that is not exactly an rgb color', () => {
      for (const bad of [
        'rgb(1px, 2, 3)',
        'rgb(1, 2)',
        'rgb(1, 2, 3, 4, 5)',
        'hsl(0, 0%, 0%)',
        'red',
        'rgb(1,2,3) x',
        '10px',
      ]) {
        expect(parseColor(bad)).toBeNull();
      }
    });
  });
});

describe('Given color mixing and formatting', () => {
  it('Then mixRgba clamps channels and alpha, including on overshoot', () => {
    const from = { r: 0, g: 100, b: 255, a: 0 };
    const to = { r: 255, g: 100, b: 0, a: 1 };
    expect(mixRgba(from, to, 0.5)).toEqual({ r: 127.5, g: 100, b: 127.5, a: 0.5 });
    expect(mixRgba(from, to, 1.2)).toEqual({ r: 255, g: 100, b: 0, a: 1 });
    expect(mixRgba(from, to, -0.2)).toEqual({ r: 0, g: 100, b: 255, a: 0 });
  });
  it('Then formatRgba rounds channels and prints alpha with the shared precision', () => {
    expect(formatRgba({ r: 127.5, g: 0.4, b: 255, a: 0.511734 })).toBe('rgba(128, 0, 255, 0.51173)');
  });
});

describe('Given the pre-compiled renderers (PERF-002)', () => {
  const PROGRESS = [-0.5, 0, 0.1, 0.33, 0.5, 0.9, 1, 1.4];

  it('Then compileColorMix equals formatRgba(mixRgba()) for varying and constant alpha', () => {
    const pairs = [
      [
        { r: 0, g: 100, b: 255, a: 0 },
        { r: 255, g: 100, b: 0, a: 1 },
      ],
      [
        { r: 16, g: 32, b: 48, a: 1 },
        { r: 240, g: 224, b: 208, a: 1 },
      ],
      [
        { r: 10.5, g: 20.25, b: 30.75, a: 0.2 },
        { r: 240, g: 220, b: 200, a: 0.9 },
      ],
      [
        { r: 1, g: 2, b: 3, a: 0.4 },
        { r: 3, g: 2, b: 1, a: 0.4 },
      ],
    ] as const;
    for (const [from, to] of pairs) {
      const render = compileColorMix(from, to);
      for (const progress of PROGRESS) expect(render(progress)).toBe(formatRgba(mixRgba(from, to, progress)));
    }
  });

  it('Then compileNumericTemplate equals renderNumericTemplate with the shared formatter', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['translate(0px, 10px) scale(1)', 'translate(100px, 50px) scale(2)'],
      ['0px', '320px'],
      ['1e-3px', '2e-3px'],
      ['+5px 7', '-5px 9'],
    ];
    for (const [from, to] of cases) {
      const a = tokenizeNumbers(from);
      const b = tokenizeNumbers(to);
      const render = compileNumericTemplate(a, b);
      for (const progress of PROGRESS) {
        const expected = renderNumericTemplate(a.template, (index) => {
          const start = a.values[index] ?? 0;
          return formatNumber(start + ((b.values[index] ?? start) - start) * progress);
        });
        expect(render(progress)).toBe(expected);
      }
    }
  });

  it('Then a missing end value keeps the start value, as the one-shot path does', () => {
    const render = compileNumericTemplate(tokenizeNumbers('1px 2px'), tokenizeNumbers('5px'));
    expect(render(0.5)).toBe('3px 2px');
  });
});

describe('Given the joined renderer used by the SVG path morpher (PERF-004)', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['M 0 0 C 1 2 3 4 5 6 Z', 'M 10 -10 C 11 12 13 14 15 -16 Z'],
    ['translate(0px, 10px) scale(1)', 'translate(100px, 50px) scale(2)'],
    ['1e-3px', '2e-3px'],
    ['no numbers here', 'no numbers here'],
    ['5', '9'],
  ];

  it('Then it renders exactly what compileNumericTemplate renders, in any call order', () => {
    for (const [from, to] of cases) {
      const a = tokenizeNumbers(from);
      const b = tokenizeNumbers(to);
      const joined = compileNumericTemplateJoined(a, b);
      const concatenated = compileNumericTemplate(a, b);
      for (const progress of [0.5, 1, 0, 1.5, -0.25, 0.3, 0.5]) {
        expect(joined(progress)).toBe(concatenated(progress));
      }
    }
  });

  it('Then a missing end value keeps the start value and separate renderers do not share state', () => {
    const first = compileNumericTemplateJoined(tokenizeNumbers('1px 2px'), tokenizeNumbers('5px'));
    const second = compileNumericTemplateJoined(tokenizeNumbers('0px 0px'), tokenizeNumbers('10px 20px'));
    expect(first(0.5)).toBe('3px 2px');
    expect(second(0.5)).toBe('5px 10px');
    expect(first(1)).toBe('5px 2px');
  });

  it('Then results are strings that stay valid after the next call', () => {
    const render = compileNumericTemplateJoined(tokenizeNumbers('0 0'), tokenizeNumbers('10 20'));
    const earlier = render(0.5);
    render(1);
    expect(earlier).toBe('5 10');
  });
});
