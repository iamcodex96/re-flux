import { animate, DOMAnimation } from './animation.js';
import type { DOMAnimateOptions, DOMAnimationTarget } from './animation.js';
import { draggable } from './draggable.js';
import type { DraggableHandle, DraggableOptions } from './draggable.js';
import { flip } from './layout.js';
import type { FlipOptions } from './layout.js';

/** Resources tracked by an animation scope, including DOM animations and RxJS subscriptions. */
export type ScopeResource = { dispose(): void } | { unsubscribe(): void };

/**
 * Owns browser animation resources for a component or scene. Selectors resolve only beneath `root`,
 * and `revert()` deterministically disposes every tracked animation/subscription.
 */
export class AnimationScope {
  private readonly resources = new Set<ScopeResource>();
  private disposed = false;

  constructor(readonly root: ParentNode) {}

  animate(targets: DOMAnimationTarget, options: DOMAnimateOptions): DOMAnimation {
    this.assertActive();
    const animation = animate(this.resolve(targets), options);
    this.resources.add(animation);
    return animation;
  }

  flip(targets: DOMAnimationTarget, mutate: () => void, options: FlipOptions = {}): DOMAnimation {
    this.assertActive();
    const animation = flip(this.resolve(targets), mutate, options);
    this.resources.add(animation);
    return animation;
  }

  /** Create a drag controller owned by this scope; `revert()` restores its styles and releases listeners. */
  draggable(target: HTMLElement, options: DraggableOptions = {}): DraggableHandle {
    this.assertActive();
    const handle = draggable(target, options);
    this.resources.add(handle);
    return handle;
  }

  /** Register a custom resource so it is disposed together with scoped animations. */
  add<T extends ScopeResource>(resource: T): T {
    this.assertActive();
    this.resources.add(resource);
    return resource;
  }

  /** Release all resources. Safe to call repeatedly. */
  revert(): void {
    if (this.disposed) return;
    this.disposed = true;
    const resources = [...this.resources].reverse();
    this.resources.clear();
    const errors: unknown[] = [];
    for (const resource of resources) {
      try {
        if ('dispose' in resource) resource.dispose();
        else resource.unsubscribe();
      } catch (error) { errors.push(error); }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'One or more animation scope resources failed to dispose.');
  }

  private resolve(targets: DOMAnimationTarget): DOMAnimationTarget {
    if (typeof targets !== 'string') return targets;
    const matches = Array.from(this.root.querySelectorAll(targets));
    if (matches.length === 0) throw new RangeError(`AnimationScope selector did not match any descendants: ${targets}`);
    return matches;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('This AnimationScope has been reverted and cannot create new resources.');
  }
}

/** Create a scoped animation owner. If setup throws, all resources registered before the error are reverted. */
export function createScope(root: ParentNode, setup?: (scope: AnimationScope) => void): AnimationScope {
  const scope = new AnimationScope(root);
  try { setup?.(scope); }
  catch (error) {
    try { scope.revert(); }
    catch { /* Preserve the original setup error. */ }
    throw error;
  }
  return scope;
}

/** Controller returned by `createResponsiveScope()`. */
export interface ResponsiveScopeController {
  readonly active: boolean;
  refresh(): void;
  dispose(): void;
}

/**
 * Recreate a scoped scene when a media query starts matching, and dispose it when it stops matching.
 * The query listener is removed and any active scope is reverted by `dispose()`.
 */
export function createResponsiveScope(
  root: ParentNode,
  query: string,
  setup: (scope: AnimationScope) => void,
  windowRef?: Window,
): ResponsiveScopeController {
  const browserWindow = windowRef ?? (typeof window !== 'undefined' ? window : undefined);
  if (!browserWindow) throw new Error('createResponsiveScope() requires a browser window.');
  if (!query.trim()) throw new TypeError('Responsive scope media query must not be empty.');
  const media = browserWindow.matchMedia(query);
  let scope: AnimationScope | null = null;
  let disposed = false;
  const synchronize = (): void => {
    if (disposed) return;
    if (media.matches && !scope) scope = createScope(root, setup);
    else if (!media.matches && scope) {
      const current = scope;
      scope = null;
      current.revert();
    }
  };
  const onChange = (): void => synchronize();
  media.addEventListener?.('change', onChange);
  if (!media.addEventListener) media.addListener?.(onChange);
  synchronize();
  return {
    get active() { return scope !== null; },
    refresh: synchronize,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      media.removeEventListener?.('change', onChange);
      if (!media.removeEventListener) media.removeListener?.(onChange);
      const current = scope;
      scope = null;
      current?.revert();
    },
  };
}
