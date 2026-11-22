import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AnimationScope, createResponsiveScope, createScope } from '../../src/adapters/dom/scope.js';
import { createDraggableTarget, createElement, installBrowserGlobals } from '../helpers/fakeDom.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();
let restoreGlobals: (() => void) | null = null;

beforeEach(() => raf.install());
afterEach(() => {
  restoreGlobals?.();
  restoreGlobals = null;
  raf.uninstall();
  jest.restoreAllMocks();
});

function rootWith(matches: Record<string, HTMLElement[]>): ParentNode {
  return { querySelectorAll: (selector: string) => matches[selector] ?? [] } as unknown as ParentNode;
}

describe('Given an AnimationScope', () => {
  describe('When it animates a selector that resolves beneath its root', () => {
    it('Then it resolves only descendants of the root and reverts the animation on revert()', () => {
      const element = createElement({ opacity: '0.2' });
      const scope = new AnimationScope(rootWith({ '.item': [element] }));

      const animation = scope.animate('.item', { duration: 100, properties: { opacity: { values: [0, 1] } } });
      animation.seek(100);
      expect(element.style.getPropertyValue('opacity')).toBe('1');

      scope.revert();
      expect(element.style.getPropertyValue('opacity')).toBe('0.2');
    });

    it('Then a selector with no descendants throws a RangeError that names the selector', () => {
      const scope = new AnimationScope(rootWith({}));
      expect(() => scope.animate('.missing', { duration: 100, properties: { opacity: { values: [0, 1] } } }))
        .toThrow('AnimationScope selector did not match any descendants: .missing');
    });

    it('Then element targets bypass selector resolution', () => {
      const element = createElement({ opacity: '0.5' });
      const scope = new AnimationScope(rootWith({}));

      const animation = scope.animate(element, { duration: 100, properties: { opacity: { values: [0, 1] } } });
      animation.seek(50);

      expect(element.style.getPropertyValue('opacity')).toBe('0.5');
      scope.revert();
    });
  });

  describe('When it owns a FLIP transition', () => {
    it('Then flip() is tracked and reverted with the scope', () => {
      restoreGlobals = installBrowserGlobals({ getComputedStyle: () => ({ transform: 'none' }) }, {});
      let left = 0;
      const element = createElement({}, () => ({ left, top: 0, width: 10, height: 10 }));
      const scope = new AnimationScope(rootWith({ '.card': [element] }));

      scope.flip('.card', () => { left = 40; });
      expect(element.style.getPropertyValue('transform')).toBe('translate(-40px, 0px) scale(1, 1)');

      scope.revert();
      expect(element.style.getPropertyValue('transform')).toBe('');
    });
  });

  describe('When it owns a draggable', () => {
    it('Then the handle is disposed when the scope is reverted', () => {
      const target = createDraggableTarget();
      const scope = new AnimationScope(rootWith({}));

      const handle = scope.draggable(target);
      const dispose = jest.spyOn(handle, 'dispose');
      scope.revert();

      expect(dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('When custom resources are registered', () => {
    it('Then dispose() and unsubscribe() resources are released in reverse registration order', () => {
      const order: string[] = [];
      const scope = new AnimationScope(rootWith({}));
      scope.add({ dispose: () => order.push('first') });
      scope.add({ unsubscribe: () => order.push('second') });
      scope.add({ dispose: () => order.push('third') });

      scope.revert();

      expect(order).toEqual(['third', 'second', 'first']);
    });

    it('Then add() returns the resource it was given', () => {
      const scope = new AnimationScope(rootWith({}));
      const resource = { dispose: () => undefined };
      expect(scope.add(resource)).toBe(resource);
    });

    it('Then a failing resource does not stop the others and failures are aggregated', () => {
      const released: string[] = [];
      const scope = new AnimationScope(rootWith({}));
      scope.add({ dispose: () => released.push('ok-1') });
      scope.add({ dispose: () => { throw new Error('boom'); } });
      scope.add({ unsubscribe: () => released.push('ok-2') });

      let caught: unknown;
      try { scope.revert(); } catch (error) { caught = error; }

      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toHaveLength(1);
      expect(released.sort()).toEqual(['ok-1', 'ok-2']);
    });
  });

  describe('When it has been reverted', () => {
    it('Then revert() is idempotent and any new work is refused', () => {
      const scope = new AnimationScope(rootWith({}));
      scope.revert();

      expect(() => scope.revert()).not.toThrow();
      expect(() => scope.add({ dispose: () => undefined })).toThrow('This AnimationScope has been reverted');
      expect(() => scope.animate(createElement(), { duration: 1, properties: { opacity: [0, 1] } })).toThrow('has been reverted');
      expect(() => scope.flip(createElement(), () => undefined)).toThrow('has been reverted');
      expect(() => scope.draggable(createDraggableTarget())).toThrow('has been reverted');
    });
  });
});

describe('Given createScope()', () => {
  describe('When the setup callback registers resources and then throws', () => {
    it('Then the registered resources are reverted and the original error is rethrown', () => {
      const dispose = jest.fn();
      expect(() => createScope(rootWith({}), (scope) => {
        scope.add({ dispose });
        throw new Error('setup failed');
      })).toThrow('setup failed');
      expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('Then a failing revert does not mask the setup error', () => {
      expect(() => createScope(rootWith({}), (scope) => {
        scope.add({ dispose: () => { throw new Error('revert failed'); } });
        throw new Error('setup failed');
      })).toThrow('setup failed');
    });
  });

  describe('When no setup callback is supplied', () => {
    it('Then it returns an empty usable scope', () => {
      const scope = createScope(rootWith({}));
      expect(scope).toBeInstanceOf(AnimationScope);
      expect(scope.root).toBeDefined();
    });
  });
});

interface FakeMedia {
  matches: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

function fakeWindow(media: FakeMedia): Window {
  return { matchMedia: () => media } as unknown as Window;
}

describe('Given createResponsiveScope()', () => {
  describe('When the media query matches and later stops matching', () => {
    it('Then the scope is created, reverted on change, and removed on dispose()', () => {
      let listener: (() => void) | null = null;
      const media: FakeMedia = {
        matches: true,
        addEventListener: (_type, next) => { listener = next; },
        removeEventListener: jest.fn(),
      };
      const setup = jest.fn();
      const controller = createResponsiveScope(rootWith({}), '(min-width: 600px)', setup, fakeWindow(media));

      expect(controller.active).toBe(true);
      expect(setup).toHaveBeenCalledTimes(1);

      media.matches = false;
      listener!();
      expect(controller.active).toBe(false);

      media.matches = true;
      controller.refresh();
      expect(controller.active).toBe(true);
      expect(setup).toHaveBeenCalledTimes(2);

      controller.dispose();
      expect(controller.active).toBe(false);
      expect(media.removeEventListener).toHaveBeenCalledTimes(1);
      controller.dispose();
      controller.refresh();
      expect(setup).toHaveBeenCalledTimes(2);
    });
  });

  describe('When the browser only supports the legacy addListener API', () => {
    it('Then it subscribes and unsubscribes through addListener/removeListener', () => {
      const media: FakeMedia = { matches: false, addListener: jest.fn(), removeListener: jest.fn() };
      const controller = createResponsiveScope(rootWith({}), '(min-width: 600px)', () => undefined, fakeWindow(media));

      expect(controller.active).toBe(false);
      expect(media.addListener).toHaveBeenCalledTimes(1);
      controller.dispose();
      expect(media.removeListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('When the input is invalid', () => {
    it('Then an empty query throws a TypeError', () => {
      expect(() => createResponsiveScope(rootWith({}), '   ', () => undefined, fakeWindow({ matches: true }))).toThrow(TypeError);
    });

    it('Then it throws when no browser window is available', () => {
      expect(() => createResponsiveScope(rootWith({}), '(min-width: 1px)', () => undefined)).toThrow('requires a browser window');
    });
  });
});
