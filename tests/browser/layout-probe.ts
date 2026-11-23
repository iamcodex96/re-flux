/**
 * Measurement fixture for PERF-010 (see `scripts/run-browser-benchmark.mjs --suite adapters`). It is not an assertion
 * suite: each function performs one library operation synchronously, so the runner can read Chrome's style-recalculation
 * and layout counters before and after it. Everything the browser computes during a synchronous call is forced work,
 * because no frame can be rendered in the middle of a task.
 */
import { animate, animateNumber, flip, type DOMAnimation } from '../../src/adapters/dom.js';
import { followSvgPath$ } from '../../src/adapters/svg.js';
import type { Subscription } from 'rxjs';
import { BehaviorSubject } from 'rxjs';

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

const grid = required<HTMLDivElement>('#grid');
const counters = required<HTMLDivElement>('#counters');
const track = required<SVGPathElement>('#track');

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));
let active: DOMAnimation | null = null;
let activeSubscription: Subscription | null = null;

/** Force style + layout so a measurement starts from a clean document, then let the compositor settle. */
async function settle(): Promise<void> {
  void document.body.offsetHeight;
  await nextFrame();
  await nextFrame();
}

export type PropertyMode = 'explicit' | 'implicit';

const probe = {
  /** Replace the page with `count` boxes in a wrapping flex grid. */
  async build(count: number): Promise<void> {
    probe.dispose();
    grid.className = '';
    grid.replaceChildren(
      ...Array.from({ length: count }, () => {
        const box = document.createElement('div');
        box.className = 'box';
        return box;
      }),
    );
    await settle();
  },

  /** `flip()` over every box after a layout-changing class toggle. Returns the time spent in the call. */
  flipGrid(): number {
    const started = performance.now();
    active = flip(Array.from(grid.children) as HTMLElement[], () => grid.classList.toggle('wide'), { duration: 400 });
    return performance.now() - started;
  },

  /** `animate()` three properties on every box, either with explicit [from, to] pairs or implicit computed starts. */
  animateGrid(mode: PropertyMode): number {
    const started = performance.now();
    active = animate(Array.from(grid.children) as HTMLElement[], {
      duration: 600,
      properties:
        mode === 'explicit'
          ? {
              opacity: [1, 0.4],
              transform: ['translateX(0px)', 'translateX(12px)'],
              'background-color': ['rgb(136, 136, 136)', 'rgb(220, 60, 60)'],
            }
          : { opacity: 0.4, 'margin-left': 6, 'background-color': 'rgb(220, 60, 60)' },
    });
    return performance.now() - started;
  },

  /** Positive control: alternate a style write and a layout read on every box (layout thrash by construction). */
  controlThrash(): number {
    const started = performance.now();
    let sink = 0;
    for (const box of Array.from(grid.children) as HTMLElement[]) {
      box.style.marginLeft = '3px';
      sink += box.getBoundingClientRect().left;
    }
    if (!Number.isFinite(sink)) throw new Error('Probe checksum failed.');
    return performance.now() - started;
  },

  /** Negative control: the same reads and writes, reads first, so the browser can do the work once. */
  controlBatched(): number {
    const started = performance.now();
    const boxes = Array.from(grid.children) as HTMLElement[];
    let sink = 0;
    for (const box of boxes) sink += box.getBoundingClientRect().left;
    for (const box of boxes) box.style.marginLeft = '3px';
    if (!Number.isFinite(sink)) throw new Error('Probe checksum failed.');
    return performance.now() - started;
  },

  /** Start the played animation (if any) and report how many frames elapse while it runs. */
  async playFrames(frames: number): Promise<{ frames: number }> {
    active?.play();
    for (let index = 0; index < frames; index += 1) await nextFrame();
    return { frames };
  },

  /** `animateNumber()` on `count` counters, played for `frames` frames. */
  async numberFrames(count: number, frames: number): Promise<{ frames: number; created: number }> {
    probe.dispose();
    counters.replaceChildren(
      ...Array.from({ length: count }, () => {
        const element = document.createElement('div');
        element.className = 'counter';
        element.textContent = '0';
        return element;
      }),
    );
    await settle();
    const animations = Array.from(counters.children).map((element, index) =>
      animateNumber(element as HTMLElement, { from: 0, to: 1000 + index, duration: 2000 }),
    );
    for (const animation of animations) animation.play();
    for (let index = 0; index < frames; index += 1) await nextFrame();
    for (const animation of animations) animation.dispose();
    return { frames, created: animations.length };
  },

  /** Build a wavy path with `segments` cubic segments for the path-following measurements. */
  buildTrack(segments: number): number {
    let data = 'M 0 100';
    for (let index = 0; index < segments; index += 1) {
      const x = ((index + 1) / segments) * 600;
      const y = 100 + Math.sin(index * 0.9) * 80;
      data += ` C ${x - 3} ${y - 20}, ${x - 2} ${y + 20}, ${x} ${y}`;
    }
    track.setAttribute('d', data);
    return track.getTotalLength();
  },

  /**
   * Drive `followSvgPath$` for `emissions` progress values and return milliseconds per emission, together with the cost
   * of the three raw `getPointAtLength` calls it makes and of one call, measured the same way.
   */
  followPathCost(emissions: number): {
    followMsPerEmission: number;
    threeCallsMsPerEmission: number;
    oneCallMsPerEmission: number;
  } {
    const progress$ = new BehaviorSubject(0);
    const samples: number[] = [];
    const subscription = followSvgPath$(track, progress$).subscribe((sample) => samples.push(sample.x));
    const length = track.getTotalLength();
    const started = performance.now();
    for (let index = 0; index < emissions; index += 1) progress$.next(index / emissions);
    const follow = performance.now() - started;
    subscription.unsubscribe();

    let sink = 0;
    const threeStarted = performance.now();
    for (let index = 0; index < emissions; index += 1) {
      const distance = (index / emissions) * length;
      sink +=
        track.getPointAtLength(distance).x +
        track.getPointAtLength(Math.max(0, distance - 1)).x +
        track.getPointAtLength(Math.min(length, distance + 1)).x;
    }
    const three = performance.now() - threeStarted;
    const oneStarted = performance.now();
    for (let index = 0; index < emissions; index += 1) sink += track.getPointAtLength((index / emissions) * length).x;
    const one = performance.now() - oneStarted;
    if (!Number.isFinite(sink) || samples.length !== emissions + 1) throw new Error('Probe checksum failed.');
    return {
      followMsPerEmission: follow / emissions,
      threeCallsMsPerEmission: three / emissions,
      oneCallMsPerEmission: one / emissions,
    };
  },

  /** Drive `followSvgPath$` from a real frame loop (progress by frame) and write the result to a transform. */
  async followPathFrames(frames: number): Promise<{ frames: number }> {
    const progress$ = new BehaviorSubject(0);
    const marker = document.createElement('div');
    marker.className = 'box';
    grid.append(marker);
    activeSubscription = followSvgPath$(track, progress$).subscribe((sample) => {
      marker.style.transform = `translate(${sample.x}px, ${sample.y}px) rotate(${sample.angle}deg)`;
    });
    for (let index = 0; index < frames; index += 1) {
      progress$.next(index / frames);
      await nextFrame();
    }
    marker.remove();
    activeSubscription.unsubscribe();
    activeSubscription = null;
    return { frames };
  },

  dispose(): void {
    active?.dispose();
    active = null;
    activeSubscription?.unsubscribe();
    activeSubscription = null;
  },
};

export type LayoutProbe = typeof probe;
(window as unknown as { layoutProbe: LayoutProbe }).layoutProbe = probe;
