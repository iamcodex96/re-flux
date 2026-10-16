/** Manages a reusable promise per cycle and marks rejections as observed. */
export class Completion {
  private currentPromise!: Promise<void>;
  private resolveCurrent!: () => void;
  private rejectCurrent!: (reason: unknown) => void;
  private settled = false;

  constructor() {
    this.createPromise();
  }

  get promise(): Promise<void> {
    return this.currentPromise;
  }

  get isSettled(): boolean {
    return this.settled;
  }

  resolve(): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveCurrent();
  }

  reject(reason: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.rejectCurrent(reason);
  }

  /** Creates a new promise; any still-pending promise from the previous cycle is rejected. */
  restart(reason: unknown): void {
    if (!this.settled) this.reject(reason);
    this.createPromise();
  }

  /** Ensures a pending promise after stop/completion without affecting previous consumers. */
  ensurePending(): void {
    if (this.settled) this.createPromise();
  }

  private createPromise(): void {
    this.settled = false;
    this.currentPromise = new Promise<void>((resolve, reject) => {
      this.resolveCurrent = resolve;
      this.rejectCurrent = reject;
    });
     
    void this.currentPromise.catch(() => undefined);
  }
}
