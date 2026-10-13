/** Deterministic requestAnimationFrame implementation for core unit tests. */
export class RafController {
  private nextId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();
  private previousRequest: PropertyDescriptor | undefined;
  private previousCancel: PropertyDescriptor | undefined;

  get pendingCount(): number {
    return this.callbacks.size;
  }

  install(): void {
    this.previousRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
    this.previousCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback): number => {
        const id = this.nextId++;
        this.callbacks.set(id, callback);
        return id;
      },
    });
    Object.defineProperty(globalThis, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: (id: number): void => {
        this.callbacks.delete(id);
      },
    });
  }

  /** Runs only callbacks scheduled before this frame, as browsers do. */
  advance(timestamp: number): void {
    const currentFrame = [...this.callbacks.entries()];
    this.callbacks.clear();
    for (const [, callback] of currentFrame) callback(timestamp);
  }

  uninstall(): void {
    this.callbacks.clear();
    this.restoreProperty('requestAnimationFrame', this.previousRequest);
    this.restoreProperty('cancelAnimationFrame', this.previousCancel);
  }

  private restoreProperty(name: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
}
