import { Subscription, type Observable } from 'rxjs';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface CubicSegment {
  readonly p0: Point;
  readonly c1: Point;
  readonly c2: Point;
  readonly p3: Point;
}

interface Subpath {
  readonly start: Point;
  segments: CubicSegment[];
  closed: boolean;
}

interface ParsedPath {
  readonly subpaths: Subpath[];
}

export interface SvgPathNormalizationOptions {
  /** Maximum normalized cubic segments per subpath. Defaults to 128. */
  readonly maxSegmentsPerSubpath?: number;
  /** Rotate and/or reverse closed contours to find a lower-cost correspondence. Defaults to true. */
  readonly alignClosedContours?: boolean;
}

export interface NormalizedSvgPathPair {
  /** Source path converted to a compatible sequence of absolute cubic commands. */
  readonly from: string;
  /** Destination path converted to a compatible sequence of absolute cubic commands. */
  readonly to: string;
  /** Number of subpaths in the normalized pair. */
  readonly subpathCount: number;
  /** Cubic segment count for each corresponding subpath. */
  readonly segmentsPerSubpath: readonly number[];
}

const TOKEN_PATTERN = /[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const EPSILON = 1e-8;
const MAX_PATH_LENGTH = 100_000;
const MAX_SOURCE_SEGMENTS_PER_SUBPATH = 2_048;
const MAX_SUBPATHS = 64;
const COMMAND_ARGUMENTS: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
};

function point(x: number, y: number): Point {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('SVG path coordinates must be finite numbers.');
  return { x, y };
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function add(a: Point, b: Point): Point {
  return point(a.x + b.x, a.y + b.y);
}

function subtract(a: Point, b: Point): Point {
  return point(a.x - b.x, a.y - b.y);
}

function scale(a: Point, factor: number): Point {
  return point(a.x * factor, a.y * factor);
}

function midpoint(a: Point, b: Point): Point {
  return point((a.x + b.x) / 2, (a.y + b.y) / 2);
}

function lineAsCubic(from: Point, to: Point): CubicSegment {
  return {
    p0: from,
    c1: add(from, scale(subtract(to, from), 1 / 3)),
    c2: add(from, scale(subtract(to, from), 2 / 3)),
    p3: to,
  };
}

function quadraticAsCubic(from: Point, control: Point, to: Point): CubicSegment {
  return {
    p0: from,
    c1: add(from, scale(subtract(control, from), 2 / 3)),
    c2: add(to, scale(subtract(control, to), 2 / 3)),
    p3: to,
  };
}

function cubicPoint(segment: CubicSegment, t: number): Point {
  const inverse = 1 - t;
  const a = inverse * inverse * inverse;
  const b = 3 * inverse * inverse * t;
  const c = 3 * inverse * t * t;
  const d = t * t * t;
  return point(
    a * segment.p0.x + b * segment.c1.x + c * segment.c2.x + d * segment.p3.x,
    a * segment.p0.y + b * segment.c1.y + c * segment.c2.y + d * segment.p3.y,
  );
}

function splitCubic(segment: CubicSegment): readonly [CubicSegment, CubicSegment] {
  const p01 = midpoint(segment.p0, segment.c1);
  const p12 = midpoint(segment.c1, segment.c2);
  const p23 = midpoint(segment.c2, segment.p3);
  const p012 = midpoint(p01, p12);
  const p123 = midpoint(p12, p23);
  const p0123 = midpoint(p012, p123);
  return [
    { p0: segment.p0, c1: p01, c2: p012, p3: p0123 },
    { p0: p0123, c1: p123, c2: p23, p3: segment.p3 },
  ];
}

function approximateLength(segment: CubicSegment): number {
  let length = 0;
  let previous = segment.p0;
  // Fixed subdivisions make the choice deterministic and inexpensive.
  for (let index = 1; index <= 16; index += 1) {
    const current = cubicPoint(segment, index / 16);
    length += distance(previous, current);
    previous = current;
  }
  return length;
}

function arcAsCubics(
  from: Point,
  rxInput: number,
  ryInput: number,
  rotationDegrees: number,
  largeArcFlag: number,
  sweepFlag: number,
  to: Point,
): CubicSegment[] {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if ((largeArcFlag !== 0 && largeArcFlag !== 1) || (sweepFlag !== 0 && sweepFlag !== 1)) {
    throw new TypeError('SVG arc flags must be 0 or 1.');
  }
  if (samePoint(from, to)) return [];
  if (rx <= EPSILON || ry <= EPSILON) return [lineAsCubic(from, to)];

  const phi = (rotationDegrees % 360) * Math.PI / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const xPrime = cosPhi * dx + sinPhi * dy;
  const yPrime = -sinPhi * dx + cosPhi * dy;

  const lambda = (xPrime * xPrime) / (rx * rx) + (yPrime * yPrime) / (ry * ry);
  if (lambda > 1) {
    const factor = Math.sqrt(lambda);
    rx *= factor;
    ry *= factor;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const xPrime2 = xPrime * xPrime;
  const yPrime2 = yPrime * yPrime;
  const denominator = rx2 * yPrime2 + ry2 * xPrime2;
  const numerator = Math.max(0, rx2 * ry2 - rx2 * yPrime2 - ry2 * xPrime2);
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const coefficient = denominator <= EPSILON ? 0 : sign * Math.sqrt(numerator / denominator);
  const cxPrime = coefficient * (rx * yPrime / ry);
  const cyPrime = coefficient * (-ry * xPrime / rx);
  const center = point(
    cosPhi * cxPrime - sinPhi * cyPrime + (from.x + to.x) / 2,
    sinPhi * cxPrime + cosPhi * cyPrime + (from.y + to.y) / 2,
  );

  const vectorAngle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const magnitude = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (magnitude <= EPSILON) return 0;
    const cross = ux * vy - uy * vx;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot / magnitude)));
    return cross < 0 ? -angle : angle;
  };

  const ux = (xPrime - cxPrime) / rx;
  const uy = (yPrime - cyPrime) / ry;
  const vx = (-xPrime - cxPrime) / rx;
  const vy = (-yPrime - cyPrime) / ry;
  const startAngle = vectorAngle(1, 0, ux, uy);
  let deltaAngle = vectorAngle(ux, uy, vx, vy);
  if (sweepFlag === 0 && deltaAngle > 0) deltaAngle -= Math.PI * 2;
  if (sweepFlag === 1 && deltaAngle < 0) deltaAngle += Math.PI * 2;

  const count = Math.max(1, Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2)));
  const step = deltaAngle / count;
  const mapEllipse = (angle: number): Point => point(
    center.x + rx * Math.cos(angle) * cosPhi - ry * Math.sin(angle) * sinPhi,
    center.y + rx * Math.cos(angle) * sinPhi + ry * Math.sin(angle) * cosPhi,
  );
  const derivative = (angle: number): Point => point(
    -rx * Math.sin(angle) * cosPhi - ry * Math.cos(angle) * sinPhi,
    -rx * Math.sin(angle) * sinPhi + ry * Math.cos(angle) * cosPhi,
  );

  const segments: CubicSegment[] = [];
  for (let index = 0; index < count; index += 1) {
    const a0 = startAngle + step * index;
    const a1 = a0 + step;
    const start = index === 0 ? from : mapEllipse(a0);
    const end = index === count - 1 ? to : mapEllipse(a1);
    const alpha = (4 / 3) * Math.tan((a1 - a0) / 4);
    const d0 = derivative(a0);
    const d1 = derivative(a1);
    segments.push({
      p0: start,
      c1: add(start, scale(d0, alpha)),
      c2: subtract(end, scale(d1, alpha)),
      p3: end,
    });
  }
  return segments;
}

function tokenizePath(path: string): string[] {
  if (typeof path !== 'string' || path.trim().length === 0) throw new TypeError('SVG path data must be a non-empty string.');
  if (path.length > MAX_PATH_LENGTH) throw new RangeError(`SVG path data must not exceed ${MAX_PATH_LENGTH} characters.`);
  const tokens = path.match(TOKEN_PATTERN) ?? [];
  const compact = path.replace(/[\s,]+/g, '');
  if (tokens.join('') !== compact) throw new TypeError('SVG path data contains unsupported or malformed tokens.');
  for (const token of tokens) {
    if (/^[a-zA-Z]$/.test(token) && !(token.toUpperCase() in COMMAND_ARGUMENTS)) {
      throw new TypeError(`Unsupported SVG path command "${token}". Supported commands are M, L, H, V, C, S, Q, T, A and Z.`);
    }
  }
  return tokens;
}

function parsePath(path: string): ParsedPath {
  const tokens = tokenizePath(path);
  const subpaths: Subpath[] = [];
  let index = 0;
  let command: string | null = null;
  let current = point(0, 0);
  let subpath: Subpath | null = null;
  let previousCommand = '';
  let previousCubicControl: Point | null = null;
  let previousQuadraticControl: Point | null = null;

  const hasNumber = (): boolean => index < tokens.length && !/^[a-zA-Z]$/.test(tokens[index] ?? '');
  const readNumber = (): number => {
    const token = tokens[index];
    if (token === undefined || /^[a-zA-Z]$/.test(token)) throw new TypeError(`SVG command ${command ?? ''} is missing a numeric parameter.`);
    index += 1;
    const value = Number(token);
    if (!Number.isFinite(value)) throw new TypeError('SVG path coordinates must be finite numbers.');
    return value;
  };
  const readArcFlag = (): number => {
    const token = tokens[index];
    if (token === undefined || /^[a-zA-Z]$/.test(token)) throw new TypeError('SVG arc flags must be 0 or 1.');
    if (token === '0' || token === '1') {
      index += 1;
      return Number(token);
    }
    // SVG permits adjacent one-character arc flags and coordinates without separators (for example `... 0 01100 50`).
    if (token.startsWith('0') || token.startsWith('1')) {
      const flag = token[0];
      const remaining = token.slice(1);
      if (remaining.length > 0) tokens[index] = remaining;
      else index += 1;
      return Number(flag);
    }
    throw new TypeError('SVG arc flags must be 0 or 1.');
  };
  const requireSubpath = (): Subpath => {
    if (!subpath) throw new TypeError('SVG path must begin with a move-to command (M).');
    return subpath;
  };
  const absolutePoint = (x: number, y: number, relative: boolean): Point => relative ? point(current.x + x, current.y + y) : point(x, y);
  const append = (segment: CubicSegment): void => {
    const active = requireSubpath();
    active.segments.push(segment);
    if (active.segments.length > MAX_SOURCE_SEGMENTS_PER_SUBPATH) {
      throw new RangeError(`SVG path subpaths must not exceed ${MAX_SOURCE_SEGMENTS_PER_SUBPATH} source segments.`);
    }
    current = segment.p3;
  };
  const resetControls = (): void => {
    previousCubicControl = null;
    previousQuadraticControl = null;
  };

  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index] ?? '')) {
      command = tokens[index] ?? null;
      index += 1;
    } else if (command === null) {
      throw new TypeError('SVG path data must start each segment with a command.');
    }
    if (command === null) break;
    const upper = command.toUpperCase();
    const relative: boolean = command !== upper;
    if (!(upper in COMMAND_ARGUMENTS)) throw new TypeError(`Unsupported SVG path command "${command}".`);

    if (upper === 'Z') {
      const active = requireSubpath();
      if (!samePoint(current, active.start)) append(lineAsCubic(current, active.start));
      active.closed = true;
      current = active.start;
      previousCommand = 'Z';
      resetControls();
      command = null;
      continue;
    }

    if (!hasNumber()) throw new TypeError(`SVG command ${command} is missing its parameters.`);
    let firstMovePair = true;
    while (hasNumber()) {
      if (upper === 'M') {
        const x = readNumber();
        const y = readNumber();
        const next = absolutePoint(x, y, relative);
        if (firstMovePair) {
          subpath = { start: next, segments: [], closed: false };
          subpaths.push(subpath);
          if (subpaths.length > MAX_SUBPATHS) throw new RangeError(`SVG path must not exceed ${MAX_SUBPATHS} subpaths.`);
          current = next;
          firstMovePair = false;
          previousCommand = 'M';
          resetControls();
        } else {
          append(lineAsCubic(current, next));
          previousCommand = 'L';
          resetControls();
        }
        continue;
      }

      requireSubpath();
      switch (upper) {
        case 'L': {
          const x = readNumber();
          const y = readNumber();
          const next = absolutePoint(x, y, relative);
          append(lineAsCubic(current, next));
          previousCommand = 'L';
          resetControls();
          break;
        }
        case 'H': {
          const x = readNumber();
          const next = point(relative ? current.x + x : x, current.y);
          append(lineAsCubic(current, next));
          previousCommand = 'H';
          resetControls();
          break;
        }
        case 'V': {
          const y = readNumber();
          const next = point(current.x, relative ? current.y + y : y);
          append(lineAsCubic(current, next));
          previousCommand = 'V';
          resetControls();
          break;
        }
        case 'C': {
          const x1 = readNumber(); const y1 = readNumber();
          const x2 = readNumber(); const y2 = readNumber();
          const x = readNumber(); const y = readNumber();
          const c1 = absolutePoint(x1, y1, relative);
          const c2 = absolutePoint(x2, y2, relative);
          const end = absolutePoint(x, y, relative);
          append({ p0: current, c1, c2, p3: end });
          previousCubicControl = c2;
          previousQuadraticControl = null;
          previousCommand = 'C';
          break;
        }
        case 'S': {
          const x2 = readNumber(); const y2 = readNumber();
          const x = readNumber(); const y = readNumber();
          const c1 = previousCommand === 'C' || previousCommand === 'S'
            ? subtract(scale(current, 2), previousCubicControl ?? current)
            : current;
          const c2 = absolutePoint(x2, y2, relative);
          const end = absolutePoint(x, y, relative);
          append({ p0: current, c1, c2, p3: end });
          previousCubicControl = c2;
          previousQuadraticControl = null;
          previousCommand = 'S';
          break;
        }
        case 'Q': {
          const x1 = readNumber(); const y1 = readNumber();
          const x = readNumber(); const y = readNumber();
          const control = absolutePoint(x1, y1, relative);
          const end = absolutePoint(x, y, relative);
          append(quadraticAsCubic(current, control, end));
          previousQuadraticControl = control;
          previousCubicControl = null;
          previousCommand = 'Q';
          break;
        }
        case 'T': {
          const x = readNumber(); const y = readNumber();
          const control: Point = previousCommand === 'Q' || previousCommand === 'T'
            ? subtract(scale(current, 2), previousQuadraticControl ?? current)
            : current;
          const end = absolutePoint(x, y, relative);
          append(quadraticAsCubic(current, control, end));
          previousQuadraticControl = control;
          previousCubicControl = null;
          previousCommand = 'T';
          break;
        }
        case 'A': {
          const rx = readNumber(); const ry = readNumber(); const rotation = readNumber();
          const largeArcFlag = readArcFlag(); const sweepFlag = readArcFlag();
          const x = readNumber(); const y = readNumber();
          const end = absolutePoint(x, y, relative);
          const segments = arcAsCubics(current, rx, ry, rotation, largeArcFlag, sweepFlag, end);
          for (const segment of segments) append(segment);
          current = end;
          previousCommand = 'A';
          resetControls();
          break;
        }
        default:
          throw new TypeError(`Unsupported SVG path command "${command}".`);
      }

    }
  }

  if (subpaths.length === 0) throw new TypeError('SVG path must contain at least one move-to command.');
  for (const candidate of subpaths) {
    if (candidate.segments.length === 0) throw new TypeError('SVG path subpaths must contain at least one drawable segment.');
  }
  return { subpaths };
}

function splitLongestSegment(segments: CubicSegment[]): void {
  let longestIndex = -1;
  let longestLength = -1;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) continue;
    const length = approximateLength(segment);
    if (length > longestLength) {
      longestLength = length;
      longestIndex = index;
    }
  }
  if (longestIndex < 0) throw new TypeError('Unable to normalize an empty SVG subpath.');
  const selected = segments[longestIndex];
  if (!selected) throw new TypeError('Unable to normalize SVG path segment.');
  const [first, second] = splitCubic(selected);
  segments.splice(longestIndex, 1, first, second);
}

function reverseSegment(segment: CubicSegment): CubicSegment {
  return { p0: segment.p3, c1: segment.c2, c2: segment.c1, p3: segment.p0 };
}

function reverseClosedContour(segments: readonly CubicSegment[]): CubicSegment[] {
  return [...segments].reverse().map(reverseSegment);
}

function rotateSegments(segments: readonly CubicSegment[], offset: number): CubicSegment[] {
  return [...segments.slice(offset), ...segments.slice(0, offset)];
}

function contourAlignmentCost(from: readonly CubicSegment[], to: readonly CubicSegment[]): number {
  let cost = 0;
  for (let index = 0; index < from.length; index += 1) {
    const fromSegment = from[index];
    const toSegment = to[index];
    if (!fromSegment || !toSegment) return Number.POSITIVE_INFINITY;
    const dx = fromSegment.p0.x - toSegment.p0.x;
    const dy = fromSegment.p0.y - toSegment.p0.y;
    cost += dx * dx + dy * dy;
  }
  return cost;
}

function alignClosedContour(from: readonly CubicSegment[], to: readonly CubicSegment[]): CubicSegment[] {
  let best = [...to];
  let bestCost = Number.POSITIVE_INFINITY;
  const candidates = [ [...to], reverseClosedContour(to) ];
  for (const candidate of candidates) {
    for (let offset = 0; offset < candidate.length; offset += 1) {
      const rotated = rotateSegments(candidate, offset);
      const cost = contourAlignmentCost(from, rotated);
      if (cost < bestCost) {
        best = rotated;
        bestCost = cost;
      }
    }
  }
  return best;
}

function formatNumber(value: number): string {
  const rounded = Number(value.toFixed(5));
  return Object.is(rounded, -0) ? '0' : String(rounded);
}

function serializeSubpath(subpath: Subpath): string {
  const first = subpath.segments[0];
  if (!first) throw new TypeError('Cannot serialize an empty SVG subpath.');
  let output = `M ${formatNumber(first.p0.x)} ${formatNumber(first.p0.y)}`;
  for (const segment of subpath.segments) {
    output += ` C ${formatNumber(segment.c1.x)} ${formatNumber(segment.c1.y)} ${formatNumber(segment.c2.x)} ${formatNumber(segment.c2.y)} ${formatNumber(segment.p3.x)} ${formatNumber(segment.p3.y)}`;
  }
  if (subpath.closed) output += ' Z';
  return output;
}

/**
 * Normalize two SVG path strings into matching absolute cubic commands so they can be morphed safely.
 * Supports M/L/H/V/C/S/Q/T/A/Z commands, including relative variants. Each corresponding subpath
 * must have the same open/closed state; closed contours are aligned by start position and direction.
 * Cubic subdivision preserves each source curve's geometry while making command counts compatible.
 */
export function normalizeSvgPathPair(
  from: string,
  to: string,
  options: SvgPathNormalizationOptions = {},
): NormalizedSvgPathPair {
  const maxSegments = options.maxSegmentsPerSubpath ?? 128;
  if (!Number.isInteger(maxSegments) || maxSegments < 1 || maxSegments > 2_048) {
    throw new RangeError('maxSegmentsPerSubpath must be an integer between 1 and 2048.');
  }
  const alignClosedContours = options.alignClosedContours ?? true;
  const parsedFrom = parsePath(from);
  const parsedTo = parsePath(to);
  if (parsedFrom.subpaths.length !== parsedTo.subpaths.length) {
    throw new TypeError('SVG paths must contain the same number of subpaths to morph.');
  }

  const normalizedFrom: Subpath[] = [];
  const normalizedTo: Subpath[] = [];
  const segmentCounts: number[] = [];

  for (let index = 0; index < parsedFrom.subpaths.length; index += 1) {
    const source = parsedFrom.subpaths[index];
    const destination = parsedTo.subpaths[index];
    if (!source || !destination) throw new TypeError('SVG path subpaths could not be paired.');
    if (source.closed !== destination.closed) {
      throw new TypeError(`SVG subpath ${index + 1} must be open in both paths or closed in both paths.`);
    }

    const segmentCount = Math.max(source.segments.length, destination.segments.length);
    if (segmentCount > maxSegments) {
      throw new RangeError(`SVG subpath ${index + 1} needs ${segmentCount} segments, exceeding maxSegmentsPerSubpath (${maxSegments}).`);
    }
    const sourceSegments = [...source.segments];
    const destinationSegments = [...destination.segments];
    while (sourceSegments.length < segmentCount) splitLongestSegment(sourceSegments);
    while (destinationSegments.length < segmentCount) splitLongestSegment(destinationSegments);

    const alignedDestination = source.closed && alignClosedContours
      ? alignClosedContour(sourceSegments, destinationSegments)
      : destinationSegments;

    normalizedFrom.push({ start: sourceSegments[0]?.p0 ?? source.start, segments: sourceSegments, closed: source.closed });
    normalizedTo.push({ start: alignedDestination[0]?.p0 ?? destination.start, segments: alignedDestination, closed: destination.closed });
    segmentCounts.push(segmentCount);
  }

  return {
    from: normalizedFrom.map(serializeSubpath).join(' '),
    to: normalizedTo.map(serializeSubpath).join(' '),
    subpathCount: normalizedFrom.length,
    segmentsPerSubpath: segmentCounts,
  };
}

/** Build an interpolator for SVG paths that can be normalized to matching cubic segment counts. */
export function createSvgPathInterpolator(
  from: string,
  to: string,
  options: SvgPathNormalizationOptions = {},
): (progress: number) => string {
  const normalized = normalizeSvgPathPair(from, to, options);
  const fromNumbers = normalized.from.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const toNumbers = normalized.to.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const fromTemplate = normalized.from.replace(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g, '#');
  const toTemplate = normalized.to.replace(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g, '#');
  if (fromNumbers.length !== toNumbers.length || fromTemplate !== toTemplate) {
    // The normalizer is responsible for this invariant; this protects the public interpolator from malformed future changes.
    throw new TypeError('SVG path normalization did not produce compatible command structures.');
  }

  return (progress: number): string => {
    if (!Number.isFinite(progress)) throw new RangeError('SVG path morph progress must be finite.');
    let index = 0;
    return normalized.from.replace(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g, (token) => {
      const start = Number(token);
      const endToken = toNumbers[index];
      if (endToken === undefined) throw new TypeError('SVG path interpolation encountered a missing numeric parameter.');
      index += 1;
      return formatNumber(start + (Number(endToken) - start) * progress);
    });
  };
}

/** Morph between paths with different supported command structures, restoring the original `d` on teardown. */
export function bindSvgPathMorph(
  target: SVGPathElement,
  progress$: Observable<number>,
  from: string,
  to: string,
  options: SvgPathNormalizationOptions = {},
): Subscription {
  const morph = createSvgPathInterpolator(from, to, options);
  const originalPath = target.getAttribute('d');
  const subscription = new Subscription();
  target.setAttribute('d', from);
  subscription.add(progress$.subscribe((progress) => target.setAttribute('d', morph(progress))));
  subscription.add(() => {
    if (originalPath === null) target.removeAttribute('d');
    else target.setAttribute('d', originalPath);
  });
  return subscription;
}
