import { performance } from 'node:perf_hooks';
import { FrameCoordinator } from '../dist/core/FrameCoordinator.js';
import { createAnimationFrameObservable } from '../dist/utils/animationFrame.js';

const consumerCount = Number(process.env.BENCH_CONSUMERS ?? 1000);
const frameCount = Number(process.env.BENCH_FRAMES ?? 180);
let nextId = 1;
let callbacks = new Map();
const originalRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
const originalCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');

globalThis.requestAnimationFrame = (callback) => {
  const id = nextId++;
  callbacks.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => callbacks.delete(id);

function advance(timestamp) {
  const current = [...callbacks.entries()];
  callbacks.clear();
  for (const [, callback] of current) callback(timestamp);
}

function restore() {
  callbacks.clear();
  if (originalRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', originalRaf);
  else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  if (originalCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', originalCancel);
  else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
}

function runShared() {
  const coordinator = new FrameCoordinator();
  const subscriptions = [];
  let callbackCount = 0;
  for (let index = 0; index < consumerCount; index += 1) {
    subscriptions.push(coordinator.frames$.subscribe(() => { callbackCount += 1; }));
  }
  let peakRafCallbacks = callbacks.size;
  const started = performance.now();
  for (let frame = 0; frame < frameCount; frame += 1) {
    peakRafCallbacks = Math.max(peakRafCallbacks, callbacks.size);
    advance(frame * 16.667);
  }
  const elapsedMs = performance.now() - started;
  for (const subscription of subscriptions) subscription.unsubscribe();
  const diagnostics = coordinator.getDiagnostics();
  coordinator.assertIdle();
  return { mode: 'one shared FrameCoordinator', elapsedMs, callbackCount, peakRafCallbacks, diagnostics };
}

function runIndependent() {
  const subscriptions = [];
  let callbackCount = 0;
  let peakRafCallbacks = 0;
  for (let index = 0; index < consumerCount; index += 1) {
    subscriptions.push(createAnimationFrameObservable().subscribe(() => { callbackCount += 1; }));
  }
  const started = performance.now();
  for (let frame = 0; frame < frameCount; frame += 1) {
    peakRafCallbacks = Math.max(peakRafCallbacks, callbacks.size);
    advance(frame * 16.667);
  }
  const elapsedMs = performance.now() - started;
  for (const subscription of subscriptions) subscription.unsubscribe();
  return { mode: 'one RAF observable per consumer', elapsedMs, callbackCount, peakRafCallbacks, pendingRafCallbacksAfterCleanup: callbacks.size };
}

try {
  const shared = runShared();
  const independent = runIndependent();
  console.log(JSON.stringify({ consumerCount, frameCount, shared, independent }, null, 2));
} finally {
  restore();
}
