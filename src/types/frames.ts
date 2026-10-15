import type { Observable } from 'rxjs';

export interface AnimationFrameSource {
  readonly observable: Observable<number>;
}


/** Frame data emitted by the shared requestAnimationFrame coordinator. */
export interface AnimationFrameTick {
  readonly timestamp: number;
  readonly delta: number;
  readonly frame: number;
}
