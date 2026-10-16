import { Tween } from '../../values/Tween.js';
import type { AnimationOptions } from '../../types.js';
import { animate, DOMAnimation } from './animation.js';
import type { DOMAnimateOptions } from './animation.js';

export type TextSplitMode = 'graphemes' | 'words';

/** Options for `animateText()`. The helper creates temporary spans and restores the original DOM on dispose. */
export interface TextAnimationOptions extends Omit<DOMAnimateOptions, 'properties'> {
  readonly splitBy?: TextSplitMode;
  readonly fromOpacity?: number;
  readonly fromTransform?: string;
}

/**
 * Reveal a text-only or rich-text element by grapheme or word without requiring callers to build spans.
 * Existing child nodes are retained and restored on dispose; generated spans are hidden from assistive
 * technology while the parent receives the original accessible text label.
 */
export function animateText(target: HTMLElement, options: TextAnimationOptions = {}): DOMAnimation {
  const splitBy = options.splitBy ?? 'graphemes';
  const fromOpacity = options.fromOpacity ?? 0;
  const fromTransform = options.fromTransform ?? 'translateY(0.72em) rotate(3deg)';
  const duration = options.duration ?? 580;
  const stagger = options.stagger ?? 22;
  if (splitBy !== 'graphemes' && splitBy !== 'words') throw new TypeError('animateText() splitBy must be "graphemes" or "words".');
  if (!Number.isFinite(fromOpacity) || fromOpacity < 0 || fromOpacity > 1) throw new RangeError('animateText() fromOpacity must be in [0, 1].');
  if (typeof fromTransform !== 'string') throw new TypeError('animateText() fromTransform must be a CSS transform string.');

  const originalNodes = Array.from(target.childNodes);
  const originalText = target.textContent ?? '';
  const originalAriaLabel = target.getAttribute('aria-label');
  const hadAriaLabel = target.hasAttribute('aria-label');
  const documentRef = target.ownerDocument;
  if (!documentRef) throw new TypeError('animateText() requires a target with an ownerDocument.');

  const tokens = splitBy === 'words' ? splitWords(originalText) : splitGraphemes(originalText);
  const fragment = documentRef.createDocumentFragment();
  const animatedSpans: HTMLElement[] = [];
  for (const token of tokens) {
    if (!token || /^\s+$/u.test(token)) {
      fragment.append(documentRef.createTextNode(token));
      continue;
    }
    const span = documentRef.createElement('span');
    span.textContent = token;
    span.setAttribute('aria-hidden', 'true');
    span.style.display = 'inline-block';
    span.style.whiteSpace = 'pre';
    span.dataset.reFluxTextPart = '';
    fragment.append(span);
    animatedSpans.push(span);
  }

  target.replaceChildren(fragment);
  target.setAttribute('aria-label', hadAriaLabel ? (originalAriaLabel ?? '') : originalText);
  if (animatedSpans.length === 0) {
    const empty = new DOMAnimation();
    empty.addDisposeCallback(() => restoreTextContent(target, originalNodes, hadAriaLabel, originalAriaLabel));
    return empty;
  }

  try {
    const { splitBy: _splitBy, fromOpacity: _fromOpacity, fromTransform: _fromTransform, stagger: _stagger, ...timingOptions } = options;
    const animation = animate(animatedSpans, {
      ...timingOptions,
      duration,
      stagger,
      properties: {
        opacity: [fromOpacity, 1],
        transform: [fromTransform, 'translateY(0em) rotate(0deg)'],
      },
    });
    animation.addDisposeCallback(() => restoreTextContent(target, originalNodes, hadAriaLabel, originalAriaLabel));
    return animation;
  } catch (error) {
    restoreTextContent(target, originalNodes, hadAriaLabel, originalAriaLabel);
    throw error;
  }
}


/** Number animation settings for counters, scores, timers and live metrics. */
export interface NumberAnimationOptions extends Omit<AnimationOptions, 'onUpdate'> {
  readonly from: number;
  readonly to: number;
  /** Convert the current numeric value to display text. Defaults to a rounded integer string. */
  readonly format?: (value: number, progress: number) => string;
}

/**
 * Animate a numeric text value while retaining a real DOM timeline. The exact original child nodes
 * are restored on dispose, so the helper is safe to use in mount/unmount component lifecycles.
 */
export function animateNumber(target: HTMLElement, options: NumberAnimationOptions): DOMAnimation {
  const { from, to, format, duration, delay = 0, easing, repeat = 0, yoyo = false, ...timelineOptions } = options;
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new RangeError('animateNumber() from and to values must be finite.');
  const originalNodes = Array.from(target.childNodes);
  const formatter = format ?? ((value: number) => String(Math.round(value)));
  const animation = new DOMAnimation(timelineOptions);
  const tween = new Tween<number>({
    from,
    to,
    duration,
    delay,
    ...(easing === undefined ? {} : { easing }),
    repeat,
    yoyo,
    onUpdate: (value, progress) => { target.textContent = formatter(value, progress); },
  });
  animation.add(tween);
  animation.addDisposeCallback(() => target.replaceChildren(...originalNodes));
  return animation;
}

function splitWords(value: string): string[] {
  return value.match(/\s+|[^\s]+/gu) ?? [];
}

function splitGraphemes(value: string): string[] {
  type Segment = { readonly segment: string };
  type SegmenterLike = { segment(input: string): Iterable<Segment> };
  type SegmenterConstructor = new (locale?: string, options?: { granularity: 'grapheme' }) => SegmenterLike;
  const Constructor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  if (Constructor) return Array.from(new Constructor(undefined, { granularity: 'grapheme' }).segment(value), (part) => part.segment);
   
  return Array.from(value);
}

function restoreTextContent(
  target: HTMLElement,
  originalNodes: readonly ChildNode[],
  hadAriaLabel: boolean,
  originalAriaLabel: string | null,
): void {
  target.replaceChildren(...originalNodes);
  if (hadAriaLabel && originalAriaLabel !== null) target.setAttribute('aria-label', originalAriaLabel);
  else target.removeAttribute('aria-label');
}
