import type { RendererId, RenderScene } from './types';

export function createScene(host: HTMLElement, renderer: RendererId, targetCount: number, canvasUnavailableMessage: string): RenderScene {
  host.replaceChildren();
  const columns = Math.max(8, Math.min(40, Math.ceil(Math.sqrt(targetCount * 1.05))));
  const opacityFrom = 0.38;
  const opacityTo = 0.96;

  if (renderer === 'dom') {
    const grid = document.createElement('div');
    grid.className = 'browser-benchmarks__dot-grid';
    grid.style.gridTemplateColumns = `repeat(${columns}, 7px)`;
    const nodes: HTMLDivElement[] = [];
    for (let index = 0; index < targetCount; index += 1) {
      const node = document.createElement('div');
      node.className = 'browser-benchmarks__dot';
      node.style.opacity = String(opacityFrom);
      nodes.push(node);
    }
    grid.append(...nodes);
    host.append(grid);
    return {
      targetCount,
      domTargets: nodes,
      render(progress) {
        const translateX = progress * 16;
        const rotation = progress * 90;
        const opacity = opacityFrom + (opacityTo - opacityFrom) * progress;
        const transform = `translate3d(${translateX.toFixed(2)}px, 0, 0) rotate(${rotation.toFixed(2)}deg)`;
        const opacityValue = String(opacity);
        for (const node of nodes) {
          node.style.transform = transform;
          node.style.opacity = opacityValue;
        }
      },
      cleanup: () => host.replaceChildren(),
    };
  }

  if (renderer === 'svg') {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 760 360');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${targetCount} animated SVG shapes`);
    svg.classList.add('browser-benchmarks__svg');
    const rows = Math.ceil(targetCount / columns);
    const cellWidth = 740 / columns;
    const cellHeight = 340 / Math.max(1, rows);
    const nodes: Array<{ element: SVGRectElement; x: number; y: number; }> = [];
    for (let index = 0; index < targetCount; index += 1) {
      const x = 10 + (index % columns) * cellWidth;
      const y = 10 + Math.floor(index / columns) * cellHeight;
      const rect = document.createElementNS(namespace, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', '5');
      rect.setAttribute('height', '5');
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', 'currentColor');
      rect.setAttribute('opacity', String(opacityFrom));
      svg.append(rect);
      nodes.push({ element: rect, x, y });
    }
    host.append(svg);
    return {
      targetCount,
      render(progress) {
        const translateX = progress * 16;
        const rotation = progress * 90;
        const opacity = String(opacityFrom + (opacityTo - opacityFrom) * progress);
        for (const node of nodes) {
          node.element.setAttribute('transform', `translate(${(node.x + translateX).toFixed(2)} ${node.y.toFixed(2)}) rotate(${rotation.toFixed(2)} ${node.x.toFixed(2)} ${node.y.toFixed(2)})`);
          node.element.setAttribute('opacity', opacity);
        }
      },
      cleanup: () => host.replaceChildren(),
    };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 360;
  canvas.className = 'browser-benchmarks__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${targetCount} animated Canvas shapes`);
  const context = canvas.getContext('2d');
  if (!context) throw new Error(canvasUnavailableMessage);
  const rows = Math.ceil(targetCount / columns);
  const cellWidth = 940 / columns;
  const cellHeight = 340 / Math.max(1, rows);
  const positions = Array.from({ length: targetCount }, (_, index) => ({
    x: 10 + (index % columns) * cellWidth,
    y: 10 + Math.floor(index / columns) * cellHeight,
  }));
  host.append(canvas);
  return {
    targetCount,
    render(progress) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const translateX = progress * 16;
      const rotation = progress * Math.PI / 2;
      const opacity = opacityFrom + (opacityTo - opacityFrom) * progress;
      context.fillStyle = getComputedStyle(host).color;
      for (const position of positions) {
        context.save();
        context.globalAlpha = opacity;
        context.translate(position.x + translateX, position.y);
        context.rotate(rotation);
        context.fillRect(-2.5, -2.5, 5, 5);
        context.restore();
      }
    },
    cleanup: () => host.replaceChildren(),
  };
}

export function createObjectScene(host: HTMLElement, targetCount: number): RenderScene {
  host.replaceChildren();
  const objectTargets = Array.from({ length: targetCount }, () => ({ value: 0 }));
  return {
    targetCount,
    objectTargets,
    render(progress) {
      for (const target of objectTargets) target.value = progress;
    },
    cleanup() {
      // Read the final values before releasing the targets so the benchmark workload remains observable.
      const finalValueChecksum = objectTargets.reduce((sum, target) => sum + target.value, 0);
      void finalValueChecksum;
      host.replaceChildren();
    },
  };
}
