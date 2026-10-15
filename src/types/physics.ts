/** Physical parameters for the damped spring integrator. Units are pixels (or user units), seconds, and milliseconds. */
export interface SpringOptions {
  /** Spring stiffness. Larger values pull the sample toward the target more strongly. */
  readonly stiffness?: number;
  /** Velocity-proportional damping. */
  readonly damping?: number;
  /** Effective mass; must be positive. */
  readonly mass?: number;
  /** Maximum distance from target before the spring may settle. */
  readonly restDelta?: number;
  /** Maximum absolute velocity before the spring may settle, in units per second. */
  readonly restSpeed?: number;
  /** Maximum integration substep, in milliseconds. */
  readonly maxSubstepMs?: number;
  /** Large frame gaps are capped to keep hidden-tab resumes stable. */
  readonly maxDeltaMs?: number;
}

/** One-dimensional physical state. Velocity uses units per second. */
export interface SpringState {
  readonly value: number;
  readonly velocity: number;
}

export interface SpringStepResult extends SpringState {
  readonly settled: boolean;
}

/** Framework-independent sample emitted by a physical motion. */
export interface MotionSample extends SpringState {
  /** Timestamp from the shared requestAnimationFrame clock, in milliseconds. */
  readonly timestamp: number;
}

export interface RetargetableMotionOptions extends SpringOptions {
  /** Initial value; defaults to zero. */
  readonly initialValue?: number;
  readonly onUpdate?: (sample: MotionSample) => void;
  readonly onComplete?: (sample: MotionSample) => void;
}


/** Two-dimensional point expressed in CSS pixels or another caller-defined unit. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** Optional browser behavior for pointerGestures$(). */
export interface PointerGestureOptions {
  /** Capture the active pointer on the target when Pointer Events are available. Defaults to true. */
  readonly capturePointer?: boolean;
}

/** Normalized pointer event emitted by pointerGestures$(); x/y are viewport client coordinates. */
export interface PointerGestureEvent extends Point2D {
  readonly type: 'down' | 'move' | 'up' | 'cancel';
  readonly pointerId: number;
  /** PointerEvent.timeStamp in milliseconds. */
  readonly timestamp: number;
}

export interface PointBounds {
  readonly minX?: number;
  readonly maxX?: number;
  readonly minY?: number;
  readonly maxY?: number;
}

export type DragAxis = 'both' | 'x' | 'y';

/** Options for dragInertia(); velocities are measured in units per second. */
export interface DragInertiaOptions {
  /** Exponential velocity decay coefficient in 1/seconds. Defaults to 6. */
  readonly friction?: number;
  /** Motion settles when the velocity magnitude reaches this units/second threshold. */
  readonly minVelocity?: number;
  /** Weight of the previous velocity sample, clamped to 0..0.99. */
  readonly velocitySmoothing?: number;
  /** Maximum absolute velocity for each axis, in units per second. */
  readonly maxVelocity?: number;
  /** Restrict movement and velocity estimation to one axis. Defaults to both axes. */
  readonly axis?: DragAxis;
  /** Maximum integration delta for a single frame, in milliseconds. */
  readonly maxDeltaMs?: number;
  /** Pointer samples separated by a larger gap reset estimated velocity. */
  readonly maxVelocitySampleMs?: number;
  /** Static coordinate bounds. Velocity is stopped at a clamped edge. */
  readonly bounds?: PointBounds;
  /**
   * Resolve coordinate bounds dynamically, for example from a resizable container.
   * When provided, this takes precedence over `bounds` and is evaluated on each sample/frame.
   */
  readonly getBounds?: () => PointBounds;
}

export interface DragInertiaSample extends Point2D {
  readonly vx: number;
  readonly vy: number;
  readonly phase: 'dragging' | 'inertia' | 'rest';
  readonly timestamp: number;
  readonly pointerId: number | null;
}

/** Options for slideFollow(); spring constants are shared with RetargetableMotion. */
export interface SlideFollowOptions extends SpringOptions {
  readonly initialValue?: Point2D;
}

export interface SlideFollowSample extends Point2D {
  readonly vx: number;
  readonly vy: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly timestamp: number;
  readonly settled: boolean;
}
