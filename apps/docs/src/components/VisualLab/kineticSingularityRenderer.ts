import type p5 from 'p5';
import type { FieldParticle, PointerPosition, StageFrame } from './visualLabStageTypes';

export const RIBBON_COUNT = 6;
export const FIELD_PARTICLE_COUNT = 120;
const RIBBON_SEGMENTS = 220;
const TAU = Math.PI * 2;
const particles: readonly FieldParticle[] = Array.from({ length: FIELD_PARTICLE_COUNT }, (_, index) => ({
  ribbon: index % RIBBON_COUNT,
  progress: ((index * 47) % FIELD_PARTICLE_COUNT) / FIELD_PARTICLE_COUNT,
  speed: 0.025 + (index % 7) * 0.0028,
  radius: 1.05 + (index % 4) * 0.25,
}));

type P5Instance = InstanceType<typeof p5>;

function isCanvas2DContext(
    context: P5Instance['drawingContext'],
): context is CanvasRenderingContext2D {
    return (
        'save' in context &&
        'restore' in context &&
        'shadowBlur' in context &&
        'shadowColor' in context
    );
}

function alphaForDistance(x: number, y: number, pointer: PointerPosition | null, width: number, height: number): number {
  if (!pointer) return 0;
  const dx = x - pointer.x * width;
  const dy = y - pointer.y * height;
  const distance = Math.hypot(dx / Math.max(1, width), dy / Math.max(1, height));
  return Math.max(0, 1 - distance / 0.34);
}

function ribbonPoint(progress: number, ribbon: number, frame: StageFrame, phase: number): PointerPosition {
  const { width, height } = frame.size;
  const config = frame.config;
  const unit = ((progress % 1) + 1) % 1;
  const angle = unit * TAU + phase * 0.14 + ribbon * 0.42;
  const resistance = 1 - Math.min(0.68, config.airDrag * 4.8);
  const amplitude = (0.55 + config.springElasticity * 0.8) * resistance;
  const rx = width * (0.255 + ribbon * 0.016);
  const ry = height * (0.245 + ribbon * 0.018);
  let x = width * 0.5
    + Math.cos(angle) * rx
    + Math.sin(angle * 3 + phase * 0.24 + ribbon * 0.74) * width * 0.062 * amplitude;
  let y = height * 0.5
    + Math.sin(angle * 2 + ribbon * 0.19) * ry * 0.72
    + Math.cos(angle * 3 - phase * 0.17 + ribbon * 0.61) * height * 0.105 * amplitude
    + (config.gravity / 25) * (unit - 0.5) * height * 0.09;

  if (frame.pointer) {
    const influence = alphaForDistance(x, y, frame.pointer, width, height) * config.springElasticity * 0.28;
    x += (frame.pointer.x * width - x) * influence;
    y += (frame.pointer.y * height - y) * influence;
  }
  return { x, y };
}

function drawRibbon(p: P5Instance, frame: StageFrame, ribbon: number, phase: number, glow: boolean): void {
  const cyan = ribbon % 2 === 0;
  const rgba = cyan ? [44, 221, 240] : [164, 117, 255];
  p.noFill();
  p.stroke(rgba[0]!, rgba[1]!, rgba[2]!, glow ? 22 : 126 - ribbon * 8);
  p.strokeWeight(glow ? 6 + ribbon * 0.45 : 1.1 + (ribbon % 3) * 0.18);
  p.beginShape();
  for (let segment = 0; segment <= RIBBON_SEGMENTS; segment += 1) {
    const point = ribbonPoint(segment / RIBBON_SEGMENTS, ribbon, frame, phase);
    p.vertex(point.x, point.y);
  }
  p.endShape();
}

export function drawSingularity(p: P5Instance, frame: StageFrame): void {
  const { width, height } = frame.size;
  if (width <= 0 || height <= 0) return;
  const phase = frame.phase * frame.config.timeScale;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const scale = Math.min(width, height);
  const context = p.drawingContext;
  const shadowContext = isCanvas2DContext(context) ? context : null;
  p.background(7, 9, 16);

  // A quiet star field adds scale without competing with the animated ribbons.
  p.noStroke();
  for (let index = 0; index < 112; index += 1) {
    const xUnit = Math.abs(Math.sin(index * 127.1 + 17.7) * 43758.5453) % 1;
    const yUnit = Math.abs(Math.sin(index * 311.7 + 9.2) * 24634.6345) % 1;
    const twinkle = 18 + ((index * 13) % 34);
    p.fill(index % 4 === 0 ? 63 : 123, index % 4 === 0 ? 219 : 128, 244, twinkle);
    p.ellipse(xUnit * width, yUnit * height, index % 9 === 0 ? 2.2 : 1.1, index % 9 === 0 ? 2.2 : 1.1);
  }

  // Build luminous orbital ribbons in two passes: a soft halo and a crisp filament.
    if (shadowContext) {
        shadowContext.save();
        shadowContext.shadowBlur = 18;
        shadowContext.shadowColor = 'rgba(76, 218, 246, 0.18)';
    }

    for (let ribbon = 0; ribbon < RIBBON_COUNT; ribbon += 1) {
        drawRibbon(p, frame, ribbon, phase, true);
    }

    if (shadowContext) {
        shadowContext.restore();
    }
  // Particles travel on the curves; re;Flux owns phase and retargeted pointer state.
  for (const particle of particles) {
    const progress = (particle.progress + phase / TAU * particle.speed) % 1;
    const point = ribbonPoint(progress, particle.ribbon, frame, phase);
    const cyan = particle.ribbon % 2 === 0;
    const color = cyan ? [72, 237, 250] : [182, 139, 255];
    const proximity = alphaForDistance(point.x, point.y, frame.pointer, width, height);
    for (let tail = 3; tail >= 1; tail -= 1) {
      const trailPoint = ribbonPoint(progress - tail * 0.009, particle.ribbon, frame, phase);
      p.stroke(color[0]!, color[1]!, color[2]!, 10 + (4 - tail) * 13 + proximity * 12);
      p.strokeWeight(Math.max(0.45, particle.radius * (0.32 + (4 - tail) * 0.1)));
      p.line(trailPoint.x, trailPoint.y, point.x, point.y);
    }
    p.noStroke();
    p.fill(color[0]!, color[1]!, color[2]!, 24 + proximity * 48);
    p.ellipse(point.x, point.y, particle.radius * 5.8, particle.radius * 5.8);
    p.fill(color[0]!, color[1]!, color[2]!, 100 + proximity * 100);
    p.ellipse(point.x, point.y, particle.radius * 1.65, particle.radius * 1.65);
    p.fill(230, 250, 255, 180 + proximity * 65);
    p.ellipse(point.x, point.y, particle.radius * 0.7, particle.radius * 0.7);
  }

  // The core is a compact brand anchor surrounded by spring-like orbital rings.
    if (shadowContext) {
        shadowContext.save();
        shadowContext.shadowBlur = 28;
        shadowContext.shadowColor = 'rgba(59, 220, 246, 0.34)';
    }
  p.noFill();
  p.stroke(49, 219, 244, 72);
  p.strokeWeight(1);
  p.push();
  p.translate(centerX, centerY);
  p.rotate(phase * 0.12);
  p.ellipse(0, 0, scale * 0.205, scale * 0.087);
  p.rotate(-phase * 0.24);
  p.stroke(172, 123, 255, 100);
  p.ellipse(0, 0, scale * 0.18, scale * 0.105);
  p.rotate(phase * 0.18);
  p.stroke(72, 222, 244, 70);
  p.ellipse(0, 0, scale * 0.245, scale * 0.128);
  p.pop();
    if (shadowContext) {
        shadowContext.restore();
    }

  p.noStroke();
  for (let ring = 5; ring >= 0; ring -= 1) {
    const diameter = scale * (0.104 + ring * 0.018);
    p.fill(64, 210, 245, 8 + (5 - ring) * 3);
    p.ellipse(centerX, centerY, diameter, diameter);
  }
  p.fill(10, 15, 30, 245);
  p.ellipse(centerX, centerY, scale * 0.115, scale * 0.115);
  p.stroke(167, 134, 255, 235);
  p.strokeWeight(1.4);
  p.noFill();
  p.ellipse(centerX, centerY, scale * 0.115, scale * 0.115);
  p.noStroke();
  p.fill(239, 246, 255, 245);
  p.textFont('monospace');
  p.textAlign(p.CENTER, p.CENTER);
  p.textSize(Math.max(12, Math.min(22, scale * 0.035)));
  p.text('re;', centerX, centerY + 1);

  if (frame.pointer) {
    const pointerX = frame.pointer.x * width;
    const pointerY = frame.pointer.y * height;
    const pulse = 7 + frame.config.springElasticity * 5 + Math.sin(phase * 2) * 1.5;
    p.noFill();
    p.stroke(60, 229, 247, 130);
    p.strokeWeight(1);
    p.ellipse(pointerX, pointerY, pulse * 2.2, pulse * 2.2);
    p.noStroke();
    p.fill(89, 237, 255, 190);
    p.ellipse(pointerX, pointerY, 3.3, 3.3);
  }
}
