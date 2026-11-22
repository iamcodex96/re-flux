/**
 * Manages a reusable promise per cycle and marks rejections as observed.
 *
 * The promise is created the first time something asks for it (`promise`, and so `then`, `toPromise`, `await`), not
 * with the cycle: most animations are never awaited, and the promise with its resolver closures was the biggest single
 * part of an instance. Until then the cycle only remembers how it settled, so a consumer that asks late sees exactly
 * what one that asked early would have seen, and a rejection nobody asks about cannot be reported as unhandled
 * because no promise exists for it.
 */
export class Completion {
  private currentPromise: Promise<void> | null = null;
  private resolveCurrent: (() => void) | null = null;
  private rejectCurrent: ((reason: unknown) => void) | null = null;
  private settled = false;
  private rejected = false;
  private reason: unknown = undefined;

  get promise(): Promise<void> {
    return this.currentPromise ?? this.createPromise();
  }

  get isSettled(): boolean {
    return this.settled;
  }

  resolve(): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveCurrent?.();
  }

  reject(reason: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.rejected = true;
    this.reason = reason;
    this.rejectCurrent?.(reason);
  }

  /** Starts a new cycle; any still-pending promise from the previous cycle is rejected. */
  restart(reason: unknown): void {
    if (!this.settled) this.reject(reason);
    this.reset();
  }

  /** Ensures a pending cycle after stop/completion without affecting previous consumers. */
  ensurePending(): void {
    if (this.settled) this.reset();
  }

  private reset(): void {
    this.currentPromise = null;
    this.resolveCurrent = null;
    this.rejectCurrent = null;
    this.settled = false;
    this.rejected = false;
    this.reason = undefined;
  }

  private createPromise(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.resolveCurrent = resolve;
      this.rejectCurrent = reject;
    });
    this.currentPromise = promise;
    // Mark the rejection as observed: a stopped animation nobody awaits must not raise an unhandled rejection.
    void promise.catch(() => undefined);
    if (this.settled) {
      if (this.rejected) this.rejectCurrent?.(this.reason);
      else this.resolveCurrent?.();
    }
    return promise;
  }
}
