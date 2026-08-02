import { mkdir, writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9333';
const demoUrl = 'http://127.0.0.1:5174/#/demo';
const output = new URL('./regression-demo-mobile-optimized.png', import.meta.url);
await mkdir(new URL('./', import.meta.url), { recursive: true });

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const diagnostics = [];
const requests = [];

socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }
  if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn'].includes(message.params.type)) {
    diagnostics.push({
      type: message.params.type,
      message: message.params.args.map((argument) => argument.value ?? argument.description ?? argument.type).join(' '),
    });
  }
  if (message.method === 'Runtime.exceptionThrown') {
    diagnostics.push({
      type: 'exception',
      message: message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text,
    });
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) {
    diagnostics.push({ type: message.params.entry.level, message: message.params.entry.text, url: message.params.entry.url });
  }
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function waitFor(expression, timeout = 16000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await wait(150);
  }
  return false;
}

try {
  await Promise.all([
    command('Page.enable'),
    command('Runtime.enable'),
    command('Log.enable'),
    command('Network.enable'),
  ]);
  await command('Network.setCacheDisabled', { cacheDisabled: true });
  await command('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 390,
    screenHeight: 844,
  });
  await command('Page.navigate', { url: demoUrl });

  const loaded = await waitFor(`
    document.querySelector('.gallery-scene')?.dataset.modelVariant === 'mobile'
      && Number(document.querySelector('.gallery-scene')?.dataset.artworkTargets) > 0
      && document.querySelector('.demo-loading-poster.is-ready')?.getAttribute('aria-hidden') === 'true'
  `);

  const posterLayer = await evaluate(`(() => {
    const scene = document.querySelector('.viewer-scene-layer > .gallery-scene');
    const poster = document.querySelector('.demo-loading-poster');
    const centerStack = document.elementsFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      exists: Boolean(poster),
      ready: poster?.classList.contains('is-ready') ?? false,
      ariaHidden: poster?.getAttribute('aria-hidden') ?? null,
      posterZIndex: poster ? getComputedStyle(poster).zIndex : null,
      sceneZIndex: scene ? getComputedStyle(scene).zIndex : null,
      topAtCenter: centerStack[0]?.tagName ?? null,
      posterIsTopAtCenter: Boolean(centerStack[0]?.closest('.demo-loading-poster')),
      canvasAheadOfPoster: centerStack.some((element) => element.tagName === 'CANVAS')
        && centerStack.indexOf(scene?.querySelector('canvas')) < centerStack.indexOf(poster),
    };
  })()`);

  await evaluate(`
    [...document.querySelectorAll('.view-switch button')]
      .find((button) => button.innerText.toLowerCase().includes('overview'))?.click()
  `);
  await wait(450);
  await evaluate(`
    [...document.querySelectorAll('.view-switch button')]
      .find((button) => button.innerText.toLowerCase().includes('walk'))?.click()
  `);
  await wait(500);

  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 195, y: 420, button: 'left', buttons: 1, clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 195, y: 420, button: 'left', buttons: 0, clickCount: 1 });
  const metadataOpened = await waitFor(`Boolean(document.querySelector('.artwork-info'))`, 3000);

  const state = await evaluate(`(() => {
    const scene = document.querySelector('.gallery-scene');
    const info = document.querySelector('.artwork-info');
    return {
      viewport: [innerWidth, innerHeight],
      quality: scene?.dataset.quality ?? null,
      modelVariant: scene?.dataset.modelVariant ?? null,
      meshoptWorkers: Number(scene?.dataset.meshoptWorkers || 0),
      intro: scene?.dataset.intro ?? null,
      loadProgress: scene?.dataset.loadProgress ?? null,
      artworkTargets: Number(scene?.dataset.artworkTargets || 0),
      artworkHotspots: Number(scene?.dataset.artworkHotspots || 0),
      hitMode: scene?.dataset.artworkHitMode ?? null,
      lastArtworkHit: scene?.dataset.lastArtworkHit ?? null,
      poster: {
        exists: Boolean(document.querySelector('.demo-loading-poster')),
        ready: document.querySelector('.demo-loading-poster')?.classList.contains('is-ready') ?? false,
        ariaHidden: document.querySelector('.demo-loading-poster')?.getAttribute('aria-hidden') ?? null,
      },
      metadata: info ? {
        title: info.querySelector('h2')?.innerText ?? null,
        byline: info.querySelector('h2 + span')?.innerText ?? null,
        description: info.querySelector('h2 + span + p')?.innerText ?? null,
      } : null,
      resources: performance.getEntriesByType('resource').map((entry) => entry.name),
    };
  })()`);

  const allRequests = [...new Set([...requests, ...state.resources])];
  const mobileModelRequested = allRequests.some((url) => /\/danny-gallery-mobile\.glb(?:\?|$)/.test(url));
  const fullModelRequested = allRequests.some((url) => /\/danny-gallery\.glb(?:\?|$)/.test(url));
  const consoleErrors = diagnostics.filter((entry) => ['error', 'exception'].includes(entry.type));
  const checks = {
    loaded,
    mobileVariant: state.modelVariant === 'mobile' && state.quality === 'low',
    mobileModelRequested,
    fullModelNotRequested: !fullModelRequested,
    posterBehindCanvas: posterLayer.exists
      && posterLayer.ready
      && posterLayer.ariaHidden === 'true'
      && Number(posterLayer.posterZIndex) < Number(posterLayer.sceneZIndex)
      && !posterLayer.posterIsTopAtCenter
      && posterLayer.canvasAheadOfPoster,
    loadComplete: state.loadProgress === '100' && state.intro === 'complete',
    meshoptWorkerActive: state.meshoptWorkers >= 1,
    sevenArtworkHotspots: state.artworkTargets === 7 && state.artworkHotspots === 7,
    metadataOpened: metadataOpened
      && Boolean(state.metadata?.title)
      && state.metadata?.byline?.toLowerCase().includes('danny hirsch')
      && Boolean(state.metadata?.description)
      && ['raycast', 'screen-fallback'].includes(state.hitMode),
    noConsoleErrors: consoleErrors.length === 0,
  };

  const image = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(output, Buffer.from(image.data, 'base64'));

  const report = {
    pass: Object.values(checks).every(Boolean),
    checks,
    state: { ...state, posterLayer, resources: allRequests.filter((url) => url.includes('danny-gallery')) },
    diagnostics,
    screenshot: output.pathname,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`).catch(() => null);
}
