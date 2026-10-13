import { BehaviorSubject, type Observable, type Subscription } from 'rxjs';
import { frameCoordinator } from '../../core/FrameCoordinator.js';
import type { Timeline } from '../../core/Timeline.js';
import { resolveEasing } from '../../utils/easings.js';
import type { EasingOption } from '../../types.js';
import type { ScrollProgressOptions } from './scroll.js';

export type ScrollTriggerTargetAnchor = 'top' | 'center' | 'bottom';
export type ScrollTriggerRootAnchor = ScrollTriggerTargetAnchor | `${number}%` | `${number}px`;
export type ScrollTriggerDirection = 'forward' | 'backward' | 'none';

/** A programmatic trigger position. Offsets are measured in CSS pixels. */
export interface ScrollTriggerPositionConfig {
  /** Point on the target element. Defaults to `top`. */
  readonly target?: ScrollTriggerTargetAnchor;
  /** Point inside the scroll root. Defaults to `bottom` for start and `top` for end. */
  readonly root?: ScrollTriggerRootAnchor;
  /** CSS-pixel offset added to the target point. */
  readonly offset?: number;
  /** CSS-pixel offset added to the root point. */
  readonly rootOffset?: number;
}

/** Positions also accept strings such as `top bottom`, `top 80%`, or `bottom-=40px center`. */
export type ScrollTriggerPosition = string | ScrollTriggerPositionConfig;

export interface ScrollTriggerEvent {
  readonly target: Element;
  readonly progress: number;
  readonly isActive: boolean;
  readonly direction: ScrollTriggerDirection;
  readonly scrollPosition: number;
}

export interface ScrollTriggerOptions extends ScrollProgressOptions {
  /** When the trigger starts. Defaults to `top bottom`. */
  readonly start?: ScrollTriggerPosition;
  /** When the trigger completes. Defaults to `bottom top`. */
  readonly end?: ScrollTriggerPosition;
  /** Optional timeline whose playhead is scrubbed to the trigger progress. */
  readonly timeline?: Timeline;
  /** Easing applied to the timeline progress when `timeline` is supplied. */
  readonly easing?: EasingOption;
  /** Observe target/root size changes and automatically refresh measurements. Defaults to true. */
  readonly autoRefresh?: boolean;
  readonly onEnter?: (event: ScrollTriggerEvent) => void;
  readonly onLeave?: (event: ScrollTriggerEvent) => void;
  readonly onEnterBack?: (event: ScrollTriggerEvent) => void;
  readonly onLeaveBack?: (event: ScrollTriggerEvent) => void;
  readonly onToggle?: (event: ScrollTriggerEvent) => void;
  readonly onUpdate?: (event: ScrollTriggerEvent) => void;
  readonly onRefresh?: (event: ScrollTriggerEvent) => void;
}

export interface ScrollTriggerController {
  /** Read-only stream of normalized progress. */
  readonly progress$: Observable<number>;
  readonly progress: number;
  readonly isActive: boolean;
  /** Re-measure positions after application-driven layout changes; does not emit enter/leave callbacks. */
  refresh(): this;
  /** Remove listeners, observers, queued frame work and complete progress$. Safe to call repeatedly. */
  destroy(): void;
  /** Alias for destroy(), useful when managed alongside RxJS subscriptions. */
  unsubscribe(): void;
}

interface ParsedPosition {
  readonly target: ScrollTriggerTargetAnchor;
  readonly targetOffset: number;
  readonly root: ScrollTriggerRootAnchor;
  readonly rootOffset: number;
}

interface Measurement {
  readonly progress: number;
  readonly active: boolean;
  readonly startDistance: number;
  readonly endDistance: number;
  readonly scrollPosition: number;
}

const POSITION_NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const TARGET_TOKEN = new RegExp(`^(top|center|bottom)(?:(\\+=|-=)(${POSITION_NUMBER})(?:px)?)?$`);
const ROOT_TOKEN = new RegExp(`^(top|center|bottom|${POSITION_NUMBER}%|${POSITION_NUMBER}px)(?:(\\+=|-=)(${POSITION_NUMBER})(?:px)?)?$`);

/**
 * Create a scroll trigger with normalized progress and directional enter/leave callbacks.
 * Scroll work is coalesced through the shared frame coordinator. Strings use the form
 * `target-anchor root-anchor`, e.g. `top 80%` or `bottom top-=60px`.
 */
export function createScrollTrigger(target: Element, options: ScrollTriggerOptions = {}): ScrollTriggerController {
  if (typeof window === 'undefined') throw new Error('createScrollTrigger() requires a browser environment.');
  return new ScrollTriggerInstance(target, options);
}

class ScrollTriggerInstance implements ScrollTriggerController {
  private readonly root: Window | HTMLElement;
  private readonly start: ParsedPosition;
  private readonly end: ParsedPosition;
  private readonly subject = new BehaviorSubject(0);
  private readonly easing: (progress: number) => number;
  private readonly scrollTarget: Window | HTMLElement;
  private readonly rootWindow: Window | null;
  private readonly autoRefresh: boolean;
  private resizeObserver: ResizeObserver | null = null;
  private pendingRead: Subscription | null = null;
  private pendingWrite: Subscription | null = null;
  private previous: Measurement | null = null;
  private activeValue = false;
  private destroyed = false;

  readonly progress$: Observable<number> = this.subject.asObservable();

  private readonly onScroll = (): void => this.scheduleUpdate(true);
  private readonly onResize = (): void => this.scheduleUpdate(false);

  constructor(private readonly target: Element, private readonly options: ScrollTriggerOptions) {
    this.root = options.root ?? window;
    this.scrollTarget = this.root;
    this.rootWindow = isWindowRoot(this.root) ? this.root as Window : null;
    this.start = parsePosition(options.start ?? 'top bottom', { target: 'top', root: 'bottom' });
    this.end = parsePosition(options.end ?? 'bottom top', { target: 'bottom', root: 'top' });
    this.easing = resolveEasing(options.easing ?? 'linear');
    this.autoRefresh = options.autoRefresh ?? true;

    this.scrollTarget.addEventListener('scroll', this.onScroll, { passive: true });
    if (this.autoRefresh) {
      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('orientationchange', this.onResize, { passive: true });
      if (this.rootWindow && this.rootWindow !== window) {
        this.rootWindow.addEventListener('resize', this.onResize, { passive: true });
        this.rootWindow.addEventListener('orientationchange', this.onResize, { passive: true });
      }
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.scheduleUpdate(false));
        this.resizeObserver.observe(target);
        if (!this.rootWindow) this.resizeObserver.observe(this.root as HTMLElement);
      }
    }

    try {
      const initial = this.measure();
      this.ensureValidRange(initial);
      this.previous = initial;
      this.activeValue = initial.active;
      this.subject.next(initial.progress);
      this.syncTimeline(initial.progress);
      const event = this.event(initial, 'none', initial.active);
      if (initial.active) {
        options.onEnter?.(event);
        options.onToggle?.(event);
      }
      options.onUpdate?.(event);
      options.onRefresh?.(event);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  get progress(): number { return this.subject.value; }
  get isActive(): boolean { return this.activeValue; }

  refresh(): this {
    if (this.destroyed) return this;
    this.cancelPending();
    const measurement = this.measure();
    this.ensureValidRange(measurement);
    // Refresh rebases the geometry after layout changes without generating false scroll events.
    this.previous = measurement;
    this.activeValue = measurement.active;
    this.subject.next(measurement.progress);
    this.syncTimeline(measurement.progress);
    const event = this.event(measurement, 'none', measurement.active);
    this.options.onUpdate?.(event);
    this.options.onRefresh?.(event);
    return this;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPending();
    this.scrollTarget.removeEventListener('scroll', this.onScroll);
    if (this.autoRefresh) {
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('orientationchange', this.onResize);
      if (this.rootWindow && this.rootWindow !== window) {
        this.rootWindow.removeEventListener('resize', this.onResize);
        this.rootWindow.removeEventListener('orientationchange', this.onResize);
      }
    }
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.subject.complete();
  }

  unsubscribe(): void { this.destroy(); }

  private scheduleUpdate(fromScrollEvent: boolean): void {
    if (this.destroyed || this.pendingRead || this.pendingWrite) return;
    this.pendingRead = frameCoordinator.scheduleRead(() => {
      this.pendingRead = null;
      if (this.destroyed) return;
      let measurement: Measurement;
      try {
        measurement = this.measure();
        this.ensureValidRange(measurement);
      } catch (error) {
        this.destroy();
        queueMicrotask(() => { throw error; });
        return;
      }
      this.pendingWrite = frameCoordinator.scheduleWrite(() => {
        this.pendingWrite = null;
        if (this.destroyed) return;
        const previous = this.previous;
        const direction = fromScrollEvent && previous
          ? directionBetween(previous.scrollPosition, measurement.scrollPosition)
          : 'none';
        this.apply(measurement, direction, true);
        if (!fromScrollEvent) this.options.onRefresh?.(this.event(measurement, 'none', measurement.active));
      });
    });
  }

  private apply(measurement: Measurement, direction: ScrollTriggerDirection, emitTransitions: boolean): void {
    const previous = this.previous;
    if (emitTransitions && previous && direction !== 'none') {
      if (direction === 'forward') {
        if (previous.startDistance > 0 && measurement.startDistance <= 0) {
          this.emitTransition(this.options.onEnter, measurement, direction, 0, true);
        }
        if (previous.endDistance > 0 && measurement.endDistance <= 0) {
          this.emitTransition(this.options.onLeave, measurement, direction, 1, false);
        }
      } else {
        if (previous.endDistance <= 0 && measurement.endDistance > 0) {
          this.emitTransition(this.options.onEnterBack, measurement, direction, 1, true);
        }
        if (previous.startDistance <= 0 && measurement.startDistance > 0) {
          this.emitTransition(this.options.onLeaveBack, measurement, direction, 0, false);
        }
      }
    }

    this.previous = measurement;
    this.activeValue = measurement.active;
    this.subject.next(measurement.progress);
    this.syncTimeline(measurement.progress);
    this.options.onUpdate?.(this.event(measurement, direction, measurement.active));
  }

  private emitTransition(
    callback: ((event: ScrollTriggerEvent) => void) | undefined,
    measurement: Measurement,
    direction: ScrollTriggerDirection,
    progress: number,
    active: boolean,
  ): void {
    const event = this.event(measurement, direction, active, progress);
    callback?.(event);
    if (active !== this.activeValue) {
      this.activeValue = active;
      this.options.onToggle?.(event);
    }
  }

  private event(measurement: Measurement, direction: ScrollTriggerDirection, active: boolean, progress = measurement.progress): ScrollTriggerEvent {
    return Object.freeze({
      target: this.target,
      progress,
      isActive: active,
      direction,
      scrollPosition: measurement.scrollPosition,
    });
  }

  private syncTimeline(progress: number): void {
    this.options.timeline?.seekProgress(Math.max(0, Math.min(1, this.easing(progress))));
  }

  private measure(): Measurement {
    const rect = this.target.getBoundingClientRect();
    let rootTop: number;
    let rootHeight: number;
    let scrollPosition: number;
    if (this.rootWindow) {
      const rootWindow = this.rootWindow;
      const rootDocument = rootWindow.document ?? document;
      rootTop = 0;
      rootHeight = rootWindow.innerHeight || rootDocument.documentElement.clientHeight;
      scrollPosition = rootWindow.scrollY || rootWindow.pageYOffset || rootDocument.documentElement.scrollTop || 0;
    } else {
      const elementRoot = this.root as HTMLElement;
      const rootRect = elementRoot.getBoundingClientRect();
      rootTop = rootRect.top + elementRoot.clientTop;
      rootHeight = elementRoot.clientHeight;
      scrollPosition = elementRoot.scrollTop;
    }

    const startDistance = anchorCoordinate(rect, this.start.target)
      - (rootTop + rootAnchorCoordinate(rootHeight, this.start.root))
      + this.start.targetOffset - this.start.rootOffset;
    const endDistance = anchorCoordinate(rect, this.end.target)
      - (rootTop + rootAnchorCoordinate(rootHeight, this.end.root))
      + this.end.targetOffset - this.end.rootOffset;
    const range = endDistance - startDistance;
    const progress = range > Number.EPSILON
      ? clamp01(-startDistance / range)
      : (startDistance <= 0 ? 1 : 0);

    return Object.freeze({
      progress,
      active: startDistance <= 0 && endDistance > 0,
      startDistance,
      endDistance,
      scrollPosition,
    });
  }

  private ensureValidRange(measurement: Measurement): void {
    if (measurement.endDistance - measurement.startDistance <= Number.EPSILON) {
      throw new RangeError('createScrollTrigger() start must occur before end. Check the target/root anchors and offsets.');
    }
  }

  private cancelPending(): void {
    this.pendingRead?.unsubscribe();
    this.pendingRead = null;
    this.pendingWrite?.unsubscribe();
    this.pendingWrite = null;
  }
}

function directionBetween(previous: number, current: number): ScrollTriggerDirection {
  if (current > previous) return 'forward';
  if (current < previous) return 'backward';
  return 'none';
}

function anchorCoordinate(rect: DOMRect, anchor: ScrollTriggerTargetAnchor): number {
  if (anchor === 'top') return rect.top;
  if (anchor === 'center') return rect.top + rect.height / 2;
  return rect.bottom;
}

function rootAnchorCoordinate(height: number, anchor: ScrollTriggerRootAnchor): number {
  if (anchor === 'top') return 0;
  if (anchor === 'center') return height / 2;
  if (anchor === 'bottom') return height;
  if (anchor.endsWith('%')) return height * Number(anchor.slice(0, -1)) / 100;
  return Number(anchor.slice(0, -2));
}

function clamp01(value: number): number { return Math.min(1, Math.max(0, value)); }

function parsePosition(value: ScrollTriggerPosition, fallback: { target: ScrollTriggerTargetAnchor; root: ScrollTriggerRootAnchor }): ParsedPosition {
  if (typeof value !== 'string') {
    const target = value.target ?? fallback.target;
    const root = value.root ?? fallback.root;
    const offset = value.offset ?? 0;
    const rootOffset = value.rootOffset ?? 0;
    validateOffset(offset, 'target offset');
    validateOffset(rootOffset, 'root offset');
    validateScrollTriggerTargetAnchor(target);
    validateScrollTriggerRootAnchor(root);
    return Object.freeze({ target, root, targetOffset: offset, rootOffset });
  }

  const tokens = value.trim().split(/\s+/);
  if (tokens.length !== 2) {
    throw new TypeError(`Invalid scroll trigger position "${value}". Use "target-anchor root-anchor", e.g. "top 80%".`);
  }
  const targetMatch = TARGET_TOKEN.exec(tokens[0]!);
  const rootMatch = ROOT_TOKEN.exec(tokens[1]!);
  if (!targetMatch || !rootMatch) {
    throw new TypeError(`Invalid scroll trigger position "${value}". Supported anchors are top, center, bottom, percentages and pixel values.`);
  }
  const target = targetMatch[1] as ScrollTriggerTargetAnchor;
  const targetOffset = offsetFromMatch(targetMatch[2], targetMatch[3]);
  const root = rootMatch[1] as ScrollTriggerRootAnchor;
  const rootOffset = offsetFromMatch(rootMatch[2], rootMatch[3]);
  return Object.freeze({ target, targetOffset, root, rootOffset });
}

function offsetFromMatch(operator: string | undefined, amount: string | undefined): number {
  if (!operator || amount === undefined) return 0;
  const value = Number(amount);
  validateOffset(value, 'position offset');
  return operator === '+=' ? value : -value;
}

function validateOffset(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`Scroll trigger ${name} must be finite.`);
}

function validateScrollTriggerTargetAnchor(value: string): asserts value is ScrollTriggerTargetAnchor {
  if (value !== 'top' && value !== 'center' && value !== 'bottom') {
    throw new TypeError(`Unsupported target anchor "${value}".`);
  }
}

function validateScrollTriggerRootAnchor(value: string): asserts value is ScrollTriggerRootAnchor {
  if (value === 'top' || value === 'center' || value === 'bottom') return;
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value) || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)px$/.test(value)) return;
  throw new TypeError(`Unsupported root anchor "${value}". Use top, center, bottom, a percentage, or a pixel coordinate.`);
}

function isWindowRoot(root: Window | HTMLElement): root is Window {
  return root === window || ('innerHeight' in root && 'scrollY' in root && 'document' in root);
}
