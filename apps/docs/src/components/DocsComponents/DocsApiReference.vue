<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useAppStore } from '../../stores/app';

type ApiCategory = 'Core' | 'Physics' | 'Streams' | 'Gestures' | 'Composition' | 'Timing' | 'Lifecycle' | 'Scheduler' | 'Values';
type ApiEntry = { name: string; signature: string; result: string; category: ApiCategory; description: string; importPath: string };
const appStore = useAppStore();
const copy = computed(() => appStore.app.view.docs);
const text = computed(() => copy.value.apiReference);
const query = ref('');
const category = ref<'All' | ApiCategory>('All');
const categories: Array<'All' | ApiCategory> = ['All', 'Core', 'Values', 'Composition', 'Physics', 'Streams', 'Gestures', 'Timing', 'Lifecycle', 'Scheduler'];
const entries: ApiEntry[] = [
  { name: 'Animation', signature: 'new Animation(options: AnimationOptions)', result: 'Animation', category: 'Core', description: 'Owns a playhead, easing, delay, repeat/yoyo and lifecycle callbacks.', importPath: '@re-code/flux' },
  { name: 'Timeline', signature: 'new Timeline(options?: TimelineOptions)', result: 'Timeline', category: 'Core', description: 'Coordinates AnimatableItems on one timeline and supports relative or labeled offsets.', importPath: '@re-code/flux' },
  { name: 'Tween<T>', signature: 'new Tween<T>(options: TweenOptions<T>)', result: 'Tween<T>', category: 'Core', description: 'Interpolates typed values while exposing value$, progress$ and state$.', importPath: '@re-code/flux' },
  { name: 'keyframes<T>()', signature: 'keyframes<T>(options: KeyframesOptions<T>)', result: 'Keyframes<T>', category: 'Composition', description: 'Creates a reusable keyframed AnimatableItem from normalized offsets.', importPath: '@re-code/flux' },
  { name: 'sequence()', signature: 'sequence(items: Iterable<AnimatableItem>, options?: TimelineOptions)', result: 'Timeline', category: 'Composition', description: 'Places each item after the previous item in a composed timeline.', importPath: '@re-code/flux' },
  { name: 'parallel()', signature: 'parallel(items: Iterable<AnimatableItem>, options?: TimelineOptions)', result: 'Timeline', category: 'Composition', description: 'Starts all items at the same timeline offset.', importPath: '@re-code/flux' },
  { name: 'staggered()', signature: 'staggered(items: Iterable<AnimatableItem>, each: number, staggerOptions?: StaggerOptions, timelineOptions?: TimelineOptions)', result: 'Timeline', category: 'Composition', description: 'Offsets a collection of items by a configurable interval.', importPath: '@re-code/flux' },
  { name: 'RetargetableMotion', signature: 'new RetargetableMotion(options?: RetargetableMotionOptions)', result: 'RetargetableMotion', category: 'Physics', description: 'A retargetable numeric spring exposing value$, velocity$, target$, sample$ and state$.', importPath: '@re-code/flux' },
  { name: 'stepSpring()', signature: 'stepSpring(state: SpringState, target: number, deltaMs: number, options?: SpringOptions)', result: 'SpringStepResult', category: 'Physics', description: 'Advances one damped spring sample using bounded semi-implicit Euler substeps.', importPath: '@re-code/flux' },
  { name: 'retargetMotion()', signature: 'retargetMotion(options?: RetargetMotionOperatorOptions)', result: 'OperatorFunction<number, MotionSample>', category: 'Streams', description: 'Turns a numeric target stream into continuous spring samples while preserving velocity.', importPath: '@re-code/flux' },
  { name: 'smoothStream()', signature: 'smoothStream<T>(options: SmoothStreamOptions<T>)', result: 'OperatorFunction<TimestampedValue<T>, SmoothedStreamSample<T>>', category: 'Streams', description: 'Samples irregular timestamped values on the shared frame clock with bounded latency.', importPath: '@re-code/flux' },
  { name: 'adaptiveTween()', signature: 'adaptiveTween<T>(options: AdaptiveTweenOptions<T>)', result: 'OperatorFunction<TimestampedValue<T>, AdaptiveTweenSample<T>>', category: 'Streams', description: 'Adapts transition duration to the measured cadence of incoming timestamped values.', importPath: '@re-code/flux' },
  { name: 'pointerGestures$()', signature: 'pointerGestures$(target: EventTarget, options?: PointerGestureOptions)', result: 'Observable<PointerGestureEvent>', category: 'Gestures', description: 'Normalizes pointer down/move/up/cancel and capture-loss behavior into one stream.', importPath: '@re-code/flux' },
  { name: 'dragInertia()', signature: 'dragInertia(options?: DragInertiaOptions)', result: 'OperatorFunction<PointerGestureEvent, DragInertiaSample>', category: 'Gestures', description: 'Applies filtered velocity, axis locking, bounds and inertial motion to pointer gestures.', importPath: '@re-code/flux' },
  { name: 'slideFollow()', signature: 'slideFollow(options?: SlideFollowOptions)', result: 'OperatorFunction<Point2D, SlideFollowSample>', category: 'Gestures', description: 'Creates a smoothed follower stream from target points.', importPath: '@re-code/flux' },
  { name: 'projectInertiaTarget()', signature: 'projectInertiaTarget(position: number, velocity: number, friction?: number, bounds?: { min?: number; max?: number })', result: 'number', category: 'Physics', description: 'Projects a release position using exponential velocity decay and optional min/max bounds.', importPath: '@re-code/flux' },
  { name: 'stagger()', signature: 'stagger(each: number, options?: StaggerOptions)', result: 'StaggerDelayFunction', category: 'Composition', description: 'Creates a reusable delay resolver for first, last, center, or index-based stagger origins.', importPath: '@re-code/flux' },
  { name: 'MotionPreferences', signature: 'new MotionPreferences(options?: MotionPreferencesOptions)', result: 'MotionPreferences', category: 'Lifecycle', description: 'Observes reduced-motion and document visibility preferences without imposing a global policy.', importPath: '@re-code/flux' },
  { name: 'FrameCoordinator', signature: 'new FrameCoordinator()', result: 'FrameCoordinator', category: 'Scheduler', description: 'Coordinates frame consumers and scheduled reads/writes on a shared requestAnimationFrame clock.', importPath: '@re-code/flux' },
  { name: 'frameCoordinator', signature: 'frameCoordinator.metrics$ / getDiagnostics()', result: 'FrameCoordinator', category: 'Scheduler', description: 'The shared coordinator singleton with measured work, subscriber counts, task queues, and idle assertions.', importPath: '@re-code/flux' },
  { name: 'createAnimationFrameObservable()', signature: 'createAnimationFrameObservable()', result: 'Observable<number>', category: 'Scheduler', description: 'Creates an independently subscribed Observable of requestAnimationFrame timestamps with teardown.', importPath: '@re-code/flux' },
  { name: 'Easings', signature: 'Easings: Readonly<Record<string, EasingFunction>>', result: 'Named easing map', category: 'Timing', description: 'Provides the built-in easing functions used by Animation, Tween, and Keyframes.', importPath: '@re-code/flux' },
  { name: 'resolveEasing()', signature: 'resolveEasing(easing?: EasingOption)', result: 'EasingFunction', category: 'Timing', description: 'Resolves a built-in easing name or custom function; unknown strings fall back to linear.', importPath: '@re-code/flux' },
  { name: 'cubicBezier()', signature: 'cubicBezier(x1: number, y1: number, x2: number, y2: number)', result: 'EasingFunction', category: 'Timing', description: 'Builds a cubic-bezier easing function with validated x control points.', importPath: '@re-code/flux' },
  { name: 'steps()', signature: "steps(count: number, position?: 'start' | 'end')", result: 'EasingFunction', category: 'Timing', description: 'Creates a discrete easing function with a configured number of steps.', importPath: '@re-code/flux' },
  { name: 'interpolate<T>()', signature: 'interpolate<T>(from: T, to: T, progress: number)', result: 'T', category: 'Values', description: 'Interpolates compatible numbers, strings, arrays, and plain objects between values.', importPath: '@re-code/flux' },
];
const filteredEntries = computed(() => entries.filter((entry) => (category.value === 'All' || entry.category === category.value)
  && `${entry.name} ${entry.signature} ${entry.description} ${entry.category}`.toLowerCase().includes(query.value.trim().toLowerCase())));
const copiedName = ref('');
let copyFeedbackTimeout: number | undefined;

async function copyImport(entry: ApiEntry): Promise<void> {
  try {
    await navigator.clipboard.writeText(`import { ${entry.name.replace('()', '').replace('<T>', '')} } from '${entry.importPath}';`);
    copiedName.value = entry.name;
    window.clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = window.setTimeout(() => { copiedName.value = ''; }, 1400);
  } catch {
    copiedName.value = '';
  }
}

onBeforeUnmount(() => window.clearTimeout(copyFeedbackTimeout));
</script>

<template>
  <div class="docs-api-reference">
    <section id="api-surface" class="docs-anchor docs-api-reference__intro">
      <div class="docs-section-heading"><span class="docs-section-heading__icon"><UiIcon icon="mdi-function-variant" size="22" /></span><div><p class="docs-section-eyebrow">{{ text.eyebrow }}</p><h2>{{ text.title }}</h2></div></div>
      <p class="docs-section-intro">{{ text.description }}</p>
      <div class="docs-api-reference__notice"><UiIcon icon="mdi-information-outline" size="18" /><p>{{ text.importNotice }}</p></div>
    </section>

    <section id="api-operators" class="docs-anchor docs-api-reference__catalog">
      <div class="docs-api-reference__toolbar">
        <label class="docs-api-reference__search"><UiIcon icon="mdi-magnify" size="18" /><span class="visually-hidden">{{ text.searchLabel }}</span><input v-model="query" type="search" :placeholder="text.searchPlaceholder" /></label>
        <div class="docs-api-reference__filters" role="group" :aria-label="text.categoryFilterLabel">
          <button v-for="item in categories" :key="item" type="button" :class="{ 'is-active': category === item }" :aria-pressed="category === item" @click="category = item">{{ item === 'All' ? text.allCategories : item }}</button>
        </div>
      </div>
      <p class="visually-hidden" role="status" aria-live="polite">{{ copiedName ? `${text.importCopied}: ${copiedName}` : '' }}</p>

      <div class="docs-api-table-shell">
        <table class="docs-api-reference__table">
          <thead><tr><th>{{ text.operatorColumn }}</th><th>{{ text.signatureColumn }}</th><th>{{ text.returnColumn }}</th><th>{{ text.categoryColumn }}</th><th><span class="visually-hidden">{{ text.copyColumn }}</span></th></tr></thead>
          <tbody>
            <tr v-for="entry in filteredEntries" :key="entry.name">
              <td><code class="docs-api-reference__name">{{ entry.name }}</code></td>
              <td><code class="docs-api-reference__signature">{{ entry.signature }}</code><p>{{ entry.description }}</p></td>
              <td><code class="docs-api-reference__return">{{ entry.result }}</code></td>
              <td><span class="docs-api-reference__category" :class="`docs-api-reference__category--${entry.category.toLowerCase()}`">{{ entry.category }}</span></td>
              <td><button class="docs-api-reference__copy" type="button" :aria-label="`${text.copyImportFor} ${entry.name}`" @click="copyImport(entry)"><UiIcon :icon="copiedName === entry.name ? 'mdi-check' : 'mdi-content-copy'" size="15" /></button></td>
            </tr>
            <tr v-if="filteredEntries.length === 0"><td colspan="5" class="docs-api-reference__empty">{{ text.noResults }}</td></tr>
          </tbody>
        </table>
      </div>
      <p class="docs-api-reference__footer">{{ filteredEntries.length }} {{ text.entriesLabel }} · {{ text.adapterNote }} <RouterLink to="/docs/rendering">{{ text.renderingAdaptersLink }}</RouterLink></p>
    </section>
  </div>
</template>
