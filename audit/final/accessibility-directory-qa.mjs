import { writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9333';
const baseUrl = 'http://127.0.0.1:5174';

async function session({ blockWebgl = false, mobile = false } = {}) {
  const target = await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((response) => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async (expression, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return true;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  };
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', { width: mobile ? 390 : 1440, height: mobile ? 844 : 1000, deviceScaleFactor: 1, mobile, screenWidth: mobile ? 390 : 1440, screenHeight: mobile ? 844 : 1000 });
  if (blockWebgl) await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(type, ...args) { return String(type).toLowerCase().includes('webgl') ? null : original.call(this, type, ...args); }; })();` });
  await command('Page.navigate', { url: `${baseUrl}/#/demo` });
  await waitFor(`Boolean(document.querySelector('.artwork-directory-toggle'))`);
  return { socket, command, evaluate, waitFor };
}

const report = { runAt: new Date().toISOString(), checks: [] };
const check = (name, pass, details) => report.checks.push({ name, pass: Boolean(pass), details });

{
  const browser = await session();
  const initial = await browser.evaluate(`(() => { const toggle = document.querySelector('.artwork-directory-toggle'); const view = document.querySelector('.view-switch'); const a = toggle.getBoundingClientRect(); const b = view.getBoundingClientRect(); return { label: toggle.getAttribute('aria-label'), height: a.height, overlapsViewSwitch: a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top }; })()`);
  check('directory toggle is visible, labelled, and clear of view controls', initial.height >= 44 && initial.label.includes('7 works') && !initial.overlapsViewSwitch, initial);
  await browser.evaluate(`document.querySelector('.artwork-directory-toggle').click()`);
  await browser.waitFor(`document.querySelectorAll('.artwork-directory-list li').length === 7 && document.querySelectorAll('.artwork-directory-list img').length === 7 && [...document.querySelectorAll('.artwork-directory-list img')].every((image) => image.complete && image.naturalWidth > 0)`);
  const opened = await browser.evaluate(`(() => { const panel = document.querySelector('.artwork-directory'); const works = [...document.querySelectorAll('.artwork-directory-list li')]; return { role: panel.getAttribute('role'), modal: panel.getAttribute('aria-modal'), count: works.length, titles: works.map((item) => item.querySelector('h3').innerText), images: works.map((item) => item.querySelector('img')?.naturalWidth ?? 0), metadata: works[0].innerText, focusInside: panel.contains(document.activeElement), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()`);
  check('directory exposes seven GLB-backed images and metadata', opened.role === 'dialog' && opened.modal === 'true' && opened.count === 7 && opened.images.every((width) => width > 0) && opened.metadata.includes('Mixed Media on Canvas') && opened.focusInside && opened.overflowX === 0, opened);
  const image = await browser.command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(new URL('./regression-artwork-directory-desktop.png', import.meta.url), Buffer.from(image.data, 'base64'));
  await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
  await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
  await browser.waitFor(`!document.querySelector('.artwork-directory')`);
  const closed = await browser.evaluate(`document.activeElement === document.querySelector('.artwork-directory-toggle')`);
  check('Escape closes directory and returns focus', closed, { focusReturned: closed });
  browser.socket.close();
}

{
  const browser = await session({ mobile: true });
  await browser.evaluate(`document.querySelector('.artwork-directory-toggle').click()`);
  await browser.waitFor(`document.querySelectorAll('.artwork-directory-list li').length === 7`);
  const mobile = await browser.evaluate(`(() => { const panel = document.querySelector('.artwork-directory').getBoundingClientRect(); const close = document.querySelector('.artwork-directory-header > button').getBoundingClientRect(); return { panel: panel.toJSON(), close: close.toJSON(), overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, viewport: [innerWidth, innerHeight] }; })()`);
  check('mobile directory fits viewport with a 44px close target', mobile.overflowX === 0 && mobile.panel.width === 390 && mobile.panel.height === 844 && mobile.close.width >= 44 && mobile.close.height >= 44, mobile);
  const image = await browser.command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(new URL('./regression-artwork-directory-mobile.png', import.meta.url), Buffer.from(image.data, 'base64'));
  browser.socket.close();
}

{
  const browser = await session({ blockWebgl: true });
  await browser.waitFor(`Boolean(document.querySelector('.scene-error')) && Boolean(document.querySelector('.artwork-directory'))`);
  const fallback = await browser.evaluate(`({ sceneError: document.querySelector('.scene-error')?.innerText, directoryOpen: Boolean(document.querySelector('.artwork-directory')), fallbackLabel: document.querySelector('.artwork-directory-toggle')?.getAttribute('aria-label'), works: document.querySelectorAll('.artwork-directory-list li').length, status: document.querySelector('.artwork-directory-summary [role="status"]')?.innerText })`);
  check('WebGL failure automatically opens the text-first exhibition', fallback.directoryOpen && fallback.works === 7 && fallback.fallbackLabel.includes('3D view is unavailable') && fallback.status.includes('3D view could not start'), fallback);
  browser.socket.close();
}

await writeFile(new URL('./accessibility-directory-qa.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.checks.some((item) => !item.pass)) process.exitCode = 1;
