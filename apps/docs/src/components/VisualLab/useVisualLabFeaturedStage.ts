import { combineLatest, BehaviorSubject, map, type Subscription } from 'rxjs';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MotionPreferences, RetargetableMotion, Tween } from '@lib';
import type { VisualLabFeaturedStageProps, VisualLabTelemetryHandler, PointerPosition, CanvasSize, StageFrame } from './visualLabStageTypes';
import type { VisualLabStageConfig, VisualLabTelemetry } from './visualLabTypes';
import type { P5Instance } from './p5Runtime';
import { FIELD_PARTICLE_COUNT, drawSingularity } from './kineticSingularityRenderer';
import { loadP5 } from './p5Runtime';

const TELEMETRY_INTERVAL_MS = 250;
const TAU = Math.PI * 2;

export function useVisualLabFeaturedStage(props: VisualLabFeaturedStageProps, emit: VisualLabTelemetryHandler) {
  const root = ref<HTMLElement | null>(null);
  const canvasHost = ref<HTMLElement | null>(null);
  const isVisible = ref(false);
  const isPointerActive = ref(false);
  const canvasUnavailable = ref(false);
  const prefersReducedMotion = ref(props.preferences.snapshot.reducedMotion);
  const pointerSubject = new BehaviorSubject<PointerPosition | null>(null);
  const configSubject = new BehaviorSubject<VisualLabStageConfig>({ ...props.config });
  const sizeSubject = new BehaviorSubject<CanvasSize>({ width: 1, height: 1 });
  const cleanups: Array<() => void> = [];
  let p5Instance: (P5Instance & { remove(): void; }) | null = null;
  let phaseTween: Tween<number> | null = null;
  let renderSubscription: Subscription | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let visibilityObserver: IntersectionObserver | null = null;
  let xMotion: RetargetableMotion | null = null;
  let yMotion: RetargetableMotion | null = null;
  let xMotionSubscription: Subscription | null = null;
  let yMotionSubscription: Subscription | null = null;
  let lastFrameAt = 0;
  let lastTelemetryAt = 0;
  let smoothedFps = 0;
  let latestDrawTimeMs = 0;
  let latestPointer: PointerPosition | null = null;
  let latestFrame: StageFrame = {
    phase: 0,
    pointer: null,
    config: { ...props.config },
    size: { width: 1, height: 1 },
  };
  let disposed = false;

  function currentSpringOptions() {
    return {
      stiffness: 130 + props.config.springElasticity * 210,
      damping: 12 + props.config.airDrag * 520,
      mass: 1,
    };
  }

  function publishSpringPointer(): void {
    if (!isPointerActive.value) {
      pointerSubject.next(null);
      return;
    }
    const x = xMotion?.value$.value ?? -1;
    const y = yMotion?.value$.value ?? -1;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) pointerSubject.next({ x, y });
    else pointerSubject.next(null);
  }

  function retargetPointer(x: number, y: number): void {
    if (prefersReducedMotion.value) return;
    const options = currentSpringOptions();
    xMotion?.to(x, options);
    yMotion?.to(y, options);
  }

  function emitTelemetry(state: VisualLabTelemetry['state'], now = performance.now()): void {
    emit({
      fps: state === 'running' ? Math.round(smoothedFps * 10) / 10 : 0,
      frameTimeMs: Math.round(latestDrawTimeMs * 1000) / 1000,
      nodeCount: FIELD_PARTICLE_COUNT,
      pointerX: latestPointer?.x ?? null,
      pointerY: latestPointer?.y ?? null,
      state,
    });
    lastTelemetryAt = now;
  }

  function resize(): void {
    const element = canvasHost.value;
    if (!element) return;
    const width = Math.max(1, Math.round(element.clientWidth));
    const height = Math.max(1, Math.round(element.clientHeight));
    sizeSubject.next({ width, height });
    if (!p5Instance || (p5Instance.width === width && p5Instance.height === height)) return;
    p5Instance.resizeCanvas(width, height, true);
    if (isVisible.value || prefersReducedMotion.value) p5Instance.redraw();
  }

  function syncPlayback(): void {
    if (!phaseTween) return;
    if (isVisible.value && !prefersReducedMotion.value) {
      void phaseTween.play().catch(() => undefined);
      p5Instance?.redraw();
      emitTelemetry('running');
    } else {
      phaseTween.stop();
      pointerSubject.next(null);
      latestPointer = null;
      lastFrameAt = 0;
      smoothedFps = 0;
      latestDrawTimeMs = 0;
      p5Instance?.redraw();
      emitTelemetry(prefersReducedMotion.value ? 'reduced-motion' : 'idle');
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const element = root.value;
    if (!element || prefersReducedMotion.value) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    isPointerActive.value = true;
    retargetPointer(x, y);
  }

  function clearPointer(): void {
    isPointerActive.value = false;
    if (prefersReducedMotion.value) {
      pointerSubject.next(null);
      latestPointer = null;
    } else {
      retargetPointer(-1, -1);
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (prefersReducedMotion.value) return;
    const step = event.shiftKey ? 0.12 : 0.04;
    const current = latestPointer ?? { x: 0.5, y: 0.5 };
    let x = current.x;
    let y = current.y;
    if (event.key === 'ArrowLeft') x -= step;
    else if (event.key === 'ArrowRight') x += step;
    else if (event.key === 'ArrowUp') y -= step;
    else if (event.key === 'ArrowDown') y += step;
    else if (event.key === 'Home' || event.key === 'Escape') {
      event.preventDefault();
      resetCenter();
      return;
    } else return;
    event.preventDefault();
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    isPointerActive.value = true;
    retargetPointer(x, y);
  }

  function resetCenter(): void {
    isPointerActive.value = false;
    xMotion?.stop();
    yMotion?.stop();
    xMotion?.to(-1);
    yMotion?.to(-1);
    pointerSubject.next(null);
    latestPointer = null;
    phaseTween?.seek(0);
    if (!isVisible.value || prefersReducedMotion.value) syncPlayback();
    else emitTelemetry('running');
  }


  watch(() => ({ ...props.config }), (config) => {
    configSubject.next(config);
    if (xMotion && yMotion && latestPointer) retargetPointer(latestPointer.x, latestPointer.y);
  }, { deep: true });

  onMounted(() => {
    if (!root.value || !canvasHost.value) return;
    const initialWidth = Math.max(1, Math.round(canvasHost.value.clientWidth));
    const initialHeight = Math.max(1, Math.round(canvasHost.value.clientHeight));
    sizeSubject.next({ width: initialWidth, height: initialHeight });

    phaseTween = new Tween({
      from: 0,
      to: TAU,
      duration: 4200,
      easing: 'linear',
      repeat: Infinity,
      motion: { preferences: props.preferences, pauseWhenHidden: true, reducedMotion: 'finish' },
    });
    void phaseTween.catch(() => undefined);

    renderSubscription = combineLatest([
      phaseTween.value$,
      pointerSubject,
      configSubject,
      sizeSubject,
    ]).pipe(map(([phase, pointer, config, size]): StageFrame => ({ phase, pointer, config, size }))).subscribe((frame) => {
      latestFrame = frame;
      latestPointer = frame.pointer;
      if (p5Instance && (isVisible.value || prefersReducedMotion.value)) p5Instance.redraw();
    });

    xMotion = new RetargetableMotion({ initialValue: -1, ...currentSpringOptions() });
    yMotion = new RetargetableMotion({ initialValue: -1, ...currentSpringOptions() });
    xMotionSubscription = xMotion.value$.subscribe(publishSpringPointer);
    yMotionSubscription = yMotion.value$.subscribe(publishSpringPointer);

    const initializeP5 = async (): Promise<void> => {
      try {
        const P5 = await loadP5();
        if (disposed || !canvasHost.value) return;
        p5Instance = new P5((p) => {
          p.setup = () => {
            p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
            const renderer = p.createCanvas(initialWidth, initialHeight);
            renderer.elt.classList.add('lab-feature-stage__canvas');
            renderer.elt.setAttribute('aria-hidden', 'true');
            p.noLoop();
            latestFrame = { ...latestFrame, size: { width: p.width, height: p.height } };
            p.redraw();
            if (isVisible.value && !prefersReducedMotion.value) syncPlayback();
          };
          p.draw = () => {
            const before = performance.now();
            drawSingularity(p, latestFrame);
            const after = performance.now();
            latestDrawTimeMs = Math.max(0, after - before);
            if (lastFrameAt > 0) {
              const delta = after - lastFrameAt;
              if (delta > 0 && delta < 1000) {
                const sample = 1000 / delta;
                smoothedFps = smoothedFps === 0 ? sample : smoothedFps * 0.7 + sample * 0.3;
              }
            }
            lastFrameAt = after;
            if (after - lastTelemetryAt >= TELEMETRY_INTERVAL_MS) {
              emitTelemetry(isVisible.value && !prefersReducedMotion.value ? 'running' : prefersReducedMotion.value ? 'reduced-motion' : 'idle', after);
            }
          };
        }, canvasHost.value);
        resizeObserver?.observe(canvasHost.value);
        p5Instance.redraw();
      } catch {
        if (disposed) return;
        canvasUnavailable.value = true;
        emitTelemetry(prefersReducedMotion.value ? 'reduced-motion' : 'idle');
      }
    };
    void initializeP5();

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvasHost.value);
    } else {
      window.addEventListener('resize', resize, { passive: true });
      cleanups.push(() => window.removeEventListener('resize', resize));
    }

    if (typeof IntersectionObserver !== 'undefined') {
      visibilityObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        isVisible.value = entry.isIntersecting && entry.intersectionRatio > 0.05;
        syncPlayback();
      }, { threshold: [0, 0.05, 0.25] });
      visibilityObserver.observe(root.value);
    } else {
      isVisible.value = true;
    }

    const preferencesSubscription = props.preferences.state$.subscribe((state) => {
      const changed = prefersReducedMotion.value !== state.reducedMotion;
      prefersReducedMotion.value = state.reducedMotion;
      if (!changed) return;
      if (state.reducedMotion) {
        clearPointer();
        pointerSubject.next(null);
      }
      syncPlayback();
    });
    cleanups.push(() => preferencesSubscription.unsubscribe());
    syncPlayback();
  });

  onBeforeUnmount(() => {
    disposed = true;
    phaseTween?.stop();
    xMotionSubscription?.unsubscribe();
    yMotionSubscription?.unsubscribe();
    xMotion?.dispose();
    yMotion?.dispose();
    xMotion = null;
    yMotion = null;
    xMotionSubscription = null;
    yMotionSubscription = null;
    resizeObserver?.disconnect();
    visibilityObserver?.disconnect();
    resizeObserver = null;
    visibilityObserver = null;
    renderSubscription?.unsubscribe();
    renderSubscription = null;
    phaseTween = null;
    p5Instance?.remove();
    p5Instance = null;
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    pointerSubject.complete();
    configSubject.complete();
    sizeSubject.complete();
    emitTelemetry('idle');
  });

  return {
    root,
    canvasHost,
    isVisible,
    isPointerActive,
    canvasUnavailable,
    prefersReducedMotion,
    onPointerMove,
    clearPointer,
    onKeydown,
    resetCenter,
  };
}
