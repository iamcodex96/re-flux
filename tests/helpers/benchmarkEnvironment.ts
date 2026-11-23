import type { BenchmarkEnvironment, TimingEntry } from '../../apps/docs/src/benchmarks/environment';

type EntryType = 'longtask' | 'long-animation-frame';

/** Deterministic stand-in for the browser: a manual clock, a frame queue and a timer queue. */
export class FakeBenchmarkEnvironment implements BenchmarkEnvironment {
  time = 1000;
  visible = true;
  supported: string[] = [];
  /** Entry types whose `observeEntries` should throw (the browser rejecting the type). */
  rejected: EntryType[] = [];
  private nextId = 1;
  private readonly frames = new Map<number, (timestamp: number) => void>();
  private readonly timers = new Map<number, { at: number; callback: () => void }>();
  private readonly observers = new Map<EntryType, (entries: readonly TimingEntry[]) => void>();
  readonly disconnected: EntryType[] = [];

  now = (): number => this.time;
  requestFrame = (callback: (timestamp: number) => void): number => {
    const id = this.nextId++;
    this.frames.set(id, callback);
    return id;
  };
  cancelFrame = (id: number): void => {
    this.frames.delete(id);
  };
  setTimer = (callback: () => void, milliseconds: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + milliseconds, callback });
    return id;
  };
  clearTimer = (id: number): void => {
    this.timers.delete(id);
  };
  isVisible = (): boolean => this.visible;
  supportedEntryTypes = (): readonly string[] => this.supported;
  observeEntries = (type: EntryType, onEntries: (entries: readonly TimingEntry[]) => void) => {
    if (this.rejected.includes(type)) throw new TypeError(`${type} is not observable`);
    this.observers.set(type, onEntries);
    return { disconnect: () => void this.disconnected.push(type) };
  };
  describe = () => ({
    userAgent: 'jest',
    platform: 'test',
    language: 'en',
    hardwareConcurrency: 4,
    devicePixelRatio: 2,
    viewport: { width: 1280, height: 720 },
    visibilityState: 'visible' as DocumentVisibilityState,
  });

  get pendingFrames(): number {
    return this.frames.size;
  }
  get pendingTimers(): number {
    return this.timers.size;
  }

  /** Report a performance entry to the observer of `type`, if one is attached. */
  emitEntry(type: EntryType, entry: TimingEntry): void {
    this.observers.get(type)?.([entry]);
  }

  /** Advance the clock by `milliseconds`, fire due timers in time order, then deliver one frame to the callbacks queued before it. */
  tick(milliseconds = 16): void {
    this.time += milliseconds;
    for (const [id, timer] of [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at <= this.time && this.timers.delete(id)) timer.callback();
    }
    const queued = [...this.frames.entries()];
    this.frames.clear();
    for (const [, callback] of queued) callback(this.time);
  }

  /** Tick (letting promises settle between ticks) until `done()` or the tick budget runs out. */
  async pump(done: () => boolean, milliseconds = 16, maxTicks = 2000): Promise<void> {
    for (let index = 0; index < maxTicks && !done(); index += 1) {
      this.tick(milliseconds);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
}
