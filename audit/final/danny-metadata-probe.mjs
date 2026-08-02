const endpoint = 'http://127.0.0.1:9333';
const baseUrl = 'http://127.0.0.1:5174';
const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${baseUrl}/#/demo`)}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
const pending = new Map();
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
});
const command = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); socket.send(JSON.stringify({ id: requestId, method, params })); });
const evaluate = async (expression) => (await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
await Promise.all([command('Page.enable'), command('Runtime.enable')]);
await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false, screenWidth: 1440, screenHeight: 1000 });
for (let index = 0; index < 60 && !(await evaluate(`Number(document.querySelector('.gallery-scene')?.dataset.artworkTargets) > 0`)); index += 1) await wait(250);
await evaluate(`[...document.querySelectorAll('.view-switch button')].find((button) => button.innerText.toLowerCase().includes('overview'))?.click()`);
await wait(500);
const coordinates = [];
for (let y = 150; y <= 900; y += 40) for (let x = 40; x <= 1400; x += 40) coordinates.push({ x, y });
let hit = null;
for (const point of coordinates) {
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
  await wait(12);
  if (await evaluate(`Boolean(document.querySelector('.artwork-info'))`)) { hit = point; break; }
}
const info = await evaluate(`({
  targets: document.querySelector('.gallery-scene')?.dataset.artworkTargets,
  hit: Boolean(document.querySelector('.artwork-info')),
  title: document.querySelector('.artwork-info h2')?.innerText ?? null,
  byline: document.querySelector('.artwork-info h2 + span')?.innerText ?? null,
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition
})`);
console.log(JSON.stringify({ hitAt: hit, info }, null, 2));
socket.close();
await fetch(`${endpoint}/json/close/${target.id}`).catch(() => null);
