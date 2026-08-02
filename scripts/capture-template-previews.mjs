import { mkdir, writeFile } from "node:fs/promises";

const endpoint = process.env.AURA_CDP_ENDPOINT ?? "http://127.0.0.1:9333";
const baseUrl = process.env.AURA_BASE_URL ?? "http://127.0.0.1:5174";
const outputDirectory = new URL("../public/assets/templates/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const target = await fetch(
  `${endpoint}/json/new?${encodeURIComponent(`${baseUrl}/#/create`)}`,
  { method: "PUT" },
).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(expression, timeout = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await wait(120);
  }
  throw new Error(`Timed out: ${expression}`);
}

async function navigate(path) {
  await command("Page.navigate", { url: `${baseUrl}${path}` });
  await waitFor(`document.readyState === 'complete'`);
  await wait(350);
}

async function prepareTemplate(templateId) {
  await navigate(`/#/create/${templateId}/demo`);
  await waitFor(`!!document.querySelector('.gallery-scene canvas')`);
  await wait(800);

  const hasRecovery = await evaluate(
    `!!document.querySelector('.recovery-dialog, [data-dialog="recovery"], .editor-modal')`,
  );
  if (hasRecovery) {
    await evaluate(
      `(() => { const button = [...document.querySelectorAll('.editor-modal button')].find((item) => /start fresh|discard/i.test(item.textContent || '')); button?.click(); })()`,
    );
    await wait(500);
  }

  await waitFor(
    `document.querySelectorAll('.artwork-list button').length === 3`,
    16000,
  );
  await evaluate(
    `document.querySelector('[data-roof-option="ceiling"]')?.click()`,
  );
  const canvas = await evaluate(
    `document.querySelector('.gallery-scene canvas').getBoundingClientRect().toJSON()`,
  );
  await command("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: canvas.x + canvas.width * 0.5,
    y: canvas.y + canvas.height * 0.5,
    deltaX: 0,
    deltaY: templateId === "pavilion" ? -260 : -190,
  });
  await wait(1200);
  await evaluate(`(() => {
    const style = document.createElement('style');
    style.textContent = '.canvas-badge,.builder-scene-controls,.pavilion-zone-nav,.room-turn,.scene-hint{display:none!important}';
    document.head.append(style);
  })()`);
  await wait(120);

  const clip = await evaluate(
    `(() => { const rect = document.querySelector('.gallery-scene canvas').getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 }; })()`,
  );
  const screenshot = await command("Page.captureScreenshot", {
    format: "webp",
    quality: 88,
    fromSurface: true,
    clip,
  });
  await writeFile(
    new URL(`${templateId}-preview.webp`, outputDirectory),
    Buffer.from(screenshot.data, "base64"),
  );
}

await Promise.all([
  command("Page.enable"),
  command("Runtime.enable"),
  command("DOM.enable"),
  command("Network.enable"),
  command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 820,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: 1280,
    screenHeight: 820,
  }),
]);

try {
  for (const templateId of ["white-cube", "nocturne", "pavilion"])
    await prepareTemplate(templateId);
} finally {
  socket.close();
  await fetch(`${endpoint}/json/close/${target.id}`, { method: "PUT" }).catch(
    () => undefined,
  );
}
