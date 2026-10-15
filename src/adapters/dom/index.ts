export { bindStyle, DOMAnimation, animate, interpolateCssValue } from './animation.js';
export type {
  CssStyleMap,
  CssAnimatableValue,
  CssPropertyFrames,
  CssPropertyFramesFactory,
  DOMAnimationTarget,
  DOMPropertyKeyframe,
  DOMPropertyTimingOptions,
  DOMPropertyOptions,
  CssPropertyDefinition,
  DOMAnimateOptions,
} from './animation.js';

export { draggable } from './draggable.js';
export type { DraggableOptions, DraggableHandle } from './draggable.js';

export { animateText, animateNumber } from './text.js';
export type { TextSplitMode, TextAnimationOptions, NumberAnimationOptions } from './text.js';

export { scrollProgress$, bindScrollTimeline } from './scroll.js';
export type { ScrollProgressOptions, ScrollTimelineOptions } from './scroll.js';
export { createScrollTrigger } from './scrollTrigger.js';
export type {
  ScrollTriggerController,
  ScrollTriggerDirection,
  ScrollTriggerEvent,
  ScrollTriggerRootAnchor,
  ScrollTriggerTargetAnchor,
  ScrollTriggerOptions,
  ScrollTriggerPosition,
  ScrollTriggerPositionConfig,
} from './scrollTrigger.js';

export { flip } from './layout.js';
export type { FlipOptions } from './layout.js';

export { AnimationScope, createScope, createResponsiveScope } from './scope.js';
export type { ScopeResource, ResponsiveScopeController } from './scope.js';
