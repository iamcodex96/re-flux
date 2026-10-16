import { describe, expect, it, jest } from '@jest/globals';
import { Subject } from 'rxjs';
import { animate, animateNumber, animateText, draggable, bindScrollTimeline, bindStyle, interpolateCssValue, createScope, createResponsiveScope, scrollProgress$, type CssStyleMap, type DOMAnimateOptions } from '../../src/adapters/dom.js';
import { Timeline } from '../../src/core/Timeline.js';
import { RafController } from '../helpers/RafController.js';

function normalizePropertyName(name: string): string {
  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function fakeStyle(initial: Record<string, string> = {}): CSSStyleDeclaration {
  const values = new Map(Object.entries(initial).map(([key, value]) => [normalizePropertyName(key), value]));
  const priorities = new Map<string, string>();
  return {
    getPropertyValue: (name: string) => values.get(name) ?? '',
    getPropertyPriority: (name: string) => priorities.get(name) ?? '',
    setProperty: (name: string, value: string, priority = '') => { values.set(name, value); priorities.set(name, priority); },
    removeProperty: (name: string) => { const old = values.get(name) ?? ''; values.delete(name); priorities.delete(name); return old; },
  } as unknown as CSSStyleDeclaration;
}

function createElement(initial: Record<string, string> = {}): HTMLElement {
  const style = fakeStyle(initial);
  const computedValues = new Map(Object.entries(initial).map(([key, value]) => [normalizePropertyName(key), value]));
  const view = {
    getComputedStyle: () => ({ getPropertyValue: (name: string) => computedValues.get(name) ?? style.getPropertyValue(name) }),
  };
  const documentStub = { defaultView: view };
  return { nodeType: 1, style, ownerDocument: documentStub } as unknown as HTMLElement;
}

function createTextElement(initialText: string): HTMLElement {
  type FakeNode = { nodeType: number; textContent: string; children?: FakeNode[]; style?: CSSStyleDeclaration; dataset?: Record<string, string>; attributes?: Map<string, string>; append?: (node: FakeNode) => void; setAttribute?: (name: string, value: string) => void };
  const makeText = (text: string): FakeNode => ({ nodeType: 3, textContent: text });
  const documentStub = {
    createTextNode: (text: string) => makeText(text),
    createDocumentFragment: () => {
      const fragment: FakeNode = { nodeType: 11, textContent: '', children: [] };
      fragment.append = (node) => { fragment.children!.push(node); };
      return fragment;
    },
    createElement: () => {
      const attributes = new Map<string, string>();
      const element: FakeNode = { nodeType: 1, textContent: '', style: fakeStyle(), dataset: {}, attributes };
      element.setAttribute = (name, value) => { attributes.set(name, value); };
      return element;
    },
  };
  let children: FakeNode[] = [makeText(initialText)];
  const attributes = new Map<string, string>();
  const target = {
    nodeType: 1,
    ownerDocument: documentStub,
    style: fakeStyle(),
    get childNodes() { return children; },
    get textContent() { return children.map((child) => child.textContent).join(''); },
    set textContent(value: string) { children = [makeText(value)]; },
    replaceChildren: (...nodes: FakeNode[]) => {
      children = nodes.flatMap((node) => node.nodeType === 11 ? (node.children ?? []) : [node]);
    },
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    hasAttribute: (name: string) => attributes.has(name),
    removeAttribute: (name: string) => { attributes.delete(name); },
  };
  return target as unknown as HTMLElement;
}



describe('draggable()', () => {
  it('maps captured pointer movement into relative translation coordinates', () => {
    const style = fakeStyle({ translate: '3px 4px' });
    const movementTarget = new EventTarget();
    const ownerDocument = Object.assign(new EventTarget(), {
      visibilityState: 'visible' as DocumentVisibilityState,
      defaultView: movementTarget,
    });
    const attributes = new Map<string, string>();
    const target = Object.assign(new EventTarget(), {
      nodeType: 1,
      style,
      ownerDocument,
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
      setPointerCapture: (_pointerId: number) => undefined,
      releasePointerCapture: (_pointerId: number) => undefined,
      hasPointerCapture: (_pointerId: number) => true,
    }) as unknown as HTMLElement;
    const controller = draggable(target, { minVelocity: 10000 });
    const pointerEvent = (type: string, x: number, y: number, timeStamp: number): Event => {
      const event = new Event(type);
      Object.defineProperties(event, {
        isPrimary: { value: true }, button: { value: 0 }, pointerId: { value: 7 },
        clientX: { value: x }, clientY: { value: y }, timeStamp: { value: timeStamp, configurable: true },
      });
      return event;
    };

    target.dispatchEvent(pointerEvent('pointerdown', 100, 80, 10));
    movementTarget.dispatchEvent(pointerEvent('pointermove', 130, 105, 26));
    movementTarget.dispatchEvent(pointerEvent('pointerup', 130, 105, 42));

    expect(controller.position).toEqual({ x: 33, y: 29 });
    expect(style.getPropertyValue('translate')).toBe('33px 29px');
    controller.destroy();
    expect(style.getPropertyValue('translate')).toBe('3px 4px');
  });

  it('eases to the nearest configured grid after pointer release', () => {
    const raf = new RafController();
    raf.install();
    try {
      const style = fakeStyle();
      const movementTarget = new EventTarget();
      const ownerDocument = Object.assign(new EventTarget(), {
        visibilityState: 'visible' as DocumentVisibilityState,
        defaultView: movementTarget,
      });
      const attributes = new Map<string, string>();
      const target = Object.assign(new EventTarget(), {
        nodeType: 1, style, ownerDocument,
        getAttribute: (name: string) => attributes.get(name) ?? null,
        setAttribute: (name: string, value: string) => { attributes.set(name, value); },
        removeAttribute: (name: string) => { attributes.delete(name); },
        setPointerCapture: (_pointerId: number) => undefined,
        releasePointerCapture: (_pointerId: number) => undefined,
        hasPointerCapture: (_pointerId: number) => true,
      }) as unknown as HTMLElement;
      const controller = draggable(target, { initialPosition: { x: 12, y: 8 }, minVelocity: 10000, snapTo: 10, snapDuration: 100 });
      const pointerEvent = (type: string, x: number, y: number, timeStamp: number): Event => {
        const event = new Event(type);
        Object.defineProperties(event, {
          isPrimary: { value: true }, button: { value: 0 }, pointerId: { value: 9 },
          clientX: { value: x }, clientY: { value: y }, timeStamp: { value: timeStamp, configurable: true },
        });
        return event;
      };

      target.dispatchEvent(pointerEvent('pointerdown', 100, 80, 10));
      movementTarget.dispatchEvent(pointerEvent('pointermove', 130, 105, 26));
      movementTarget.dispatchEvent(pointerEvent('pointerup', 130, 105, 42));
      expect(controller.position).toEqual({ x: 42, y: 33 });
      raf.advance(0);
      raf.advance(50);
      raf.advance(100);
      expect(controller.position).toEqual({ x: 40, y: 30 });
      controller.destroy();
      expect(raf.pendingCount).toBe(0);
    } finally {
      raf.uninstall();
    }
  });

  it('clamps keyboard movement to current bounds and restores owned styles on destroy', () => {
    const style = fakeStyle({ translate: '3px 4px', cursor: 'crosshair', 'touch-action': 'pan-y', 'user-select': 'text' });
    const attributes = new Map<string, string>([['aria-label', 'Movable panel']]);
    const ownerDocument = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState; defaultView: EventTarget | null };
    ownerDocument.visibilityState = 'visible';
    ownerDocument.defaultView = new EventTarget();
    const target = Object.assign(new EventTarget(), {
      nodeType: 1,
      style,
      ownerDocument,
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => { attributes.set(name, value); },
      removeAttribute: (name: string) => { attributes.delete(name); },
      setPointerCapture: (_pointerId: number) => undefined,
      releasePointerCapture: (_pointerId: number) => undefined,
      hasPointerCapture: (_pointerId: number) => true,
    }) as unknown as HTMLElement;
    const controller = draggable(target, {
      initialPosition: { x: 10, y: 5 },
      getBounds: () => ({ minX: 0, maxX: 25, minY: 0, maxY: 20 }),
    });

    expect(controller.position).toEqual({ x: 10, y: 5 });
    expect(style.getPropertyValue('translate')).toBe('10px 5px');
    expect(attributes.get('tabindex')).toBe('0');

    const right = new Event('keydown');
    Object.defineProperty(right, 'key', { value: 'ArrowRight' });
    Object.defineProperty(right, 'shiftKey', { value: false });
    target.dispatchEvent(right);
    target.dispatchEvent(right);
    expect(controller.position).toEqual({ x: 25, y: 5 });

    controller.destroy();
    expect(style.getPropertyValue('translate')).toBe('3px 4px');
    expect(style.getPropertyValue('cursor')).toBe('crosshair');
    expect(style.getPropertyValue('touch-action')).toBe('pan-y');
    expect(style.getPropertyValue('user-select')).toBe('text');
    expect(attributes.has('tabindex')).toBe(false);
    expect(() => controller.dispose()).not.toThrow();
  });

  it('rejects invalid starting coordinates before installing listeners', () => {
    const target = createElement();
    expect(() => draggable(target, { initialPosition: { x: Number.NaN, y: 0 } })).toThrow('initialPosition');
  });
});

describe('bindStyle', () => {
  it('applies each style snapshot and restores original inline values on unsubscribe', () => {
    const style = fakeStyle({ opacity: '0.25', width: '10px' });
    const element = { style } as unknown as HTMLElement;
    const source = new Subject<CssStyleMap>();
    const binding = bindStyle(element, source);

    source.next({ opacity: '0.9', width: '200px' });
    expect(style.getPropertyValue('opacity')).toBe('0.9');
    expect(style.getPropertyValue('width')).toBe('200px');

    source.next({ opacity: '0.5' });
    expect(style.getPropertyValue('opacity')).toBe('0.5');
    expect(style.getPropertyValue('width')).toBe('10px');

    binding.unsubscribe();
    expect(style.getPropertyValue('opacity')).toBe('0.25');
    expect(style.getPropertyValue('width')).toBe('10px');
  });
});

describe('animate() DOM API', () => {
  it('animates arrays of elements on one timeline with staggered starts', () => {
    const first = createElement({ opacity: '0.25', transform: 'translateY(20px)' });
    const second = createElement({ opacity: '0.4', transform: 'translateY(20px)' });
    const animation = animate([first, second], {
      duration: 100,
      stagger: 50,
      properties: {
        opacity: [0, 1],
        transform: ['translateY(20px)', 'translateY(0px)'],
      },
    });

    expect(animation.duration).toBe(150);
    expect(animation.segments.map((segment) => segment.startTime)).toEqual([0, 0, 50, 50]);

    animation.seek(50);
    expect(first.style.getPropertyValue('opacity')).toBe('0.5');
    expect(first.style.getPropertyValue('transform')).toBe('translateY(10px)');
    expect(second.style.getPropertyValue('opacity')).toBe('0');

    animation.seek(100);
    expect(first.style.getPropertyValue('opacity')).toBe('1');
    expect(second.style.getPropertyValue('opacity')).toBe('0.5');
    animation.dispose();
    expect(first.style.getPropertyValue('opacity')).toBe('0.25');
    expect(first.style.getPropertyValue('transform')).toBe('translateY(20px)');
  });

  it('resolves CSS selectors and reports selectors that match nothing', () => {
    const element = createElement({ opacity: '1' });
    const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { querySelectorAll: (selector: string) => selector === '.item' ? [element] : [] },
    });
    try {
      const animation = animate('.item', { duration: 100, properties: { opacity: [1, 0] } });
      animation.seek(50);
      expect(element.style.getPropertyValue('opacity')).toBe('0.5');
      animation.dispose();
      expect(() => animate('.missing', { duration: 100, properties: { opacity: [1, 0] } })).toThrow('did not match any elements');
    } finally {
      if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });

  it('supports per-element stagger callbacks and CSS camelCase properties', () => {
    const first = createElement({ backgroundColor: 'rgb(0, 0, 0)' });
    const second = createElement({ backgroundColor: 'rgb(0, 0, 0)' });
    const animation = animate([first, second], {
      duration: 100,
      stagger: (index) => index * 25,
      properties: { backgroundColor: ['rgb(0, 0, 0)', 'rgb(100, 100, 100)'] },
    });
    animation.seek(50);
    expect(first.style.getPropertyValue('background-color')).toBe('rgb(50, 50, 50)');
    expect(second.style.getPropertyValue('background-color')).toBe('rgb(25, 25, 25)');
    animation.dispose();
  });

  it('supports independent property durations and delays without a global duration', () => {
    const element = createElement({ opacity: '0', transform: 'translateX(0px)' });
    const animation = animate(element, {
      properties: {
        opacity: { values: [0, 1], duration: 100, easing: 'linear' },
        transform: {
          values: ['translateX(0px)', 'translateX(100px)'],
          duration: 200,
          delay: 50,
          easing: 'linear',
        },
      },
    });

    expect(animation.duration).toBe(250);
    animation.seek(100);
    expect(element.style.getPropertyValue('opacity')).toBe('1');
    expect(element.style.getPropertyValue('transform')).toBe('translateX(25px)');

    animation.dispose();
    expect(element.style.getPropertyValue('opacity')).toBe('0');
    expect(element.style.getPropertyValue('transform')).toBe('translateX(0px)');
  });

  it('adds global delay, property delay, and target stagger', () => {
    const first = createElement({ opacity: '0' });
    const second = createElement({ opacity: '0' });
    const animation = animate([first, second], {
      delay: 10,
      properties: { opacity: { values: [0, 1], duration: 100, delay: 15, easing: 'linear' } },
      stagger: (index) => index * 20,
    });

    expect(animation.duration).toBe(145);
    animation.seek(45);
    expect(first.style.getPropertyValue('opacity')).toBe('0.2');
    expect(second.style.getPropertyValue('opacity')).toBe('0');
    animation.dispose();
  });

  it('rejects property configs that specify both values and keyframes before mutation', () => {
    const element = createElement({ opacity: '1' });
    const invalidOptions = {
      properties: {
        opacity: { values: [0, 1], keyframes: [{ value: 0 }, { value: 1 }], duration: 100 },
      },
    } as unknown as DOMAnimateOptions;

    expect(() => animate(element, invalidOptions)).toThrow('must define exactly one of "from" + "to", "values", or "keyframes"');
    expect(element.style.getPropertyValue('opacity')).toBe('1');
  });

  it('supports explicit property keyframes with offsets and per-segment easing', () => {
    const element = createElement({ transform: 'translateX(0px)' });
    const animation = animate(element, {
      properties: {
        transform: {
          duration: 200,
          keyframes: [
            { value: 'translateX(0px)', offset: 0 },
            { value: 'translateX(25px)', offset: 0.25, easing: 'easeInQuad' },
            { value: 'translateX(100px)', offset: 1 },
          ],
        },
      },
    });

    animation.seek(50);
    expect(element.style.getPropertyValue('transform')).toBe('translateX(25px)');
    animation.seek(100);
    expect(element.style.getPropertyValue('transform')).toBe('translateX(33.3333px)');
    animation.dispose();
  });

  it('uses global defaults while allowing a property to override repeat and yoyo', () => {
    const element = createElement({ opacity: '0', width: '0px' });
    const animation = animate(element, {
      duration: 100,
      repeat: 0,
      properties: {
        opacity: [0, 1],
        width: { values: ['0px', '100px'], duration: 50, repeat: 1, yoyo: true },
      },
    });

    expect(animation.duration).toBe(100);
    animation.seek(75);
    expect(element.style.getPropertyValue('opacity')).toBe('0.75');
    expect(element.style.getPropertyValue('width')).toBe('50px');
    animation.dispose();
  });

  it('requires a duration for every property when no global duration is supplied', () => {
    const element = createElement({ opacity: '1' });
    expect(() => animate(element, { properties: { opacity: [0, 1] } })).toThrow(
      'requires a duration when animate() has no global duration',
    );
    expect(element.style.getPropertyValue('opacity')).toBe('1');
  });

  it('rejects invalid property timing before mutating any target', () => {
    const element = createElement({ opacity: '1' });
    expect(() => animate(element, {
      duration: 100,
      properties: { opacity: { values: [0, 1], duration: Number.NaN } },
    })).toThrow('duration for CSS property "opacity" must be a finite, non-negative number');
    expect(element.style.getPropertyValue('opacity')).toBe('1');
  });

  it('interpolates matching CSS templates and keeps incompatible values discrete', () => {
    expect(interpolateCssValue('translateX(0px)', 'translateX(100px)', 0.5)).toBe('translateX(50px)');
    expect(interpolateCssValue('rgb(0, 20, 40)', 'rgb(100, 120, 140)', 0.5)).toBe('rgb(50, 70, 90)');
    expect(interpolateCssValue('#000000', 'rgb(100, 120, 140)', 0.5)).toBe('rgba(50, 60, 70, 1)');
    expect(interpolateCssValue('auto', '100px', 0.5)).toBe('auto');
    expect(interpolateCssValue('auto', '100px', 1)).toBe('100px');
  });

  it('validates options before mutating any target', () => {
    const element = createElement({ opacity: '1' });
    const options: DOMAnimateOptions = { duration: -1, properties: { opacity: [1, 0] } };
    expect(() => animate(element, options)).toThrow('duration must be a finite, non-negative number');
    expect(element.style.getPropertyValue('opacity')).toBe('1');
  });

  it('rejects a non-finite stagger callback result and restores any earlier targets', () => {
    const first = createElement({ opacity: '1' });
    const second = createElement({ opacity: '1' });
    expect(() => animate([first, second], {
      duration: 100,
      properties: { opacity: [0, 1] },
      stagger: (index) => index === 0 ? 0 : Number.NaN,
    })).toThrow('stagger must return a finite number');
    expect(first.style.getPropertyValue('opacity')).toBe('1');
    expect(second.style.getPropertyValue('opacity')).toBe('1');
  });
});



describe('text and numeric animation helpers', () => {
  it('animates formatted numbers and restores the original child node on dispose', () => {
    const target = createTextElement('initial metric');
    const originalNodes = Array.from(target.childNodes);
    const animation = animateNumber(target, {
      from: 0,
      to: 100,
      duration: 100,
      easing: 'linear',
      format: (value) => `#${Math.round(value)}`,
    });
    animation.seek(50);
    expect(target.textContent).toBe('#50');
    animation.dispose();
    expect(target.textContent).toBe('initial metric');
    expect(Array.from(target.childNodes)).toEqual(originalNodes);
  });

  it('splits text accessibly and restores original markup and aria-label on dispose', () => {
    const target = createTextElement('Hello reactive world');
    target.setAttribute('aria-label', 'Custom label');
    const originalNodes = Array.from(target.childNodes);
    const animation = animateText(target, { splitBy: 'words', duration: 100, stagger: 10 });

    expect(target.getAttribute('aria-label')).toBe('Custom label');
    expect(target.textContent).toBe('Hello reactive world');
    expect(Array.from(target.childNodes).some((node) => (node as unknown as { nodeType: number }).nodeType === 1)).toBe(true);
    animation.seek(55);
    animation.dispose();

    expect(Array.from(target.childNodes)).toEqual(originalNodes);
    expect(target.getAttribute('aria-label')).toBe('Custom label');
    expect(target.textContent).toBe('Hello reactive world');
  });
});

describe('AnimationScope and scroll inputs', () => {
  it('reverts registered resources exactly once and refuses reuse', () => {
    const root = { querySelectorAll: () => [] } as unknown as ParentNode;
    const scope = createScope(root);
    const unsubscribe = jest.fn();
    scope.add({ unsubscribe });
    scope.revert();
    scope.revert();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(() => scope.add({ unsubscribe: jest.fn() })).toThrow('has been reverted');
  });

  it('reverts setup resources when scoped setup throws', () => {
    const root = { querySelectorAll: () => [] } as unknown as ParentNode;
    const unsubscribe = jest.fn();
    expect(() => createScope(root, (scope) => {
      scope.add({ unsubscribe });
      throw new Error('setup failed');
    })).toThrow('setup failed');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('reports a clear error when scrollProgress$ is used without a browser', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'window');
    let received: unknown;
    try {
      scrollProgress$({ getBoundingClientRect: () => ({ top: 0, height: 10 }) } as unknown as Element)
        .subscribe({ error: (error: unknown) => { received = error; } });
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    }
    expect(received).toBeInstanceOf(Error);
    expect((received as Error).message).toContain('browser environment');
  });


  it('scrubs a timeline through the shared frame coordinator and removes listeners on teardown', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const raf = new RafController();
    const listeners = new Map<string, EventListener>();
    const removeListener = jest.fn((type: string, _listener: EventListener) => { listeners.delete(type); });
    const windowStub = {
      innerHeight: 500,
      addEventListener: (type: string, listener: EventListener) => { listeners.set(type, listener); },
      removeEventListener: removeListener,
    };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowStub });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { clientHeight: 500 } } });
    raf.install();
    try {
      let sampledTime = 0;
      const timeline = new Timeline().add({
        duration: 100,
        seekLocal: (time) => { sampledTime = time; },
        resetInternal: () => { sampledTime = 0; },
      });
      const target = { getBoundingClientRect: () => ({ top: 100, height: 100 }) } as unknown as Element;
      const binding = bindScrollTimeline(target, timeline);
      raf.advance(16);

      expect(sampledTime).toBeCloseTo(100 * (400 / 600), 4);
      binding.unsubscribe();
      expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
      expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(removeListener).toHaveBeenCalledTimes(2);
      expect(raf.pendingCount).toBe(0);
    } finally {
      raf.uninstall();
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });
});


describe('responsive animation scopes', () => {
  it('creates and reverts resources as a media query changes', () => {
    let matches = true;
    let onChange: ((event: MediaQueryListEvent) => void) | undefined;
    const removed = jest.fn();
    const media = {
      get matches() { return matches; },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { onChange = listener; },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => { if (onChange === listener) onChange = undefined; removed(); },
    } as unknown as MediaQueryList;
    const windowRef = { matchMedia: () => media } as unknown as Window;
    const root = { querySelectorAll: () => [] } as unknown as ParentNode;
    const unsubscribe = jest.fn();
    const responsive = createResponsiveScope(root, '(min-width: 800px)', (scope) => { scope.add({ unsubscribe }); }, windowRef);

    expect(responsive.active).toBe(true);
    matches = false;
    onChange?.({ matches } as MediaQueryListEvent);
    expect(responsive.active).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    responsive.dispose();
    responsive.dispose();
    expect(removed).toHaveBeenCalledTimes(1);
  });
  it('supports explicit from/to frames and per-target frame factories', () => {
    const first = createElement({ opacity: '0.2' });
    const second = createElement({ opacity: '0.3' });
    const factory = jest.fn((_target: Element, index: number, total: number) => [
      `${index}`,
      `${total - index}`,
    ] as const);
    const animation = animate([first, second], {
      duration: 100,
      properties: {
        opacity: { from: 0, to: 1 },
        zIndex: factory,
      },
    });

    expect(factory).toHaveBeenCalledTimes(2);
    expect(factory.mock.calls.map(([target, index, total]) => [target, index, total])).toEqual([
      [first, 0, 2],
      [second, 1, 2],
    ]);
    animation.dispose();
  });

});
