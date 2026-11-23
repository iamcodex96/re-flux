import { animate, interpolateCssValue } from '../dist/adapters/dom.js';
import { consume, emitReport, harnessInfo, measureMicroCases, microSettings } from './benchmark-utils.mjs';

/**
 * Cost of CSS value interpolation (`interpolateCssValue`) and of the whole DOM pipeline that calls it for every
 * element × property × frame (`animate()` over mock elements: Keyframes, interpolation, style binding).
 * Mock elements measure engine and binding work, not browser style recalculation or layout.
 * Judged by roadmap items PERF-003 and PERF-006.
 */
const settings = microSettings(200_000);

class MockStyle {
  values = new Map();
  getPropertyValue(name) {
    return this.values.get(name) ?? '';
  }
  getPropertyPriority() {
    return '';
  }
  setProperty(name, value) {
    this.values.set(name, String(value));
  }
  removeProperty(name) {
    this.values.delete(name);
  }
}

function createMockElement() {
  return {
    nodeType: 1,
    style: new MockStyle(),
    ownerDocument: { defaultView: { getComputedStyle: () => ({ getPropertyValue: () => '' }) } },
  };
}

const samples = [
  { id: 'px-length', from: '0px', to: '320px' },
  { id: 'unitless', from: '0', to: '1' },
  { id: 'transform-list', from: 'translate(0px, 0px) scale(1)', to: 'translate(100px, 50px) scale(2)' },
  { id: 'color-hex', from: '#102030', to: '#f0e0d0' },
  { id: 'color-rgb', from: 'rgb(10, 20, 30)', to: 'rgba(240, 220, 200, 0.5)' },
  { id: 'incompatible-templates', from: 'auto', to: '100px' },
];

const DURATION = 1000;
const elementCounts = [10, 100];
// Only the animation of the current repetition may stay alive: leaving earlier ones reachable would grow the live
// heap across repetitions and bias the GC and allocation metrics.
let currentAnimation = null;

const cases = samples.map((sample) => ({
  name: `css › interpolateCssValue › ${sample.id}`,
  group: 'interpolateCssValue',
  op: (index) => consume(interpolateCssValue(sample.from, sample.to, ((index % 999) + 1) / 1000)),
}));

for (const elementCount of elementCounts) {
  cases.push({
    name: `css › animate() pipeline › ${elementCount} elements × 3 properties`,
    group: 'animate-pipeline',
    scale: elementCount === 10 ? 0.1 : 0.01,
    prepare: () => {
      const elements = Array.from({ length: elementCount }, createMockElement);
      const animation = animate(elements, {
        duration: DURATION,
        properties: {
          transform: { values: ['translate(0px, 0px) scale(1)', 'translate(100px, 50px) scale(2)'] },
          opacity: { values: [0, 1] },
          backgroundColor: { values: ['#102030', '#f0e0d0'] },
        },
      });
      currentAnimation?.dispose();
      currentAnimation = animation;
      return { animation, first: elements[0] };
    },
    op: (index, context) => {
      context.animation.seek((index * 0.61) % DURATION);
      return (
        consume(context.first.style.getPropertyValue('transform')) +
        consume(context.first.style.getPropertyValue('opacity'))
      );
    },
  });
}

const results = await measureMicroCases(cases, settings);
currentAnimation?.dispose();

emitReport({
  benchmark: 're;Flux CSS interpolation and DOM animate() pipeline cost',
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  configuration: { ...settings, durationMs: DURATION, elementCounts },
  harness: harnessInfo(settings.repeats),
  note: 'Mock elements record style writes; this measures engine, interpolation and binding work only, not browser style recalculation or layout. Timings are descriptive, not pass/fail thresholds.',
  results,
});
