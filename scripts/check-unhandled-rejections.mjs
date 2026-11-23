// Stopping, restarting or replacing an Animation / Timeline nobody awaits must not raise an unhandled rejection.
// Jest cannot assert this (its `process` is a sandboxed copy that never sees the real event), so it runs here against
// the built output. A control (a promise that really is unhandled) proves that the listener would notice one.
import assert from 'node:assert/strict';
import { Animation } from '../dist/core/Animation.js';
import { Completion } from '../dist/core/Completion.js';
import { Timeline } from '../dist/core/Timeline.js';

let nextId = 1;
const callbacks = new Map();
globalThis.requestAnimationFrame = (callback) => {
  const id = nextId++;
  callbacks.set(id, callback);
  return id;
};
globalThis.cancelAnimationFrame = (id) => {
  callbacks.delete(id);
};
const advance = (timestamp) => {
  const current = [...callbacks.values()];
  callbacks.clear();
  for (const callback of current) callback(timestamp);
};
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
};

const unhandled = [];
process.on('unhandledRejection', (reason) => {
  unhandled.push(reason);
});

// Control: the listener must see a genuinely unhandled rejection.
void Promise.reject(new Error('control'));
await settle();
assert.equal(unhandled.length, 1, 'the control rejection should have been reported');
unhandled.length = 0;

const animation = new Animation({ duration: 100 });
animation.play();
advance(0);
advance(10);
animation.stop();
animation.play();
animation.restart();
animation.stop();

const timeline = new Timeline().add(new Animation({ duration: 50 }));
timeline.play();
advance(20);
advance(30);
timeline.stop();
timeline.restart();
timeline.stop();

const completion = new Completion();
completion.reject(new Error('never observed'));
completion.restart(new Error('never observed either'));
completion.reject(new Error('and again'));

// A promise that is asked for late, and one asked for early, are both handled.
const late = new Animation({ duration: 10 });
late.play();
advance(40);
late.stop();
void late.toPromise().catch(() => undefined);
const early = new Animation({ duration: 10 });
const earlyPromise = early.toPromise();
early.stop();
void earlyPromise.catch(() => undefined);

// The promise exists (somebody called toPromise()) but nobody handles its rejection: still not reported.
const requested = new Animation({ duration: 10 });
void requested.toPromise();
requested.stop();
const requestedTimeline = new Timeline().add(new Animation({ duration: 10 }));
void requestedTimeline.toPromise();
requestedTimeline.stop();

await settle();
assert.deepEqual(unhandled, [], `unexpected unhandled rejection(s): ${unhandled.map(String).join(', ')}`);
console.log('No unhandled rejections from unobserved stop(), restart() or replaced cycles.');
