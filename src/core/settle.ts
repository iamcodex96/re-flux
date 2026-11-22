/**
 * @internal Marks the built-in timeline items whose `seekLocal()` is a no-op once they have completed (`Animation`,
 * `Tween`, `Keyframes`, a nested `Timeline`). A Timeline uses it to stop visiting a child that has finished.
 *
 * The probe is installed on the prototypes with `Object.defineProperty`, outside the class bodies, so no declaration
 * file changes and no instance pays for it. An item without the probe (a custom `AnimatableItem`, a `call()` marker)
 * is visited on every update exactly as before. Not re-exported from the package entry points.
 */
export const SETTLE_PROBE: unique symbol = Symbol('re-flux.settleProbe');

/** Returns true while the item is in its completed state, i.e. while `seekLocal(time >= duration)` changes nothing. */
export type SettleProbe = () => boolean;

export interface SettleProbed {
  readonly [SETTLE_PROBE]?: SettleProbe;
}
