import { Subject, type Subscription } from 'rxjs';
import { bindCanvas, resizeCanvas } from '../../src/adapters/canvas.js';
import { bindStyle } from '../../src/adapters/dom/styleBinding.js';
import type { CssStyleMap } from '../../src/adapters/dom/animationTypes.js';
import { animate } from '../../src/adapters/dom/animation.js';
import { flip } from '../../src/adapters/dom/layout.js';
import { bindSvgAttributes, type SvgAttributeMap } from '../../src/adapters/svg.js';
import { frameCoordinator } from '../../src/core/FrameCoordinator.js';
import { Animation } from '../../src/core/Animation.js';
import { MotionPreferences } from '../../src/core/MotionPreferences.js';
import { pointerGestures$ } from '../../src/operators/gestures.js';

interface PointerEventRecord {
  readonly type: string;
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
}

interface PointerState {
  readonly events: readonly PointerEventRecord[];
  readonly completed: boolean;
  readonly error: string | null;
}

interface FlipMeasurement {
  readonly beforeLeft: number;
  readonly afterMutationLeft: number;
  readonly invertedLeft: number;
  readonly invertedTransform: string;
  readonly invertedOrigin: string;
}

interface ReadWriteOrder {
  readonly elements: number;
  readonly reads: number;
  readonly writes: number;
  /** Reads (bounding rectangles, computed styles) that happened after the first inline-style write. */
  readonly readsAfterFirstWrite: number;
}

interface CanvasState {
  readonly draws: number;
  readonly pixel: readonly number[];
  readonly coordinator: ReturnType<typeof frameCoordinator.getDiagnostics>;
}

interface MotionStartOptions {
  readonly reducedMotion?: 'finish' | 'ignore';
  readonly pauseWhenHidden?: boolean;
  readonly includeUnmanaged?: boolean;
}

interface MotionCallbackCounts {
  starts: number;
  pauses: number;
  resumes: number;
  completes: number;
}

interface MotionAnimationState {
  readonly state: string | null;
  readonly progress: number | null;
  readonly callbacks: MotionCallbackCounts;
  readonly preferences: { readonly reducedMotion: boolean; readonly visible: boolean } | null;
  readonly unmanagedState: string | null;
  readonly unmanagedProgress: number | null;
}

interface BrowserContractApi {
  startPointerGestures(): void;
  pointerState(): PointerState;
  stopPointerGestures(): void;
  startStyleBinding(): void;
  emitStyles(styles: CssStyleMap): void;
  styleState(): { opacity: string; opacityPriority: string; transform: string; color: string };
  stopStyleBinding(): void;
  startSvgBinding(): void;
  emitSvgAttributes(attributes: SvgAttributeMap): void;
  svgState(): { fill: string | null; cx: string | null; r: string | null };
  stopSvgBinding(): void;
  runFlip(): FlipMeasurement;
  disposeFlip(): { left: string; transform: string; transformOrigin: string };
  recordReadWriteOrder(operation: 'flip' | 'animate-implicit', count: number): ReadWriteOrder;
  buildLayoutGrid(count: number): void;
  runGridFlip(): void;
  runNestedFlip(): { parent: string; child: string };
  runGridImplicitAnimate(): void;
  disposeGrid(): void;
  startCanvasBinding(): void;
  emitCanvasColor(color: string): void;
  canvasState(): CanvasState;
  stopCanvasBinding(): void;
  startMotionAnimations(options?: MotionStartOptions): void;
  motionAnimationState(): MotionAnimationState;
  explicitlyPauseMotionAnimation(): void;
  setDocumentVisibility(visible: boolean): void;
  stopMotionAnimations(): void;
}

declare global {
  interface Window {
    __reFluxBrowserTest: BrowserContractApi;
  }
}

const requiredElement = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Browser integration fixture is missing ${selector}.`);
  return element;
};

const gestureTarget = requiredElement<HTMLElement>('#gesture-target');
const styleTarget = requiredElement<HTMLElement>('#style-target');
const svgTarget = requiredElement<SVGCircleElement>('#svg-target');
const flipTarget = requiredElement<HTMLElement>('#flip-target');
const canvasTarget = requiredElement<HTMLCanvasElement>('#canvas-target');

let pointerSubscription: Subscription | null = null;
let pointerEvents: PointerEventRecord[] = [];
let pointerCompleted = false;
let pointerError: string | null = null;

const styleValues = new Subject<CssStyleMap>();
let styleSubscription: Subscription | null = null;

const svgValues = new Subject<SvgAttributeMap>();
let svgSubscription: Subscription | null = null;

let flipAnimation: ReturnType<typeof flip> | null = null;

const layoutGrid = document.createElement('div');
layoutGrid.style.cssText = 'display: flex; flex-wrap: wrap; width: 600px;';
document.body.append(layoutGrid);
let gridAnimation: ReturnType<typeof flip> | null = null;

const gridBoxes = (): HTMLElement[] => Array.from(layoutGrid.children) as HTMLElement[];

const canvasValues = new Subject<string>();
let canvasSubscription: Subscription | null = null;
let canvasDraws = 0;

let motionPreferences: MotionPreferences | null = null;
let motionAnimation: Animation | null = null;
let unmanagedMotionAnimation: Animation | null = null;
let motionCallbacks: MotionCallbackCounts = { starts: 0, pauses: 0, resumes: 0, completes: 0 };
let simulatedVisibility: boolean | null = null;
let originalVisibilityDescriptor: PropertyDescriptor | undefined;

/** Layout-affecting mutation for the FLIP cases: widening the container reflows every box. */
const widenGrid = (): void => {
  layoutGrid.style.width = '900px';
};

/** Fill the layout grid with `count` fixed-size boxes in a wrapping flex container and flush layout. */
function probeGrid(count: number): void {
  layoutGrid.style.width = '600px';
  layoutGrid.replaceChildren(
    ...Array.from({ length: count }, () => {
      const box = document.createElement('div');
      box.style.cssText = 'width: 20px; height: 20px; margin: 2px; flex: none; opacity: 1;';
      return box;
    }),
  );
  void document.body.offsetHeight;
}

window.__reFluxBrowserTest = {
  startPointerGestures(): void {
    pointerSubscription?.unsubscribe();
    pointerEvents = [];
    pointerCompleted = false;
    pointerError = null;
    pointerSubscription = pointerGestures$(gestureTarget).subscribe({
      next: (event) =>
        pointerEvents.push({
          type: event.type,
          pointerId: event.pointerId,
          x: event.x,
          y: event.y,
        }),
      error: (error: unknown) => {
        pointerError = error instanceof Error ? error.message : String(error);
      },
      complete: () => {
        pointerCompleted = true;
      },
    });
  },

  pointerState(): PointerState {
    return { events: pointerEvents, completed: pointerCompleted, error: pointerError };
  },

  stopPointerGestures(): void {
    pointerSubscription?.unsubscribe();
    pointerSubscription = null;
  },

  startStyleBinding(): void {
    styleSubscription?.unsubscribe();
    styleSubscription = bindStyle(styleTarget, styleValues);
  },

  emitStyles(styles: CssStyleMap): void {
    styleValues.next(styles);
  },

  styleState() {
    return {
      opacity: styleTarget.style.getPropertyValue('opacity'),
      opacityPriority: styleTarget.style.getPropertyPriority('opacity'),
      transform: styleTarget.style.getPropertyValue('transform'),
      color: styleTarget.style.getPropertyValue('color'),
    };
  },

  stopStyleBinding(): void {
    styleSubscription?.unsubscribe();
    styleSubscription = null;
  },

  startSvgBinding(): void {
    svgSubscription?.unsubscribe();
    svgSubscription = bindSvgAttributes(svgTarget, svgValues);
  },

  emitSvgAttributes(attributes: SvgAttributeMap): void {
    svgValues.next(attributes);
  },

  svgState() {
    return {
      fill: svgTarget.getAttribute('fill'),
      cx: svgTarget.getAttribute('cx'),
      r: svgTarget.getAttribute('r'),
    };
  },

  stopSvgBinding(): void {
    svgSubscription?.unsubscribe();
    svgSubscription = null;
  },

  runFlip(): FlipMeasurement {
    flipAnimation?.dispose();
    const beforeLeft = flipTarget.getBoundingClientRect().left;
    flipAnimation = flip(
      flipTarget,
      () => {
        flipTarget.style.left = '180px';
      },
      { duration: 500 },
    );
    flipAnimation.seek(0);
    return {
      beforeLeft,
      afterMutationLeft: Number.parseFloat(flipTarget.style.left),
      invertedLeft: flipTarget.getBoundingClientRect().left,
      invertedTransform: flipTarget.style.transform,
      invertedOrigin: flipTarget.style.transformOrigin,
    };
  },

  disposeFlip() {
    flipAnimation?.dispose();
    flipAnimation = null;
    return {
      left: flipTarget.style.left,
      transform: flipTarget.style.transform,
      transformOrigin: flipTarget.style.transformOrigin,
    };
  },

  recordReadWriteOrder(operation, count) {
    probeGrid(count);
    const events: Array<'read' | 'write'> = [];
    const originalRect = Element.prototype.getBoundingClientRect;
    const originalComputed = window.getComputedStyle;
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      events.push('read');
      return originalRect.call(this);
    };
    window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
      events.push('read');
      return originalComputed.call(window, element, pseudo);
    }) as typeof window.getComputedStyle;
    CSSStyleDeclaration.prototype.setProperty = function (
      this: CSSStyleDeclaration,
      ...args: [string, string | null, string?]
    ) {
      events.push('write');
      return originalSetProperty.apply(this, args);
    };
    let animation: ReturnType<typeof flip> | null = null;
    try {
      animation =
        operation === 'flip'
          ? flip(gridBoxes(), widenGrid, { duration: 200 })
          : animate(gridBoxes(), { duration: 200, properties: { opacity: 0.4, 'margin-left': 6 } });
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
      window.getComputedStyle = originalComputed;
      CSSStyleDeclaration.prototype.setProperty = originalSetProperty;
      animation?.dispose();
      layoutGrid.replaceChildren();
    }
    const firstWrite = events.indexOf('write');
    return {
      elements: count,
      reads: events.filter((event) => event === 'read').length,
      writes: events.filter((event) => event === 'write').length,
      readsAfterFirstWrite: firstWrite === -1 ? 0 : events.slice(firstWrite).filter((event) => event === 'read').length,
    };
  },

  buildLayoutGrid(count) {
    probeGrid(count);
  },

  runGridFlip() {
    gridAnimation?.dispose();
    gridAnimation = flip(gridBoxes(), widenGrid, { duration: 200 });
  },

  runNestedFlip() {
    layoutGrid.replaceChildren();
    const parent = document.createElement('div');
    parent.style.cssText = 'position: absolute; left: 10px; top: 10px; width: 100px; height: 100px;';
    const child = document.createElement('div');
    child.style.cssText = 'position: absolute; left: 5px; top: 5px; width: 20px; height: 20px;';
    parent.append(child);
    layoutGrid.append(parent);
    const animation = flip(
      [parent, child],
      () => {
        parent.style.left = '110px';
      },
      { duration: 200 },
    );
    const result = { parent: parent.style.transform, child: child.style.transform };
    animation.dispose();
    layoutGrid.replaceChildren();
    return result;
  },

  runGridImplicitAnimate() {
    gridAnimation?.dispose();
    gridAnimation = animate(gridBoxes(), { duration: 200, properties: { opacity: 0.4, 'margin-left': 6 } });
  },

  disposeGrid() {
    gridAnimation?.dispose();
    gridAnimation = null;
    layoutGrid.replaceChildren();
  },

  startCanvasBinding(): void {
    canvasSubscription?.unsubscribe();
    const { context } = resizeCanvas(canvasTarget, { width: 16, height: 16, pixelRatio: 1 });
    canvasDraws = 0;
    canvasSubscription = bindCanvas(
      context,
      canvasValues,
      (drawingContext, color) => {
        canvasDraws += 1;
        drawingContext.fillStyle = color;
        drawingContext.fillRect(0, 0, 16, 16);
      },
      { clearOnUnsubscribe: true },
    );
  },

  emitCanvasColor(color: string): void {
    canvasValues.next(color);
  },

  canvasState(): CanvasState {
    const context = canvasTarget.getContext('2d');
    if (!context) throw new Error('Browser integration fixture could not obtain a Canvas 2D context.');
    return {
      draws: canvasDraws,
      pixel: [...context.getImageData(0, 0, 1, 1).data],
      coordinator: frameCoordinator.getDiagnostics(),
    };
  },

  stopCanvasBinding(): void {
    canvasSubscription?.unsubscribe();
    canvasSubscription = null;
  },

  startMotionAnimations(options: MotionStartOptions = {}): void {
    this.stopMotionAnimations();
    motionCallbacks = { starts: 0, pauses: 0, resumes: 0, completes: 0 };
    motionPreferences = new MotionPreferences();

    const motionOptions = {
      preferences: motionPreferences,
      ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
      ...(options.pauseWhenHidden ? { pauseWhenHidden: true } : {}),
    };
    motionAnimation = new Animation({
      duration: 60_000,
      motion: motionOptions,
      onStart: () => {
        motionCallbacks.starts += 1;
      },
      onPause: () => {
        motionCallbacks.pauses += 1;
      },
      onResume: () => {
        motionCallbacks.resumes += 1;
      },
      onComplete: () => {
        motionCallbacks.completes += 1;
      },
    });
    void motionAnimation.catch(() => undefined);

    if (options.includeUnmanaged) {
      unmanagedMotionAnimation = new Animation({ duration: 60_000 });
      void unmanagedMotionAnimation.catch(() => undefined);
    }

    motionAnimation.play();
    unmanagedMotionAnimation?.play();
  },

  motionAnimationState(): MotionAnimationState {
    const snapshot = motionPreferences?.snapshot ?? null;
    return {
      state: motionAnimation?.state$.value ?? null,
      progress: motionAnimation?.progress$.value ?? null,
      callbacks: { ...motionCallbacks },
      preferences: snapshot ? { reducedMotion: snapshot.reducedMotion, visible: snapshot.visible } : null,
      unmanagedState: unmanagedMotionAnimation?.state$.value ?? null,
      unmanagedProgress: unmanagedMotionAnimation?.progress$.value ?? null,
    };
  },

  explicitlyPauseMotionAnimation(): void {
    motionAnimation?.pause();
  },

  setDocumentVisibility(visible: boolean): void {
    if (simulatedVisibility === null) {
      originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    }
    simulatedVisibility = visible;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (simulatedVisibility ? 'visible' : 'hidden'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  },

  stopMotionAnimations(): void {
    motionAnimation?.stop();
    unmanagedMotionAnimation?.stop();
    motionAnimation = null;
    unmanagedMotionAnimation = null;
    motionPreferences?.destroy();
    motionPreferences = null;
    if (simulatedVisibility !== null) {
      if (originalVisibilityDescriptor) {
        Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
      } else {
        Reflect.deleteProperty(document, 'visibilityState');
      }
      simulatedVisibility = null;
      originalVisibilityDescriptor = undefined;
    }
  },
};
