/**
 * Minimal DOM fakes for adapter tests that run in the Jest `node` environment.
 * They implement only what the adapters touch; they are not a general DOM replacement.
 */

export function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

export function fakeStyle(initial: Record<string, string> = {}): CSSStyleDeclaration {
  const values = new Map(Object.entries(initial).map(([key, value]) => [kebab(key), value]));
  const priorities = new Map<string, string>();
  return {
    getPropertyValue: (name: string) => values.get(name) ?? '',
    getPropertyPriority: (name: string) => priorities.get(name) ?? '',
    setProperty: (name: string, value: string, priority = '') => { values.set(name, value); priorities.set(name, priority); },
    removeProperty: (name: string) => { const old = values.get(name) ?? ''; values.delete(name); priorities.delete(name); return old; },
  } as unknown as CSSStyleDeclaration;
}

export interface FakeRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Element with an inline style, a computed-style view and a mutable bounding rectangle. */
export function createElement(initial: Record<string, string> = {}, rect: () => FakeRect = () => ({ left: 0, top: 0, width: 0, height: 0 })): HTMLElement {
  const style = fakeStyle(initial);
  const computedValues = new Map(Object.entries(initial).map(([key, value]) => [kebab(key), value]));
  const view = {
    getComputedStyle: () => ({ getPropertyValue: (name: string) => computedValues.get(name) ?? style.getPropertyValue(name) }),
  };
  return {
    nodeType: 1,
    style,
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => rect(),
  } as unknown as HTMLElement;
}

type FakeNode = {
  nodeType: number;
  textContent: string;
  children?: FakeNode[];
  style?: CSSStyleDeclaration;
  dataset?: Record<string, string>;
  attributes?: Map<string, string>;
  append?: (node: FakeNode) => void;
  setAttribute?: (name: string, value: string) => void;
};

export interface FakeTextElement extends HTMLElement {
  readonly fakeChildren: readonly FakeNode[];
}

/** Text-bearing element supporting `replaceChildren`, `aria-label` and fragment creation. */
export function createTextElement(initialText: string, initialAttributes: Record<string, string> = {}): FakeTextElement {
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
  let children: FakeNode[] = initialText === '' ? [] : [makeText(initialText)];
  const attributes = new Map<string, string>(Object.entries(initialAttributes));
  const target = {
    nodeType: 1,
    ownerDocument: documentStub,
    style: fakeStyle(),
    get childNodes() { return children; },
    get fakeChildren() { return children; },
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
  return target as unknown as FakeTextElement;
}

/** Element that satisfies the draggable adapter's contract (events, pointer capture, attributes). */
export function createDraggableTarget(): HTMLElement {
  const ownerDocument = Object.assign(new EventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
    defaultView: new EventTarget(),
  });
  const attributes = new Map<string, string>();
  return Object.assign(new EventTarget(), {
    nodeType: 1,
    style: fakeStyle(),
    ownerDocument,
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => { attributes.set(name, value); },
    removeAttribute: (name: string) => { attributes.delete(name); },
    setPointerCapture: (_pointerId: number) => undefined,
    releasePointerCapture: (_pointerId: number) => undefined,
    hasPointerCapture: (_pointerId: number) => true,
  }) as unknown as HTMLElement;
}

/** Install `window`/`document` globals for code that checks `typeof window`. Returns a restore function. */
export function installBrowserGlobals(windowStub: Record<string, unknown> = {}, documentStub: Record<string, unknown> = {}): () => void {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: windowStub });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: documentStub });
  return () => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  };
}
