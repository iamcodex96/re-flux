import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Timeline } from '../../src/core/Timeline.js';
import { Tween } from '../../src/values/Tween.js';
import { createScrollTrigger } from '../../src/adapters/dom/scrollTrigger.js';
import { RafController } from '../helpers/RafController.js';

const raf = new RafController();
let previousWindow: PropertyDescriptor | undefined;
let previousDocument: PropertyDescriptor | undefined;
let previousResizeObserver: PropertyDescriptor | undefined;
let fakeWindow: EventTarget & { innerHeight: number; scrollY: number; pageYOffset: number };
let fakeDocument: { documentElement: { clientHeight: number; scrollTop: number } };

function rect(top: number, height: number): DOMRect {
  return {
    x: 0, y: top, top, left: 0, right: 100, bottom: top + height, width: 100, height,
    toJSON: () => ({}),
  } as DOMRect;
}

function makeTarget(top: number, height: number): Element & { setRect: (top: number, height?: number) => void } {
  let current = rect(top, height);
  return {
    nodeType: 1,
    getBoundingClientRect: () => current,
    setRect: (nextTop: number, nextHeight: number = current.height) => { current = rect(nextTop, nextHeight); },
  } as unknown as Element & { setRect: (top: number, height?: number) => void };
}

function scrollTo(top: number, scrollY: number): void {
  const target = activeTarget;
  target?.setRect(top);
  fakeWindow.scrollY = scrollY;
  fakeWindow.pageYOffset = scrollY;
  fakeWindow.dispatchEvent(new Event('scroll'));
  raf.advance(scrollY);
}
let activeTarget: ReturnType<typeof makeTarget> | null = null;

beforeEach(() => {
  raf.install();
  previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  previousResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  fakeWindow = Object.assign(new EventTarget(), { innerHeight: 100, scrollY: 0, pageYOffset: 0 });
  fakeDocument = { documentElement: { clientHeight: 100, scrollTop: 0 } };
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument });
  Reflect.deleteProperty(globalThis, 'ResizeObserver');
  activeTarget = null;
});

afterEach(() => {
  activeTarget = null;
  raf.uninstall();
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
  else Reflect.deleteProperty(globalThis, 'document');
  if (previousResizeObserver) Object.defineProperty(globalThis, 'ResizeObserver', previousResizeObserver);
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  jest.restoreAllMocks();
});

describe('createScrollTrigger()', () => {
  it('emits normalized progress and directional callbacks in both scroll directions', () => {
    const target = makeTarget(120, 60);
    activeTarget = target;
    const onEnter = jest.fn();
    const onLeave = jest.fn();
    const onEnterBack = jest.fn();
    const onLeaveBack = jest.fn();
    const onToggle = jest.fn();
    const trigger = createScrollTrigger(target, { onEnter, onLeave, onEnterBack, onLeaveBack, onToggle, autoRefresh: false });

    expect(trigger.progress).toBe(0);
    expect(trigger.isActive).toBe(false);

    scrollTo(80, 40);
    expect(trigger.progress).toBeCloseTo(0.125);
    expect(trigger.isActive).toBe(true);
    expect(onEnter).toHaveBeenCalledTimes(1);

    scrollTo(-80, 200);
    expect(trigger.progress).toBe(1);
    expect(trigger.isActive).toBe(false);
    expect(onLeave).toHaveBeenCalledTimes(1);

    scrollTo(-20, 140);
    expect(trigger.progress).toBeCloseTo(0.75);
    expect(trigger.isActive).toBe(true);
    expect(onEnterBack).toHaveBeenCalledTimes(1);

    scrollTo(120, 0);
    expect(trigger.progress).toBe(0);
    expect(trigger.isActive).toBe(false);
    expect(onLeaveBack).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledTimes(4);

    trigger.destroy();
    expect(raf.pendingCount).toBe(0);
  });

  it('supports percentage anchors and pixel offsets in position strings', () => {
    const target = makeTarget(40, 60);
    const trigger = createScrollTrigger(target, {
      start: 'top 80%',
      end: 'bottom top-=20px',
      autoRefresh: false,
    });
    // start distance = 40 - 80 = -40; end distance = 100 - (-20) = 120.
    expect(trigger.progress).toBeCloseTo(0.25);
    trigger.destroy();
  });

  it('can scrub a Timeline and cancels queued work on destroy', () => {
    const target = makeTarget(80, 60);
    activeTarget = target;
    const tween = new Tween({ from: 0, to: 100, duration: 100 });
    const timeline = new Timeline().add(tween);
    const trigger = createScrollTrigger(target, { timeline, autoRefresh: false });

    expect(tween.value$.value).toBe(12.5);
    target.setRect(40);
    fakeWindow.scrollY = 40;
    fakeWindow.dispatchEvent(new Event('scroll'));
    trigger.destroy();
    expect(raf.pendingCount).toBe(0);
    raf.advance(100);
    expect(tween.value$.value).toBe(12.5);
  });

  it('measures against a nested scrolling element root', () => {
    let rootRect = rect(50, 100);
    const root = Object.assign(new EventTarget(), {
      nodeType: 1,
      clientTop: 2,
      clientHeight: 100,
      scrollTop: 0,
      getBoundingClientRect: () => rootRect,
    }) as unknown as HTMLElement & EventTarget;
    const target = makeTarget(170, 60);
    const trigger = createScrollTrigger(target, { root, autoRefresh: false });
    expect(trigger.progress).toBe(0);

    target.setRect(130);
    root.scrollTop = 40;
    root.dispatchEvent(new Event('scroll'));
    raf.advance(16);
    expect(trigger.progress).toBeCloseTo(0.1375);

    rootRect = rect(50, 120);
    trigger.refresh();
    expect(trigger.progress).toBeGreaterThan(0);
    trigger.destroy();
    expect(raf.pendingCount).toBe(0);
  });

  it('refreshes changed layout without emitting false enter/leave events', () => {
    const target = makeTarget(120, 60);
    const onEnter = jest.fn();
    const onLeave = jest.fn();
    const onRefresh = jest.fn();
    const trigger = createScrollTrigger(target, { onEnter, onLeave, onRefresh, autoRefresh: false });
    target.setRect(80);
    trigger.refresh();
    expect(trigger.progress).toBeCloseTo(0.125);
    expect(trigger.isActive).toBe(true);
    expect(onEnter).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledTimes(2); // initial measurement and explicit refresh
    trigger.unsubscribe();
    trigger.destroy();
  });

  it('rejects invalid positions and reversed trigger ranges before leaving listeners installed', () => {
    const target = makeTarget(20, 40);
    expect(() => createScrollTrigger(target, { start: 'middle bottom' })).toThrow('Invalid scroll trigger position');
    expect(() => createScrollTrigger(target, { start: 'bottom top', end: 'top bottom' })).toThrow('start must occur before end');
  });

  it('coalesces automatic resize refreshes and cancels pending frame work on destroy', () => {
    const target = makeTarget(120, 60);
    const onRefresh = jest.fn();
    const trigger = createScrollTrigger(target, { onRefresh });
    expect(onRefresh).toHaveBeenCalledTimes(1); // initial measurement

    fakeWindow.dispatchEvent(new Event('resize'));
    fakeWindow.dispatchEvent(new Event('resize'));
    expect(raf.pendingCount).toBe(1);
    raf.advance(16);
    expect(onRefresh).toHaveBeenCalledTimes(2);

    fakeWindow.dispatchEvent(new Event('resize'));
    expect(raf.pendingCount).toBe(1);
    trigger.destroy();
    expect(raf.pendingCount).toBe(0);
    raf.advance(32);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('completes the progress stream on destroy', () => {
    const target = makeTarget(120, 60);
    const completed = jest.fn();
    const trigger = createScrollTrigger(target, { autoRefresh: false });
    const subscription = trigger.progress$.subscribe({ complete: completed });
    trigger.destroy();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(subscription.closed).toBe(true);
  });
});
