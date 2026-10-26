/**
 * Procedural Bubble Chamber artwork used behind the featured kinetic typography.
 * The high-detail grain/galaxy texture is regenerated when size, seed, or theme changes.
 * Bubble rings are progressively traced and dashed orbital paths drift on a lightweight per-frame overlay.
 */

export interface BubbleChamberPalette {
  readonly cyan: string;
  readonly violet: string;
  readonly background: string;
}

const DEFAULT_PALETTE: BubbleChamberPalette = {
  cyan: '#67e8f9',
  violet: '#a78bfa',
  background: '#080b16',
};

type Random = () => number;

function getPalette(theme: BubbleChamberPalette): readonly string[] {
  return [theme.cyan, '#38bdf8', '#818cf8', theme.violet, '#c4b5fd', '#eef2ff'];
}

function seededRandom(seed: number): Random {
  let state = (seed >>> 0) || 0x1124;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function between(random: Random, min: number, max: number): number {
  return min + (max - min) * random();
}

function colorWithAlpha(color: string, alpha: number): string {
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i)?.[1];
  if (rgb) {
    const channels = rgb.split(/[,\s/]+/).filter(Boolean).slice(0, 3);
    if (channels.length === 3 && channels.every((channel) => Number.isFinite(Number(channel)))) {
      return `rgba(${channels.join(', ')}, ${alpha})`;
    }
  }

  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex) return color;
  const expanded = hex.length === 3 ? hex.split('').map((channel) => `${channel}${channel}`).join('') : hex;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(', ')}, ${alpha})`;
}

function drawGrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  random: Random,
  theme: BubbleChamberPalette,
): void {
  const total = Math.min(24000, Math.max(4500, Math.floor((width * height) / 25)));
  const colors = getPalette(theme);
  const tones = [
    { color: colorWithAlpha(colors[5] ?? '#eef2ff', 0.11), share: 0.32, size: 0.8 },
    { color: colorWithAlpha(theme.violet, 0.15), share: 0.22, size: 0.95 },
    { color: colorWithAlpha(theme.cyan, 0.13), share: 0.17, size: 0.9 },
    { color: colorWithAlpha(theme.background, 0.55), share: 0.29, size: 1.1 },
  ];

  for (const tone of tones) {
    context.fillStyle = tone.color;
    const count = Math.floor(total * tone.share);
    for (let index = 0; index < count; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const size = between(random, 0.35, tone.size);
      context.fillRect(x, y, size, size);
    }
  }
}

function drawOrbitTrails(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  random: Random,
  theme: BubbleChamberPalette,
  phase = 0,
  opacityScale = 1,
): void {
  const colors = getPalette(theme);
  context.save();
  context.lineWidth = 0.65;
  context.setLineDash([1.5, 5, 2, 7]);
  for (let index = 0; index < 22; index += 1) {
    const color = colors[Math.floor(random() * colors.length)] ?? theme.cyan;
    const startX = between(random, -width * 0.16, width * 1.04);
    const startY = between(random, height * 0.12, height * 1.04);
    const endX = startX + between(random, -width * 0.62, width * 0.62);
    const endY = startY + between(random, -height * 0.48, height * 0.48);
    const driftX = Math.sin(phase * (0.36 + (index % 4) * 0.07) + index * 1.31) * width * 0.012;
    const driftY = Math.cos(phase * (0.31 + (index % 5) * 0.045) + index * 0.83) * height * 0.014;
    context.lineDashOffset = -phase * (1.5 + (index % 5) * 1.1);
    context.beginPath();
    context.moveTo(startX + driftX, startY + driftY);
    context.bezierCurveTo(
      startX + between(random, -width * 0.3, width * 0.3) - driftY * 0.6,
      startY + between(random, -height * 0.45, height * 0.45) + driftX * 0.35,
      endX + between(random, -width * 0.24, width * 0.24) + driftY * 0.4,
      endY + between(random, -height * 0.35, height * 0.35) - driftX * 0.3,
      endX + driftX * 0.45,
      endY + driftY * 0.45,
    );
    context.strokeStyle = colorWithAlpha(color, between(random, 0.16, 0.42) * opacityScale);
    context.stroke();
  }
  context.restore();
}

function drawBubble(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  random: Random,
  phase = 0,
  revealProgress = 0,
  opacityScale = 1,
): void {
  context.save();
  context.translate(x, y);
  const rotation = between(random, -Math.PI, Math.PI);
  context.rotate(rotation + Math.sin(phase * 0.42 + radius) * 0.025);
  const dashPattern = random() > 0.55 ? [2, 4, 1, 3] : [1, 3];
  context.setLineDash(dashPattern);
  const rings = Math.max(2, Math.floor(between(random, 2, 8)));
  for (let ring = 0; ring < rings; ring += 1) {
    const ringRadius = radius * (0.25 + (ring / rings) * 0.75);
    const offsetX = ring === 0 ? 0 : between(random, -radius * 0.055, radius * 0.055);
    const offsetY = ring === 0 ? 0 : between(random, -radius * 0.055, radius * 0.055);
    const ellipseRatio = between(random, 0.92, 1.04);
    const lineWidth = between(random, 0.35, 0.9);
    const baseAlpha = between(random, 0.12, 0.5) * opacityScale;
    context.beginPath();
    context.ellipse(offsetX, offsetY, ringRadius, ringRadius * ellipseRatio, 0, 0, Math.PI * 2);
    context.lineWidth = lineWidth;
    context.strokeStyle = colorWithAlpha(color, baseAlpha);
    context.stroke();

    // A brighter arc traces the ring over time while the low-opacity full ring preserves the print texture.
    if (revealProgress > 0.005) {
      const ringProgress = Math.max(0, Math.min(1, revealProgress * 1.16 - ring * 0.035));
      if (ringProgress > 0.005) {
        const endAngle = -Math.PI / 2 + Math.PI * 2 * ringProgress;
        context.beginPath();
        context.ellipse(offsetX, offsetY, ringRadius, ringRadius * ellipseRatio, 0, -Math.PI / 2, endAngle);
        context.lineWidth = lineWidth + 0.22;
        context.strokeStyle = colorWithAlpha(color, Math.min(0.78, 0.18 + baseAlpha * 1.2));
        context.lineDashOffset = -phase * (0.7 + ring * 0.17);
        context.stroke();
      }
    }
  }
  if (radius > 16 && random() > 0.3) {
    const innerRadius = radius * between(random, 0.18, 0.36);
    context.beginPath();
    context.arc(0, 0, innerRadius, 0, Math.PI * 1.8);
    context.setLineDash([1, 2.5]);
    context.lineDashOffset = -phase * 1.6;
    context.strokeStyle = colorWithAlpha(color, 0.55 * opacityScale);
    context.stroke();
  }
  context.restore();
}

function drawGalaxy(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, random: Random): void {
  const count = Math.floor(between(random, 50, 138));
  context.fillStyle = colorWithAlpha(color, 0.45);
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radial = Math.pow(random(), 1.55) * radius;
    const jitterX = between(random, -radius * 0.06, radius * 0.06);
    const jitterY = between(random, -radius * 0.06, radius * 0.06);
    const size = between(random, 0.3, Math.max(0.55, radius * 0.018));
    context.fillRect(x + Math.cos(angle) * radial + jitterX, y + Math.sin(angle) * radial + jitterY, size, size);
  }

  context.save();
  context.translate(x, y);
  context.rotate(between(random, -0.7, 0.7));
  context.beginPath();
  for (let step = 0; step <= 120; step += 1) {
    const progress = step / 120;
    const angle = progress * Math.PI * 5.8;
    const distance = radius * 0.018 + progress * radius * 0.78;
    const px = Math.cos(angle) * distance;
    const py = Math.sin(angle) * distance * 0.42;
    if (step === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.strokeStyle = colorWithAlpha(color, 0.22);
  context.lineWidth = 0.55;
  context.setLineDash([1, 3]);
  context.stroke();
  context.restore();
}

/** Create a deterministic static layer matching a grainy, orbital bubble-chamber print. */
export function createBubbleChamberLayer(
  width: number,
  height: number,
  seed = 1124,
  theme: BubbleChamberPalette = DEFAULT_PALETTE,
): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.ceil(width));
  layer.height = Math.max(1, Math.ceil(height));
  const context = layer.getContext('2d');
  if (!context) return layer;

  const sceneSeed = seed ^ (layer.width * 31) ^ (layer.height * 17);
  const random = seededRandom(sceneSeed);
  const ornamentRandom = seededRandom(sceneSeed ^ 0x5bd1e995);
  const colors = getPalette(theme);
  const canvasWidth = layer.width;
  const canvasHeight = layer.height;
  context.fillStyle = theme.background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const glow = context.createRadialGradient(canvasWidth * 0.48, canvasHeight * 0.45, 0, canvasWidth * 0.48, canvasHeight * 0.45, Math.max(canvasWidth, canvasHeight) * 0.8);
  glow.addColorStop(0, colorWithAlpha(theme.violet, 0.2));
  glow.addColorStop(0.38, colorWithAlpha(theme.cyan, 0.075));
  glow.addColorStop(0.7, colorWithAlpha(theme.background, 0.45));
  glow.addColorStop(1, colorWithAlpha(theme.background, 0.92));
  context.fillStyle = glow;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  drawGrain(context, canvasWidth, canvasHeight, random, theme);
  // The printed line and ring shapes remain as a faint foundation; the animated overlay traces them above.
  drawOrbitTrails(context, canvasWidth, canvasHeight, ornamentRandom, theme, 0, 0.32);

  const bubbleCount = Math.min(88, Math.max(34, Math.floor((canvasWidth * canvasHeight) / 10500)));
  for (let index = 0; index < bubbleCount; index += 1) {
    const x = between(ornamentRandom, canvasWidth * -0.02, canvasWidth * 1.02);
    const y = between(ornamentRandom, canvasHeight * 0.04, canvasHeight * 1.04);
    const scale = Math.min(canvasWidth, canvasHeight);
    const radius = Math.pow(ornamentRandom(), 1.6) * scale * 0.056 + 3;
    const color = colors[Math.floor(ornamentRandom() * colors.length)] ?? theme.cyan;
    drawBubble(context, x, y, radius, color, ornamentRandom, 0, 0, 0.32);
  }

  const galaxyCount = Math.min(18, Math.max(8, Math.floor((canvasWidth * canvasHeight) / 32000)));
  for (let index = 0; index < galaxyCount; index += 1) {
    const x = between(random, canvasWidth * 0.025, canvasWidth * 0.975);
    const y = between(random, canvasHeight * 0.06, canvasHeight * 0.96);
    const radius = between(random, 8, Math.min(canvasWidth, canvasHeight) * 0.055);
    const color = colors[Math.floor(random() * colors.length)] ?? theme.cyan;
    drawGalaxy(context, x, y, radius, color, random);
  }

  // A fine final grain and vignette keep the center typography readable like the reference print.
  context.globalCompositeOperation = 'source-over';
  for (let index = 0; index < 1800; index += 1) {
    const x = random() * canvasWidth;
    const y = random() * canvasHeight;
    context.fillStyle = random() > 0.5 ? colorWithAlpha(colors[5] ?? '#eef2ff', 0.13) : colorWithAlpha(theme.background, 0.28);
    context.fillRect(x, y, between(random, 0.3, 0.8), between(random, 0.3, 0.8));
  }
  const vignette = context.createRadialGradient(canvasWidth * 0.5, canvasHeight * 0.48, Math.min(canvasWidth, canvasHeight) * 0.12, canvasWidth * 0.5, canvasHeight * 0.48, Math.max(canvasWidth, canvasHeight) * 0.72);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.54)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  return layer;
}

/**
 * Animate the ornament layer without repainting the high-resolution grain texture.
 * Bubble rings are continuously traced in staggered arcs and dashed orbit trails drift along their curves.
 */
export function drawBubbleChamberMotion(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  seed = 1124,
  theme: BubbleChamberPalette = DEFAULT_PALETTE,
): void {
  if (width <= 0 || height <= 0) return;
  const canvasWidth = Math.ceil(width);
  const canvasHeight = Math.ceil(height);
  const sceneSeed = seed ^ (canvasWidth * 31) ^ (canvasHeight * 17);
  const random = seededRandom(sceneSeed ^ 0x5bd1e995);
  const colors = getPalette(theme);
  const cycle = ((phase / (Math.PI * 2)) % 1 + 1) % 1;

  drawOrbitTrails(context, canvasWidth, canvasHeight, random, theme, phase, 0.9);

  const bubbleCount = Math.min(88, Math.max(34, Math.floor((canvasWidth * canvasHeight) / 10500)));
  const scale = Math.min(canvasWidth, canvasHeight);
  for (let index = 0; index < bubbleCount; index += 1) {
    const baseX = between(random, canvasWidth * -0.02, canvasWidth * 1.02);
    const baseY = between(random, canvasHeight * 0.04, canvasHeight * 1.04);
    const radius = Math.pow(random(), 1.6) * scale * 0.056 + 3;
    const color = colors[Math.floor(random() * colors.length)] ?? theme.cyan;
    const offset = index * 0.071;
    const orbit = phase * (0.12 + (index % 5) * 0.022) + offset * Math.PI * 2;
    const x = baseX + Math.cos(orbit) * Math.min(8, radius * 0.08);
    const y = baseY + Math.sin(orbit * 0.83) * Math.min(6, radius * 0.07);
    const revealProgress = (cycle + offset) % 1;
    drawBubble(context, x, y, radius, color, random, phase + offset, revealProgress, 0.86);
  }
}

/** Draw a restrained drifting dust layer over the cached print, keyed to the shared animation phase. */
export function drawBubbleChamberDrift(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  seed = 1124,
  theme: BubbleChamberPalette = DEFAULT_PALETTE,
): void {
  const random = seededRandom(seed ^ 0x6d2b79f5);
  const colors = getPalette(theme);
  for (let index = 0; index < 42; index += 1) {
    const orbitSeed = index * 2.399963229728653 + between(random, -0.45, 0.45);
    const horizontalOrbit = 0.12 + (index % 7) * 0.055 + random() * 0.018;
    const verticalOrbit = 0.12 + (index % 5) * 0.06 + random() * 0.014;
    const progress = phase * (0.09 + (index % 5) * 0.018) + orbitSeed;
    const x = width * 0.5 + Math.cos(progress) * width * horizontalOrbit;
    const y = height * 0.5 + Math.sin(progress * (0.73 + (index % 3) * 0.1)) * height * verticalOrbit;
    const color = colors[index % colors.length] ?? theme.cyan;
    context.fillStyle = colorWithAlpha(color, 0.16 + (index % 4) * 0.045);
    context.beginPath();
    context.arc(x, y, index % 9 === 0 ? 1.25 : 0.55, 0, Math.PI * 2);
    context.fill();
  }
}
