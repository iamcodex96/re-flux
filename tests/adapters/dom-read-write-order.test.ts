import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { animate } from '../../src/adapters/dom/animation.js';
import { flip } from '../../src/adapters/dom/layout.js';
import { installBrowserGlobals } from '../helpers/fakeDom.js';
import { RafController } from '../helpers/RafController.js';

/**
 * PERF-010: a browser must recalculate style and layout whenever a layout or style *read* follows a style *write*. These
 * tests record the order of the reads (bounding rectangles, computed styles) and the inline-style writes the DOM helpers
 * make while they set up an animation, and require every read to come before the first write.
 */

const raf = new RafController();
let restoreGlobals: () => void;
let log: string[];

beforeEach(() => {
  raf.install();
  log = [];
  restoreGlobals = installBrowserGlobals(
    {
      getComputedStyle: (element: { readonly id: string }) => ({
        transform: (log.push(`computed:${element.id}`), 'none'),
      }),
    },
    {},
  );
});
afterEach(() => {
  restoreGlobals();
  raf.uninstall();
  jest.restoreAllMocks();
});

interface RecordedElement extends HTMLElement {
  readonly id: string;
}

/** Element that logs rectangle reads, computed-style reads and inline-style writes into the shared `log`. */
function recorded(
  id: string,
  rect: () => { left: number; top: number; width: number; height: number },
): RecordedElement {
  const values = new Map<string, string>();
  const style = {
    getPropertyValue: (name: string) => values.get(name) ?? '',
    getPropertyPriority: () => '',
    setProperty: (name: string, value: string) => {
      log.push(`write:${id}:${name}`);
      values.set(name, value);
    },
    removeProperty: (name: string) => {
      values.delete(name);
      return '';
    },
  };
  const view = {
    getComputedStyle: () => ({
      getPropertyValue: (name: string) => {
        log.push(`computed:${id}:${name}`);
        if (name === 'opacity') return '1';
        if (name === 'margin-left') return '0px';
        if (name === 'color') return id === 'bad' ? '' : 'rgb(0, 0, 0)';
        return '';
      },
    }),
  };
  return {
    id,
    nodeType: 1,
    style,
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => {
      log.push(`rect:${id}`);
      return rect();
    },
  } as unknown as RecordedElement;
}

function lastReadIndex(prefixes: readonly string[]): number {
  return log.reduce((last, entry, index) => (prefixes.some((prefix) => entry.startsWith(prefix)) ? index : last), -1);
}

function firstWriteIndex(): number {
  return log.findIndex((entry) => entry.startsWith('write:'));
}

describe('Given flip() over several elements', () => {
  describe('When it sets up the animation after the mutation callback', () => {
    it('Then every layout and style read happens before the first inline-style write', () => {
      const elements = ['a', 'b', 'c', 'd'].map((id, index) =>
        recorded(id, () => ({ left: index * 10, top: 0, width: 10, height: 10 })),
      );

      flip(elements, () => log.push('mutate'), { duration: 100 });

      expect(log.filter((entry) => entry === 'mutate')).toHaveLength(1);
      expect(firstWriteIndex()).toBeGreaterThan(-1);
      expect(lastReadIndex(['rect:', 'computed:'])).toBeLessThan(firstWriteIndex());
    });

    it('Then each element is still read once before and once after the mutation, and written for transform and origin', () => {
      const elements = ['a', 'b', 'c'].map((id) => recorded(id, () => ({ left: 0, top: 0, width: 10, height: 10 })));

      flip(elements, () => log.push('mutate'), { duration: 100 });

      const mutateIndex = log.indexOf('mutate');
      for (const { id } of elements) {
        expect(log.slice(0, mutateIndex).filter((entry) => entry === `rect:${id}`)).toHaveLength(1);
        expect(log.slice(mutateIndex).filter((entry) => entry === `rect:${id}`)).toHaveLength(1);
        expect(log.filter((entry) => entry === `computed:${id}`)).toHaveLength(1);
        expect(log).toContain(`write:${id}:transform`);
        expect(log).toContain(`write:${id}:transform-origin`);
      }
    });
  });

  describe('When one target contains another target', () => {
    it('Then the old per-element order is kept so the descendant is measured after its ancestor is inverted', () => {
      const parent = recorded('parent', () => ({ left: 0, top: 0, width: 10, height: 10 }));
      const child = recorded('child', () => ({ left: 0, top: 0, width: 5, height: 5 }));
      Object.assign(child, { parentElement: parent });
      Object.assign(parent, { parentElement: null });

      flip([parent, child], () => log.push('mutate'), { duration: 100 });

      const afterMutation = log.slice(log.indexOf('mutate') + 1);
      expect(afterMutation.indexOf('write:parent:transform')).toBeGreaterThan(-1);
      expect(afterMutation.indexOf('write:parent:transform')).toBeLessThan(afterMutation.indexOf('rect:child'));
    });
  });
});

describe('Given animate() over several elements', () => {
  describe('When properties start from their computed value (a single target value)', () => {
    it('Then every computed-style read happens before the first inline-style write', () => {
      const elements = ['a', 'b', 'c'].map((id) => recorded(id, () => ({ left: 0, top: 0, width: 1, height: 1 })));

      animate(elements, { duration: 100, properties: { opacity: 0.5, marginLeft: 8 } });

      const reads = log.filter((entry) => entry.startsWith('computed:'));
      expect(reads).toHaveLength(elements.length * 2);
      expect(firstWriteIndex()).toBeGreaterThan(-1);
      expect(lastReadIndex(['computed:'])).toBeLessThan(firstWriteIndex());
    });

    it('Then the first frame still starts from each element’s computed value', () => {
      const elements = ['a', 'b'].map((id) => recorded(id, () => ({ left: 0, top: 0, width: 1, height: 1 })));

      const animation = animate(elements, { duration: 100, properties: { opacity: 0.5 } });

      for (const element of elements) expect(element.style.getPropertyValue('opacity')).toBe('1');
      animation.seek(100);
      for (const element of elements) expect(element.style.getPropertyValue('opacity')).toBe('0.5');
    });
  });

  describe('When every property gives explicit [from, to] values', () => {
    it('Then no computed style is read at all', () => {
      const elements = ['a', 'b', 'c'].map((id) => recorded(id, () => ({ left: 0, top: 0, width: 1, height: 1 })));

      animate(elements, { duration: 100, properties: { opacity: [1, 0.2], marginLeft: [0, 10] } });

      expect(log.filter((entry) => entry.startsWith('computed:'))).toHaveLength(0);
      expect(log.filter((entry) => entry.startsWith('write:'))).toHaveLength(elements.length * 2);
    });
  });

  describe('When a later element cannot provide a starting value', () => {
    it('Then it throws and leaves no inline style written by the earlier elements', () => {
      const good = recorded('good', () => ({ left: 0, top: 0, width: 1, height: 1 }));
      const bad = recorded('bad', () => ({ left: 0, top: 0, width: 1, height: 1 }));

      expect(() => animate([good, bad], { duration: 100, properties: { color: 'red' } })).toThrow(TypeError);

      expect(good.style.getPropertyValue('color')).toBe('');
    });
  });
});
