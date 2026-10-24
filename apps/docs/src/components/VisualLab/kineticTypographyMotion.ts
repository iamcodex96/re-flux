/**
 * Small autonomous glyph agents inspired by steering behaviours in The Nature of Code.
 * This is a docs-only study: each character seeks its home position, separates from nearby
 * glyphs, and is repelled by the pointer. It intentionally uses a single RAF loop per active stage.
 */
export interface KineticTypographyHandle {
  /** Scatter the glyphs slightly, then let steering forces settle them back into the word. */
  play(): void;
  /** Release the pointer force and return the glyphs to their home positions. */
  settle(immediate?: boolean): void;
  /** Stop the simulation and restore the exact original text nodes and accessibility attributes. */
  dispose(): void;
}

interface GlyphAgent {
  readonly element: HTMLSpanElement;
  readonly index: number;
  readonly character: string;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  readonly phase: number;
}

interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

const MAX_SPEED = 164;
const MAX_FORCE = 620;
const POINTER_RADIUS = 116;
const SEPARATION_DISTANCE = 17;
const REST_POSITION_EPSILON = 0.22;
const REST_VELOCITY_EPSILON = 2.4;

function clampMagnitude(x: number, y: number, maximum: number): PointerPoint {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= maximum || magnitude === 0) return { x, y };
  const ratio = maximum / magnitude;
  return { x: x * ratio, y: y * ratio };
}

function splitGraphemes(text: string): string[] {
  type Segment = { readonly segment: string };
  type SegmenterLike = { segment(input: string): Iterable<Segment> };
  type SegmenterConstructor = new (locale?: string, options?: { granularity: 'grapheme' }) => SegmenterLike;
  const Constructor = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter;
  return Constructor ? Array.from(new Constructor(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment) : Array.from(text);
}

export function createKineticTypography(target: HTMLElement): KineticTypographyHandle {
  const originalNodes = Array.from(target.childNodes);
  const originalText = target.textContent ?? '';
  const hadAriaLabel = target.hasAttribute('aria-label');
  const originalAriaLabel = target.getAttribute('aria-label');
  const wasActiveClass = target.classList.contains('is-kinetic-active');
  const documentRef = target.ownerDocument;
  if (!documentRef) throw new TypeError('Kinetic typography requires an element with an ownerDocument.');

  const fragment = documentRef.createDocumentFragment();
  const agents: GlyphAgent[] = splitGraphemes(originalText).map((character, index) => {
    const element = documentRef.createElement('span');
    element.textContent = character;
    element.setAttribute('aria-hidden', 'true');
    element.dataset.kineticGlyph = '';
    element.style.display = 'inline-block';
    element.style.whiteSpace = 'pre';
    element.style.transformOrigin = '50% 58%';
    element.style.transform = 'translate3d(0, 0, 0) rotate(0deg)';
    fragment.append(element);
    return {
      element,
      index,
      character,
      homeX: 0,
      homeY: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rotation: 0,
      phase: index * 2.399963229728653,
    };
  });

  target.replaceChildren(fragment);
  target.setAttribute('aria-label', hadAriaLabel ? (originalAriaLabel ?? '') : originalText);

  let pointer: PointerPoint | null = null;
  let running = false;
  let active = false;
  let disposed = false;
  let frameId: number | null = null;
  let lastTimestamp = 0;
  let elapsed = 0;
  let resizeObserver: ResizeObserver | null = null;

  const setTransform = (agent: GlyphAgent): void => {
    const tilt = agent.character.trim() ? agent.rotation : 0;
    agent.element.style.transform = `translate3d(${agent.x.toFixed(2)}px, ${agent.y.toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
  };

  const measureHomes = (): void => {
    const container = target.getBoundingClientRect();
    for (const agent of agents) {
      const rect = agent.element.getBoundingClientRect();
      // getBoundingClientRect includes the current transform; subtract it to preserve the layout anchor.
      agent.homeX = rect.left + rect.width / 2 - container.left - agent.x;
      agent.homeY = rect.top + rect.height / 2 - container.top - agent.y;
    }
  };

  const cancelFrame = (): void => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    lastTimestamp = 0;
    running = false;
  };

  const isResting = (): boolean => agents.every((agent) =>
    Math.abs(agent.x) < REST_POSITION_EPSILON &&
    Math.abs(agent.y) < REST_POSITION_EPSILON &&
    Math.abs(agent.vx) < REST_VELOCITY_EPSILON &&
    Math.abs(agent.vy) < REST_VELOCITY_EPSILON,
  );

  const snapHome = (): void => {
    for (const agent of agents) {
      agent.x = 0;
      agent.y = 0;
      agent.vx = 0;
      agent.vy = 0;
      agent.rotation = 0;
      setTransform(agent);
    }
    target.classList.remove('is-kinetic-active');
  };

  const stepAgent = (agent: GlyphAgent, dt: number): void => {
    if (!agent.character.trim()) {
      agent.x = 0;
      agent.y = 0;
      agent.vx = 0;
      agent.vy = 0;
      setTransform(agent);
      return;
    }

    // Seek: compute a desired velocity towards the glyph's original layout position.
    const homeDistance = Math.hypot(agent.x, agent.y);
    const desiredSpeed = Math.min(MAX_SPEED, homeDistance * 5.2);
    let desiredVx = 0;
    let desiredVy = 0;
    if (homeDistance > 0.001) {
      desiredVx = (-agent.x / homeDistance) * desiredSpeed;
      desiredVy = (-agent.y / homeDistance) * desiredSpeed;
    }
    const seek = clampMagnitude(desiredVx - agent.vx, desiredVy - agent.vy, MAX_FORCE);
    let ax = seek.x;
    let ay = seek.y;

    // Separation: keep characters from piling up when neighbouring glyphs are displaced.
    const positionX = agent.homeX + agent.x;
    const positionY = agent.homeY + agent.y;
    let separationX = 0;
    let separationY = 0;
    let neighbours = 0;
    for (const other of agents) {
      if (other === agent || !other.character.trim()) continue;
      const dx = positionX - (other.homeX + other.x);
      const dy = positionY - (other.homeY + other.y);
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.001 || distance >= SEPARATION_DISTANCE) continue;
      const strength = (SEPARATION_DISTANCE - distance) / SEPARATION_DISTANCE;
      separationX += (dx / distance) * strength;
      separationY += (dy / distance) * strength;
      neighbours += 1;
    }
    if (neighbours > 0) {
      const separation = clampMagnitude(separationX / neighbours * MAX_FORCE, separationY / neighbours * MAX_FORCE, MAX_FORCE * 0.8);
      ax += separation.x;
      ay += separation.y;
    }

    // Flee: a soft inverse-distance force pushes nearby glyphs away from the pointer.
    if (pointer) {
      const dx = positionX - pointer.x;
      const dy = positionY - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < POINTER_RADIUS) {
        const direction = distance > 0.001 ? { x: dx / distance, y: dy / distance } : { x: Math.cos(agent.phase), y: Math.sin(agent.phase) };
        const influence = 1 - distance / POINTER_RADIUS;
        const force = influence * influence * 920;
        ax += direction.x * force;
        ay += direction.y * force;
        // A little wandering gives the steering response a living, non-mechanical quality.
        ax += Math.cos(elapsed * 1.45 + agent.phase) * influence * 26;
        ay += Math.sin(elapsed * 1.3 + agent.phase) * influence * 26;
      }
    }

    const acceleration = clampMagnitude(ax, ay, MAX_FORCE * 1.8);
    agent.vx = (agent.vx + acceleration.x * dt) * Math.exp(-2.7 * dt);
    agent.vy = (agent.vy + acceleration.y * dt) * Math.exp(-2.7 * dt);
    const velocity = clampMagnitude(agent.vx, agent.vy, MAX_SPEED);
    agent.vx = velocity.x;
    agent.vy = velocity.y;
    agent.x += agent.vx * dt;
    agent.y += agent.vy * dt;
    agent.rotation = Math.max(-9, Math.min(9, agent.x * 0.19 + agent.vx * 0.018));
    setTransform(agent);
  };

  const tick = (timestamp: number): void => {
    frameId = null;
    if (disposed || documentRef.visibilityState === 'hidden') {
      running = false;
      lastTimestamp = 0;
      return;
    }
    const dt = lastTimestamp === 0 ? 1 / 60 : Math.min(0.032, Math.max(0.001, (timestamp - lastTimestamp) / 1000));
    lastTimestamp = timestamp;
    elapsed += dt;
    agents.forEach((agent) => stepAgent(agent, dt));

    if (pointer === null && isResting()) {
      snapHome();
      cancelFrame();
      return;
    }
    frameId = requestAnimationFrame(tick);
  };

  const ensureFrame = (): void => {
    if (disposed || frameId !== null || documentRef.visibilityState === 'hidden') return;
    running = true;
    frameId = requestAnimationFrame(tick);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!active || disposed) return;
    const rect = target.getBoundingClientRect();
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    target.classList.add('is-kinetic-active');
    ensureFrame();
  };

  const onPointerLeave = (): void => {
    pointer = null;
    if (active) ensureFrame();
  };

  const onVisibilityChange = (): void => {
    if (documentRef.visibilityState === 'hidden') {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      lastTimestamp = 0;
      running = false;
    } else if (running || active || !isResting()) {
      ensureFrame();
    }
  };

  target.addEventListener('pointermove', onPointerMove, { passive: true });
  target.addEventListener('pointerleave', onPointerLeave, { passive: true });
  documentRef.addEventListener('visibilitychange', onVisibilityChange);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      measureHomes();
      if (active) ensureFrame();
    });
    resizeObserver.observe(target);
  }
  measureHomes();

  return {
    play(): void {
      if (disposed || agents.length === 0) return;
      active = true;
      elapsed = 0;
      pointer = null;
      target.classList.add('is-kinetic-active');
      agents.forEach((agent) => {
        if (!agent.character.trim()) return;
        const angle = agent.phase;
        const radius = 9 + (agent.index % 4) * 4;
        agent.x = Math.cos(angle) * radius;
        agent.y = Math.sin(angle) * radius + ((agent.index % 3) - 1) * 7;
        agent.vx = Math.cos(angle + 1.1) * 18;
        agent.vy = Math.sin(angle + 0.7) * 18;
        agent.rotation = ((agent.index % 5) - 2) * 3.5;
        setTransform(agent);
      });
      measureHomes();
      ensureFrame();
    },
    settle(immediate = false): void {
      active = false;
      pointer = null;
      if (immediate) {
        cancelFrame();
        snapHome();
        return;
      }
      if (!isResting()) ensureFrame();
      else snapHome();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cancelFrame();
      resizeObserver?.disconnect();
      resizeObserver = null;
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerleave', onPointerLeave);
      documentRef.removeEventListener('visibilitychange', onVisibilityChange);
      target.replaceChildren(...originalNodes);
      if (hadAriaLabel) target.setAttribute('aria-label', originalAriaLabel ?? '');
      else target.removeAttribute('aria-label');
      if (!wasActiveClass) target.classList.remove('is-kinetic-active');
      for (const agent of agents) agent.element.style.willChange = '';
    },
  };
}
