import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureHtml = await readFile(path.join(root, 'tests/browser/fixture.html'), 'utf8');
const bundle = await build({
  entryPoints: [path.join(root, 'tests/browser/fixture.ts')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: path.join(root, 'dist/browser-integration/fixture.js'),
  write: false,
  logLevel: 'silent',
});
const fixtureJavaScript = bundle.outputFiles.find((output) => output.path.endsWith('.js'))?.text;
assert.ok(fixtureJavaScript, 'Expected esbuild to emit the browser fixture bundle.');

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/' || pathname === '/fixture.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixtureHtml);
    return;
  }
  if (pathname === '/fixture.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixtureJavaScript);
    return;
  }
  response.writeHead(404);
  response.end('Not found');
});

let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string', 'Expected the fixture server to bind to a TCP port.');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new Error(
      'Chromium is not installed for Playwright. Run "npx playwright install chromium" before the browser integration checks.',
      { cause: error },
    );
  }

  const runCase = async (name, test) => {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    try {
      page.setDefaultTimeout(10_000);
    await page.goto(baseUrl, { waitUntil: 'load' });
      await page.waitForFunction(() => typeof window.__reFluxBrowserTest !== 'undefined');
      await test(page);
      assert.deepEqual(pageErrors, [], `Unexpected browser runtime errors: ${pageErrors.join('; ')}`);
      process.stdout.write(`✓ ${name}\n`);
    } finally {
      await page.close();
    }
  };

  await runCase('pointer capture continues a drag outside the target and releases on pointerup', async (page) => {
    const box = await page.locator('#gesture-target').boundingBox();
    assert.ok(box, 'Expected a measurable gesture target.');
    await page.evaluate(() => window.__reFluxBrowserTest.startPointerGestures());
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.waitForFunction(() => window.__reFluxBrowserTest.pointerState().events.some((event) => event.type === 'down'));

    const pointerId = await page.evaluate(() => window.__reFluxBrowserTest.pointerState().events[0]?.pointerId);
    assert.equal(typeof pointerId, 'number');
    assert.equal(
      await page.evaluate((id) => document.querySelector('#gesture-target').hasPointerCapture(id), pointerId),
      true,
      'Expected the target to capture the active pointer.',
    );

    const outsideX = box.x + box.width + 40;
    await page.mouse.move(outsideX, box.y + 20);
    await page.waitForFunction(
      (x) => window.__reFluxBrowserTest.pointerState().events.some((event) => event.type === 'move' && event.x >= x),
      outsideX,
    );
    await page.mouse.up();
    await page.waitForFunction(() => window.__reFluxBrowserTest.pointerState().events.some((event) => event.type === 'up'));

    const state = await page.evaluate(() => window.__reFluxBrowserTest.pointerState());
    assert.deepEqual(state.events.map((event) => event.type), ['down', 'move', 'up']);
    assert.equal(state.error, null);
    assert.equal(
      await page.evaluate((id) => document.querySelector('#gesture-target').hasPointerCapture(id), pointerId),
      false,
      'Expected pointer capture to be released after pointerup.',
    );
    await page.evaluate(() => window.__reFluxBrowserTest.stopPointerGestures());
  });

  await runCase('pointercancel ends the active gesture and releases capture without stale move events', async (page) => {
    const box = await page.locator('#gesture-target').boundingBox();
    assert.ok(box, 'Expected a measurable gesture target.');
    await page.evaluate(() => window.__reFluxBrowserTest.startPointerGestures());
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.waitForFunction(() => window.__reFluxBrowserTest.pointerState().events.some((event) => event.type === 'down'));
    const pointerId = await page.evaluate(() => window.__reFluxBrowserTest.pointerState().events[0]?.pointerId);
    assert.equal(typeof pointerId, 'number');

    await page.evaluate((id) => {
      window.dispatchEvent(new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: id,
        clientX: 90,
        clientY: 90,
      }));
    }, pointerId);
    await page.waitForFunction(() => window.__reFluxBrowserTest.pointerState().events.some((event) => event.type === 'cancel'));
    await page.mouse.move(box.x + box.width + 60, box.y + 20);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const state = await page.evaluate(() => window.__reFluxBrowserTest.pointerState());
    assert.deepEqual(state.events.map((event) => event.type), ['down', 'cancel']);
    assert.equal(
      await page.evaluate((id) => document.querySelector('#gesture-target').hasPointerCapture(id), pointerId),
      false,
      'Expected capture to be released when the gesture is cancelled.',
    );
    await page.mouse.up();
    await page.evaluate(() => window.__reFluxBrowserTest.stopPointerGestures());
  });

  await runCase('DOM style binding restores original inline values and !important priority', async (page) => {
    await page.evaluate(() => window.__reFluxBrowserTest.startStyleBinding());
    await page.evaluate(() => window.__reFluxBrowserTest.emitStyles({ opacity: '0.8', transform: 'translateX(12px)' }));
    const active = await page.evaluate(() => window.__reFluxBrowserTest.styleState());
    assert.equal(active.opacity, '0.8');
    assert.equal(active.transform, 'translateX(12px)');

    await page.evaluate(() => window.__reFluxBrowserTest.emitStyles({ opacity: '0.6' }));
    const omittedTransform = await page.evaluate(() => window.__reFluxBrowserTest.styleState());
    assert.equal(omittedTransform.opacity, '0.6');
    assert.equal(omittedTransform.transform, '', 'A property omitted from a later snapshot should return to its original declaration.');

    await page.evaluate(() => window.__reFluxBrowserTest.stopStyleBinding());
    const restored = await page.evaluate(() => window.__reFluxBrowserTest.styleState());
    assert.deepEqual(restored, {
      opacity: '0.25',
      opacityPriority: 'important',
      transform: '',
      color: 'rgb(12, 34, 56)',
    });
  });

  await runCase('SVG attribute binding restores removed, modified, and omitted attributes', async (page) => {
    await page.evaluate(() => window.__reFluxBrowserTest.startSvgBinding());
    await page.evaluate(() => window.__reFluxBrowserTest.emitSvgAttributes({ fill: 'blue', cx: null, r: 8 }));
    assert.deepEqual(await page.evaluate(() => window.__reFluxBrowserTest.svgState()), {
      fill: 'blue', cx: null, r: '8',
    });

    await page.evaluate(() => window.__reFluxBrowserTest.emitSvgAttributes({ fill: null }));
    assert.deepEqual(await page.evaluate(() => window.__reFluxBrowserTest.svgState()), {
      fill: null, cx: '4', r: '2',
    });

    await page.evaluate(() => window.__reFluxBrowserTest.stopSvgBinding());
    assert.deepEqual(await page.evaluate(() => window.__reFluxBrowserTest.svgState()), {
      fill: 'red', cx: '4', r: '2',
    });
  });

  await runCase('FLIP applies an inverted layout transform and restores its original transform on dispose', async (page) => {
    const measurement = await page.evaluate(() => window.__reFluxBrowserTest.runFlip());
    assert.equal(measurement.afterMutationLeft, 180);
    assert.match(measurement.invertedTransform, /translate\(-160px, 0px\)/);
    assert.equal(measurement.invertedOrigin, '0px 0px');
    assert.ok(
      Math.abs(measurement.invertedLeft - measurement.beforeLeft) < 2,
      `Expected the inverted layout to preserve the old visual position; before=${measurement.beforeLeft}, inverted=${measurement.invertedLeft}.`,
    );

    const restored = await page.evaluate(() => window.__reFluxBrowserTest.disposeFlip());
    assert.equal(restored.left, '180px', 'FLIP should keep the application-owned layout mutation.');
    assert.equal(restored.transform, 'translateX(4px)');
    assert.equal(restored.transformOrigin, 'center center');
  });

  await runCase('Canvas teardown cancels queued writes and clears pixels without leaking coordinator work', async (page) => {
    // Keep queue inspection and teardown in one browser task. Separate page.evaluate calls allow
    // requestAnimationFrame to run between them, making this cancellation contract timing-dependent.
    const { queued, cancelled } = await page.evaluate(() => {
      const browserTest = window.__reFluxBrowserTest;
      browserTest.startCanvasBinding();
      browserTest.emitCanvasColor('rgb(255, 0, 0)');
      const queued = browserTest.canvasState();
      browserTest.stopCanvasBinding();
      const cancelled = browserTest.canvasState();
      return { queued, cancelled };
    });
    assert.equal(queued.coordinator.pendingWriteTasks, 1);

    assert.equal(cancelled.draws, 0, 'A queued draw must not execute after its binding is disposed.');
    assert.deepEqual(cancelled.pixel, [0, 0, 0, 0]);
    assert.equal(cancelled.coordinator.isIdle, true);

    await page.evaluate(() => window.__reFluxBrowserTest.startCanvasBinding());
    await page.evaluate(() => window.__reFluxBrowserTest.emitCanvasColor('rgb(0, 0, 255)'));
    await page.waitForFunction(() => window.__reFluxBrowserTest.canvasState().pixel[3] === 255);
    const drawn = await page.evaluate(() => window.__reFluxBrowserTest.canvasState());
    assert.deepEqual(drawn.pixel, [0, 0, 255, 255]);
    assert.equal(drawn.draws, 1);

    await page.evaluate(() => window.__reFluxBrowserTest.stopCanvasBinding());
    const disposed = await page.evaluate(() => window.__reFluxBrowserTest.canvasState());
    assert.deepEqual(disposed.pixel, [0, 0, 0, 0]);
    assert.equal(disposed.coordinator.isIdle, true);
  });

  await runCase('prefers-reduced-motion finishes opted-in finite animations without affecting unrelated animations', async (page) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__reFluxBrowserTest.startMotionAnimations({ includeUnmanaged: true }));
    await page.waitForFunction(() => {
      const state = window.__reFluxBrowserTest.motionAnimationState();
      return state.state === 'running' && state.progress !== null && state.progress > 0;
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => {
      const state = window.__reFluxBrowserTest.motionAnimationState();
      return state.preferences?.reducedMotion === true && state.state === 'completed';
    });

    const state = await page.evaluate(() => window.__reFluxBrowserTest.motionAnimationState());
    assert.equal(state.callbacks.completes, 1, 'Reduced motion should complete the finite opt-in animation exactly once.');
    assert.equal(state.progress, 1);
    assert.equal(state.unmanagedState, 'running', 'Animations without a motion policy must remain independent.');
    await page.evaluate(() => window.__reFluxBrowserTest.stopMotionAnimations());
  });

  await runCase('prefers-reduced-motion ignore policy keeps opted-in playback running', async (page) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__reFluxBrowserTest.startMotionAnimations({ reducedMotion: 'ignore' }));
    await page.waitForFunction(() => {
      const state = window.__reFluxBrowserTest.motionAnimationState();
      return state.state === 'running' && state.progress !== null && state.progress > 0;
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__reFluxBrowserTest.motionAnimationState().preferences?.reducedMotion === true);
    const before = await page.evaluate(() => window.__reFluxBrowserTest.motionAnimationState());
    assert.equal(before.state, 'running');
    assert.equal(before.callbacks.completes, 0);
    await page.waitForFunction((progress) => {
      const state = window.__reFluxBrowserTest.motionAnimationState();
      return state.state === 'running' && state.progress !== null && state.progress > progress;
    }, before.progress);
    await page.evaluate(() => window.__reFluxBrowserTest.stopMotionAnimations());
  });

  await runCase('hidden document pauses playback and visible document resumes from the held progress', async (page) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__reFluxBrowserTest.startMotionAnimations({ pauseWhenHidden: true }));
    await page.waitForFunction(() => {
      const state = window.__reFluxBrowserTest.motionAnimationState();
      return state.state === 'running' && state.progress !== null && state.progress > 0;
    });

    try {
      await page.evaluate(() => window.__reFluxBrowserTest.setDocumentVisibility(false));
      await page.waitForFunction(() => {
        const state = window.__reFluxBrowserTest.motionAnimationState();
        return state.preferences?.visible === false && state.state === 'paused';
      });
      const paused = await page.evaluate(() => window.__reFluxBrowserTest.motionAnimationState());

      await page.evaluate(() => window.__reFluxBrowserTest.setDocumentVisibility(true));
      await page.waitForFunction(() => {
        const state = window.__reFluxBrowserTest.motionAnimationState();
        return state.preferences?.visible === true && state.state === 'running' && state.callbacks.resumes === 1;
      });
      const resumed = await page.evaluate(() => window.__reFluxBrowserTest.motionAnimationState());
      assert.equal(resumed.callbacks.pauses, 1);
      assert.equal(resumed.callbacks.resumes, 1);
      assert.ok(paused.progress !== null && resumed.progress !== null);
      assert.ok(resumed.progress >= paused.progress, 'Resumed playback must not rewind its playhead.');
    } finally {
      await page.evaluate(() => window.__reFluxBrowserTest.stopMotionAnimations());
    }
  });

  await runCase('explicit pause while hidden prevents automatic resume when the document becomes visible', async (page) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => window.__reFluxBrowserTest.startMotionAnimations({ pauseWhenHidden: true }));
    await page.waitForFunction(() => {
      const state = window.__reFluxBrowserTest.motionAnimationState();
      return state.state === 'running' && state.progress !== null && state.progress > 0;
    });

    try {
      await page.evaluate(() => window.__reFluxBrowserTest.setDocumentVisibility(false));
      await page.waitForFunction(() => {
        const state = window.__reFluxBrowserTest.motionAnimationState();
        return state.preferences?.visible === false && state.state === 'paused';
      });
      await page.evaluate(() => window.__reFluxBrowserTest.explicitlyPauseMotionAnimation());
      const explicitlyPaused = await page.evaluate(() => window.__reFluxBrowserTest.motionAnimationState());

      await page.evaluate(() => window.__reFluxBrowserTest.setDocumentVisibility(true));
      await page.waitForFunction(() => window.__reFluxBrowserTest.motionAnimationState().preferences?.visible === true);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const afterVisibility = await page.evaluate(() => window.__reFluxBrowserTest.motionAnimationState());
      assert.equal(afterVisibility.state, 'paused', 'An explicit user pause must not be overridden by visibility recovery.');
      assert.equal(afterVisibility.callbacks.resumes, 0);
      assert.equal(afterVisibility.progress, explicitlyPaused.progress);
    } finally {
      await page.evaluate(() => window.__reFluxBrowserTest.stopMotionAnimations());
    }
  });

  process.stdout.write('Browser integration checks passed (10 cases).\n');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
