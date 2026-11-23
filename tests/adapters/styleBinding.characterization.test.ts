import { describe, expect, it, jest } from '@jest/globals';
import { Subject } from 'rxjs';
import { animate, bindStyle, type CssStyleMap } from '../../src/adapters/dom.js';
import { bindStyleProperty } from '../../src/adapters/dom/styleBinding.js';
import { Timeline } from '../../src/core/Timeline.js';
import { bindSvgAttributes, type SvgAttributeMap } from '../../src/adapters/svg.js';

/**
 * PERF-006 characterization: the observable DOM write behaviour of `bindStyle`, `bindSvgAttributes` and the
 * `animate()` -> style binding wiring. Written against the unoptimized code and kept green through the change,
 * except the one test explicitly marked as the documented stale-cache trade-off.
 */

type StyleCall = readonly ['set' | 'remove', string, string?, string?];

interface RecordingStyle {
  readonly style: CSSStyleDeclaration;
  readonly calls: StyleCall[];
  /** Mutate the declaration the way user code would: not recorded as a binding write. */
  externalSet(name: string, value: string, priority?: string): void;
  value(name: string): string;
  priority(name: string): string;
}

function recordingStyle(initial: Record<string, string | readonly [string, string]> = {}): RecordingStyle {
  const values = new Map<string, string>();
  const priorities = new Map<string, string>();
  for (const [name, entry] of Object.entries(initial)) {
    if (typeof entry === 'string') values.set(name, entry);
    else {
      values.set(name, entry[0]);
      priorities.set(name, entry[1]);
    }
  }
  const calls: StyleCall[] = [];
  const style = {
    getPropertyValue: (name: string) => values.get(name) ?? '',
    getPropertyPriority: (name: string) => priorities.get(name) ?? '',
    setProperty: (name: string, value: string, priority?: string) => {
      calls.push(priority === undefined ? ['set', name, value] : ['set', name, value, priority]);
      values.set(name, value);
      priorities.set(name, priority ?? '');
    },
    removeProperty: (name: string) => {
      calls.push(['remove', name]);
      const previous = values.get(name) ?? '';
      values.delete(name);
      priorities.delete(name);
      return previous;
    },
  } as unknown as CSSStyleDeclaration;
  return {
    style,
    calls,
    externalSet: (name, value, priority = '') => {
      values.set(name, value);
      priorities.set(name, priority);
    },
    value: (name) => values.get(name) ?? '',
    priority: (name) => priorities.get(name) ?? '',
  };
}

function elementWith(recording: RecordingStyle): HTMLElement {
  const computed = { getPropertyValue: (name: string) => recording.value(name) };
  return {
    nodeType: 1,
    style: recording.style,
    ownerDocument: { defaultView: { getComputedStyle: () => computed } },
  } as unknown as HTMLElement;
}

describe('Given bindStyle write behaviour', () => {
  describe('When several properties are bound', () => {
    describe('And When snapshots are emitted, a key is omitted, and the subscription closes', () => {
      it('Then it issues exactly these setProperty/removeProperty calls, restores before writing, and restores in capture order', () => {
        const recording = recordingStyle({ opacity: '0.25', width: '10px' });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.9', width: '200px', color: 'red' });
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0.9'],
          ['set', 'width', '200px'],
          ['set', 'color', 'red'],
        ]);

        recording.calls.length = 0;
        source.next({ opacity: '0.5', color: 'blue' });
        expect(recording.calls).toEqual([
          ['set', 'width', '10px', ''],
          ['set', 'opacity', '0.5'],
          ['set', 'color', 'blue'],
        ]);

        recording.calls.length = 0;
        binding.unsubscribe();
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0.25', ''],
          ['set', 'width', '10px', ''],
          ['remove', 'color'],
        ]);
      });
    });
  });

  describe('When original inline declarations carry a priority or are absent', () => {
    describe('And When a key is omitted by a later snapshot and again on unsubscribe', () => {
      it('Then it restores value AND priority, and removes properties that had no original value', () => {
        const recording = recordingStyle({ width: ['10px', 'important'] });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ width: '50px', height: '20px' });
        expect(recording.value('width')).toBe('50px');
        expect(recording.priority('width')).toBe('');

        source.next({ height: '30px' });
        expect(recording.value('width')).toBe('10px');
        expect(recording.priority('width')).toBe('important');
        expect(recording.value('height')).toBe('30px');

        source.next({});
        expect(recording.value('height')).toBe('');
        expect(recording.calls.at(-1)).toEqual(['remove', 'height']);

        source.next({ width: '70px', height: '40px' });
        binding.unsubscribe();
        expect(recording.value('width')).toBe('10px');
        expect(recording.priority('width')).toBe('important');
        expect(recording.value('height')).toBe('');
      });
    });
  });

  describe('When a later snapshot omits a previously written key through the public binding', () => {
    describe('And When the key is written again afterwards', () => {
      it('Then the omitted key is restored once and the later write is applied again', () => {
        const recording = recordingStyle({ opacity: '0.3' });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.8' });
        source.next({ width: '5px' });
        expect(recording.value('opacity')).toBe('0.3');
        source.next({ opacity: '0.8', width: '5px' });
        expect(recording.value('opacity')).toBe('0.8');
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0.8'],
          ['set', 'opacity', '0.3', ''],
          ['set', 'width', '5px'],
          ['set', 'opacity', '0.8'],
          ['set', 'width', '5px'],
        ]);
        binding.unsubscribe();
      });
    });
  });

  describe('When a snapshot value is null or undefined', () => {
    describe('And When the same value is written again afterwards', () => {
      it('Then it restores the original declaration and the next real value is written again', () => {
        const recording = recordingStyle({ opacity: '0.3' });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.8', width: '5px' });
        source.next({ opacity: null, width: undefined });
        expect(recording.value('opacity')).toBe('0.3');
        expect(recording.value('width')).toBe('');
        source.next({ opacity: '0.8', width: '5px' });
        expect(recording.value('opacity')).toBe('0.8');
        expect(recording.value('width')).toBe('5px');
        binding.unsubscribe();
        expect(recording.value('opacity')).toBe('0.3');
        expect(recording.value('width')).toBe('');
      });
    });
  });

  describe('When the first emission equals the value already inline', () => {
    describe('And When the binding is created and written', () => {
      it('Then the first write always happens', () => {
        const recording = recordingStyle({ width: '10px' });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ width: '10px' });
        expect(recording.calls).toEqual([['set', 'width', '10px']]);
        binding.unsubscribe();
      });
    });
  });

  describe('When the subscription is closed before any emission', () => {
    describe('And When it is closed twice', () => {
      it('Then nothing is written or restored, and the second close is a no-op', () => {
        const recording = recordingStyle({ width: '10px' });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        binding.unsubscribe();
        binding.unsubscribe();
        source.next({ width: '99px' });
        expect(recording.calls).toEqual([]);
        expect(recording.value('width')).toBe('10px');
      });
    });
  });

  describe('When the binding is closed in the middle of a run', () => {
    describe('And When the source keeps emitting', () => {
      it('Then it restores once and ignores later emissions', () => {
        const recording = recordingStyle({ opacity: '0.3' });
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.5' });
        binding.unsubscribe();
        expect(recording.value('opacity')).toBe('0.3');
        recording.calls.length = 0;
        source.next({ opacity: '0.9' });
        expect(recording.calls).toEqual([]);
        expect(recording.value('opacity')).toBe('0.3');
      });
    });
  });

  describe('When user code mutates the style between two emissions', () => {
    describe('And When the binding emits a different value afterwards', () => {
      it('Then the new value always wins', () => {
        const recording = recordingStyle();
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.4' });
        recording.externalSet('opacity', '1');
        source.next({ opacity: '0.6' });
        expect(recording.value('opacity')).toBe('0.6');
        binding.unsubscribe();
      });
    });

    describe('And When the binding re-emits the value it last wrote', () => {
      it('Then it overwrites the external change', () => {
        const recording = recordingStyle();
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.4' });
        recording.externalSet('opacity', '1');
        source.next({ opacity: '0.4' });
        expect(recording.value('opacity')).toBe('0.4');
        binding.unsubscribe();
      });
    });
  });
});

describe('Given animate() wiring into the style binding', () => {
  describe('When a single property animates over a seek sequence', () => {
    describe('And When the animation is disposed', () => {
      it('Then every emission is written in order and dispose restores the original inline value', () => {
        const recording = recordingStyle({ opacity: '0.25' });
        const animation = animate(elementWith(recording), { duration: 100, properties: { opacity: [0, 1] } });

        // Construction emits the first keyframe value immediately.
        expect(recording.calls).toEqual([['set', 'opacity', '0']]);
        animation.seek(50);
        animation.seek(100);
        animation.seek(25);
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0'],
          ['set', 'opacity', '0.5'],
          ['set', 'opacity', '1'],
          ['set', 'opacity', '0.25'],
        ]);
        expect(recording.value('opacity')).toBe('0.25');

        recording.calls.length = 0;
        animation.dispose();
        expect(recording.calls).toEqual([['set', 'opacity', '0.25', '']]);
      });
    });

    describe('And When the original property had no inline value', () => {
      it('Then dispose removes the property', () => {
        const recording = recordingStyle();
        const animation = animate(elementWith(recording), { duration: 100, properties: { width: ['10px', '20px'] } });
        animation.seek(50);
        expect(recording.value('width')).toBe('15px');
        animation.dispose();
        expect(recording.calls.at(-1)).toEqual(['remove', 'width']);
        expect(recording.value('width')).toBe('');
      });
    });
  });

  describe('When the animation is disposed in the middle of a run', () => {
    describe('And When it is sought afterwards', () => {
      it('Then the style is restored and no further writes happen', () => {
        const recording = recordingStyle({ opacity: '0.25' });
        const animation = animate(elementWith(recording), { duration: 100, properties: { opacity: [0, 1] } });
        animation.seek(50);
        animation.dispose();
        recording.calls.length = 0;
        expect(() => animation.seek(75)).not.toThrow();
        expect(recording.calls).toEqual([]);
        expect(recording.value('opacity')).toBe('0.25');
      });
    });
  });

  describe('When two properties animate on one element', () => {
    describe('And When one property holds a constant value across a seek', () => {
      it('Then each property is bound and restored independently', () => {
        const recording = recordingStyle({ opacity: '0.25', width: '10px' });
        const animation = animate(elementWith(recording), {
          duration: 100,
          properties: { opacity: [0, 1], width: ['10px', '10px'] },
        });
        animation.seek(50);
        expect(recording.value('opacity')).toBe('0.5');
        expect(recording.value('width')).toBe('10px');
        animation.dispose();
        expect(recording.value('opacity')).toBe('0.25');
        expect(recording.value('width')).toBe('10px');
      });
    });
  });
});

type AttrCall = readonly ['set' | 'remove', string, string?];

function recordingSvg(initial: Record<string, string> = {}) {
  const attributes = new Map(Object.entries(initial));
  const calls: AttrCall[] = [];
  const element = {
    hasAttribute: (name: string) => attributes.has(name),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      calls.push(['set', name, value]);
      attributes.set(name, value);
    },
    removeAttribute: (name: string) => {
      calls.push(['remove', name]);
      attributes.delete(name);
    },
  } as unknown as SVGElement;
  return { element, calls, attributes };
}

describe('Given bindSvgAttributes write behaviour', () => {
  describe('When several attributes are bound', () => {
    describe('And When snapshots are emitted, a key is omitted, and the subscription closes', () => {
      it('Then it issues exactly these setAttribute/removeAttribute calls', () => {
        const { element, calls } = recordingSvg({ opacity: '0.2', fill: 'red' });
        const source = new Subject<SvgAttributeMap>();
        const binding = bindSvgAttributes(element, source);

        source.next({ opacity: 0.8, fill: 'blue', hidden: true, x: null });
        expect(calls).toEqual([
          ['set', 'opacity', '0.8'],
          ['set', 'fill', 'blue'],
          ['set', 'hidden', ''],
          ['remove', 'x'],
        ]);

        calls.length = 0;
        source.next({ opacity: 0.5, hidden: false, x: undefined });
        expect(calls).toEqual([
          ['set', 'fill', 'red'],
          ['set', 'opacity', '0.5'],
          ['remove', 'hidden'],
          ['remove', 'x'],
        ]);

        calls.length = 0;
        binding.unsubscribe();
        expect(calls).toEqual([
          ['set', 'opacity', '0.2'],
          ['set', 'fill', 'red'],
          ['remove', 'hidden'],
          ['remove', 'x'],
        ]);
      });
    });
  });

  describe('When the first emission equals the attribute already present', () => {
    describe('And When it removes an attribute that never existed', () => {
      it('Then the first write always happens', () => {
        const { element, calls } = recordingSvg({ opacity: '0.5' });
        const source = new Subject<SvgAttributeMap>();
        const binding = bindSvgAttributes(element, source);
        source.next({ opacity: 0.5, hidden: false });
        expect(calls).toEqual([
          ['set', 'opacity', '0.5'],
          ['remove', 'hidden'],
        ]);
        binding.unsubscribe();
      });
    });
  });

  describe('When an omitted key is written again and the binding closes mid-run', () => {
    describe('And When the source keeps emitting', () => {
      it('Then the key is restored, written again, restored on close, and later emissions are ignored', () => {
        const { element, calls, attributes } = recordingSvg({ fill: 'red' });
        const source = new Subject<SvgAttributeMap>();
        const binding = bindSvgAttributes(element, source);

        source.next({ fill: 'blue' });
        source.next({ stroke: 'black' });
        expect(attributes.get('fill')).toBe('red');
        source.next({ fill: 'blue', stroke: 'black' });
        expect(attributes.get('fill')).toBe('blue');
        binding.unsubscribe();
        expect(attributes.get('fill')).toBe('red');
        expect(attributes.has('stroke')).toBe(false);
        calls.length = 0;
        source.next({ fill: 'green' });
        expect(calls).toEqual([]);
      });
    });
  });

  describe('When user code mutates an attribute between two emissions', () => {
    describe('And When the binding re-emits the value it last wrote', () => {
      it('Then it overwrites the external change', () => {
        const { element, attributes } = recordingSvg();
        const source = new Subject<SvgAttributeMap>();
        const binding = bindSvgAttributes(element, source);
        source.next({ opacity: 0.4 });
        attributes.set('opacity', '1');
        source.next({ opacity: 0.4 });
        expect(attributes.get('opacity')).toBe('0.4');
        binding.unsubscribe();
      });
    });
  });
});

describe('Given PERF-006 write parity (every emission with a value writes)', () => {
  describe('When the same value is emitted twice through bindStyle', () => {
    describe('And When the style declaration is spied on', () => {
      it('Then setProperty is called for every emission, equal or not', () => {
        const recording = recordingStyle();
        const setProperty = jest.spyOn(recording.style, 'setProperty');
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ opacity: '0.5', width: '1px' });
        source.next({ opacity: '0.5', width: '1px' });
        expect(setProperty).toHaveBeenCalledTimes(4);
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0.5'],
          ['set', 'width', '1px'],
          ['set', 'opacity', '0.5'],
          ['set', 'width', '1px'],
        ]);
        binding.unsubscribe();
      });
    });
  });

  describe('When several keys are omitted by one emission', () => {
    describe('And When their order in the previous emission differs from the order they were first captured in', () => {
      it("Then bindStyle restores them in the previous emission's key order, and unsubscribe in capture order", () => {
        const recording = recordingStyle();
        const source = new Subject<CssStyleMap>();
        const binding = bindStyle({ style: recording.style } as unknown as HTMLElement, source);

        source.next({ a: '1', b: '1', c: '1' });
        source.next({ c: '2', b: '2', a: '2' });
        recording.calls.length = 0;
        source.next({});
        expect(recording.calls).toEqual([
          ['remove', 'c'],
          ['remove', 'b'],
          ['remove', 'a'],
        ]);

        source.next({ b: '3', a: '3', c: '3' });
        recording.calls.length = 0;
        binding.unsubscribe();
        expect(recording.calls).toEqual([
          ['remove', 'a'],
          ['remove', 'b'],
          ['remove', 'c'],
        ]);
      });
    });
  });

  describe('When the same value is emitted twice through the internal single-property binding', () => {
    describe('And When the binding is created, written twice, changed, and closed', () => {
      it('Then it writes every emission and restores the original declaration (value and priority)', () => {
        const recording = recordingStyle({ opacity: ['0.25', 'important'] });
        const setProperty = jest.spyOn(recording.style, 'setProperty');
        const source = new Subject<string>();
        const binding = bindStyleProperty({ style: recording.style } as unknown as HTMLElement, 'opacity', source);

        source.next('0.5');
        source.next('0.5');
        expect(setProperty).toHaveBeenCalledTimes(2);
        source.next('0.7');
        expect(recording.value('opacity')).toBe('0.7');
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0.5'],
          ['set', 'opacity', '0.5'],
          ['set', 'opacity', '0.7'],
        ]);

        binding.unsubscribe();
        expect(recording.value('opacity')).toBe('0.25');
        expect(recording.priority('opacity')).toBe('important');
      });
    });

    describe('And When the first value equals the inline value, and the property had no original value', () => {
      it('Then the first write happens, and closing removes a property that had no original value', () => {
        const recording = recordingStyle({ width: '10px' });
        const source = new Subject<string>();
        const first = bindStyleProperty({ style: recording.style } as unknown as HTMLElement, 'width', source);
        source.next('10px');
        expect(recording.calls).toEqual([['set', 'width', '10px']]);
        first.unsubscribe();

        const empty = recordingStyle();
        const second = bindStyleProperty({ style: empty.style } as unknown as HTMLElement, 'height', source);
        source.next('4px');
        second.unsubscribe();
        expect(empty.calls).toEqual([
          ['set', 'height', '4px'],
          ['remove', 'height'],
        ]);
      });
    });

    describe('And When it is closed before any emission or twice', () => {
      it('Then nothing is written or restored', () => {
        const recording = recordingStyle({ width: '10px' });
        const source = new Subject<string>();
        const binding = bindStyleProperty({ style: recording.style } as unknown as HTMLElement, 'width', source);
        binding.unsubscribe();
        binding.unsubscribe();
        source.next('99px');
        expect(recording.calls).toEqual([]);
      });
    });
  });

  describe('When animate() is sought twice to the same time', () => {
    describe('And When a property holds one value for the whole run', () => {
      it('Then each seek writes every property again', () => {
        const recording = recordingStyle({ opacity: '0.25' });
        const animation = animate(elementWith(recording), {
          duration: 100,
          properties: { opacity: [0, 1], 'transform-origin': ['0px 0px', '0px 0px'] },
        });
        recording.calls.length = 0;

        animation.seek(25);
        animation.seek(25);
        expect(recording.calls).toEqual([
          ['set', 'opacity', '0.25'],
          ['set', 'transform-origin', '0px 0px'],
          ['set', 'opacity', '0.25'],
          ['set', 'transform-origin', '0px 0px'],
        ]);
        animation.dispose();
      });
    });
  });

  describe('When two animate() calls drive the same property of one element', () => {
    describe('And When the first re-emits the value it last wrote after the second wrote another', () => {
      it('Then the latest emission wins, so the first animation overwrites the second', () => {
        const recording = recordingStyle();
        const element = elementWith(recording);
        const first = animate(element, { duration: 100, properties: { opacity: ['0.2', '0.2'] } });
        const second = animate(element, { duration: 100, properties: { opacity: ['0.9', '0.9'] } });
        expect(recording.value('opacity')).toBe('0.9');

        first.seek(50);
        expect(recording.value('opacity')).toBe('0.2');
        second.dispose();
        first.dispose();
      });
    });
  });

  describe('When a Timeline composes two animate() calls on the same property of one element', () => {
    describe('And When it is scrubbed back and forth', () => {
      // Sequences recorded against 6401f2c (before PERF-006): the child added last wins whenever it emits.
      const seeks = [50, 150, 50, 60, 60, 150, 0, 200, 120, 120, 75, 75, 30, 100, 100];

      function scrub(secondStart: number, from: [number, number], to: [number, number]): string[] {
        const recording = recordingStyle();
        const element = elementWith(recording);
        const timeline = new Timeline();
        const first = animate(element, { duration: 100, properties: { opacity: from } });
        const second = animate(element, { duration: 100, properties: { opacity: to } });
        timeline.add(first, 0);
        timeline.add(second, secondStart);
        const seen = seeks.map((time) => {
          timeline.seek(time);
          return recording.value('opacity');
        });
        first.dispose();
        second.dispose();
        return seen;
      }

      it('Then a fade-in followed by a fade-out produces the unchanged inline opacity sequence', () => {
        expect(scrub(100, [0, 1], [1, 0]).join(' ')).toBe('1 0.5 1 0.6 0.6 0.5 1 0 0.8 0.8 1 0.75 0.3 1 1');
      });

      it('Then overlapping animations produce the unchanged inline opacity sequence', () => {
        expect(scrub(50, [0, 1], [1, 0]).join(' ')).toBe('1 0 1 0.9 0.9 0 1 0 0.3 0.3 0.75 0.75 1 0.5 0.5');
      });
    });
  });

  describe('When the same SVG attribute string is produced twice', () => {
    describe('And When the raw values differ in type but not in text', () => {
      it('Then setAttribute and removeAttribute are called for every emission', () => {
        const attributes = new Map<string, string>();
        const calls: string[] = [];
        const element = {
          hasAttribute: (name: string) => attributes.has(name),
          getAttribute: (name: string) => attributes.get(name) ?? null,
          setAttribute: (name: string, value: string) => {
            calls.push(`set ${name}=${value}`);
            attributes.set(name, value);
          },
          removeAttribute: (name: string) => {
            calls.push(`remove ${name}`);
            attributes.delete(name);
          },
        } as unknown as SVGElement;
        const source = new Subject<SvgAttributeMap>();
        const binding = bindSvgAttributes(element, source);

        source.next({ opacity: 0.5, hidden: true, x: false });
        source.next({ opacity: 0.5, hidden: true, x: false });
        source.next({ opacity: '0.5', hidden: true, x: null });
        expect(calls).toEqual([
          'set opacity=0.5',
          'set hidden=',
          'remove x',
          'set opacity=0.5',
          'set hidden=',
          'remove x',
          'set opacity=0.5',
          'set hidden=',
          'remove x',
        ]);
        binding.unsubscribe();
      });
    });

    describe('And When several attributes are omitted by one emission', () => {
      it("Then omitted keys are restored in the previous emission's key order, and unsubscribe in capture order", () => {
        const { element, calls } = recordingSvg();
        const source = new Subject<SvgAttributeMap>();
        const binding = bindSvgAttributes(element, source);
        source.next({ a: 1, b: 1, c: 1 });
        source.next({ c: 2, b: 2, a: 2 });
        calls.length = 0;
        source.next({});
        expect(calls).toEqual([
          ['remove', 'c'],
          ['remove', 'b'],
          ['remove', 'a'],
        ]);
        source.next({ b: 3, a: 3, c: 3 });
        calls.length = 0;
        binding.unsubscribe();
        expect(calls).toEqual([
          ['remove', 'a'],
          ['remove', 'b'],
          ['remove', 'c'],
        ]);
      });
    });
  });
});
