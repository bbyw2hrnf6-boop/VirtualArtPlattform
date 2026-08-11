import { mkdir, writeFile } from "node:fs/promises";

const endpoint = "http://127.0.0.1:9333";
const baseUrl = "http://127.0.0.1:5174";
const outDir = new URL("./", import.meta.url);
await mkdir(outDir, { recursive: true });

const target = await fetch(
  `${endpoint}/json/new?${encodeURIComponent("about:blank")}`,
  { method: "PUT" },
).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
let stage = "bootstrap";
const pending = new Map();
const events = new Map();
const diagnostics = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
    return;
  }
  if (
    message.method === "Runtime.consoleAPICalled" &&
    ["error", "warning", "warn"].includes(message.params.type)
  ) {
    diagnostics.push({
      stage,
      type: message.params.type,
      message: message.params.args
        .map(
          (argument) => argument.value ?? argument.description ?? argument.type,
        )
        .join(" "),
    });
  }
  if (message.method === "Runtime.exceptionThrown") {
    diagnostics.push({
      stage,
      type: "exception",
      message:
        message.params.exceptionDetails?.exception?.description ??
        message.params.exceptionDetails?.text,
    });
  }
  if (
    message.method === "Log.entryAdded" &&
    ["error", "warning"].includes(message.params.entry.level)
  ) {
    diagnostics.push({
      stage,
      type: message.params.entry.level,
      message: message.params.entry.text,
      url: message.params.entry.url,
    });
  }
  const listeners = events.get(message.method);
  if (listeners)
    listeners.splice(0).forEach((resolve) => resolve(message.params));
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function once(method, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout: ${method}`)),
      timeout,
    );
    const listeners = events.get(method) ?? [];
    listeners.push((value) => {
      clearTimeout(timer);
      resolve(value);
    });
    events.set(method, listeners);
  });
}

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text,
    );
  }
  return response.result.value;
}

async function waitFor(expression, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await wait(180);
  }
  return false;
}

async function viewport(width, height, mobile = false) {
  await command("Emulation.clearDeviceMetricsOverride").catch(() => undefined);
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function navigate(path, delay = 700) {
  const loaded = once("Page.loadEventFired").catch(() => null);
  await command("Page.navigate", { url: `${baseUrl}${path}` });
  await loaded;
  await wait(delay);
}

async function clearOrigin() {
  await command("Storage.clearDataForOrigin", {
    origin: baseUrl,
    storageTypes: "all",
  });
}

async function screenshot(name) {
  const image = await command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(
    new URL(`${name}.png`, outDir),
    Buffer.from(image.data, "base64"),
  );
}

await Promise.all([
  command("Page.enable"),
  command("Runtime.enable"),
  command("Log.enable"),
]);

const report = {
  runAt: new Date().toISOString(),
  target: baseUrl,
  checks: [],
  diagnostics,
};
const check = (name, pass, details) =>
  report.checks.push({ name, pass: Boolean(pass), details });

await clearOrigin();
await viewport(1440, 1000);

stage = "demo-sandbox";
await navigate("/#/create/white-cube/demo", 850);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.captureReady === 'true'`,
  10000,
);
await waitFor(`document.querySelectorAll('.artwork-list button').length === 3`);
report.demoSandbox = await evaluate(`({
  hash: location.hash,
  title: document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value,
  artist: document.querySelector('.studio-title input[aria-label="Artist name"]')?.value,
  artworks: document.querySelectorAll('.artwork-list button').length,
  layout: document.querySelector('.gallery-scene')?.dataset.artworkLayout,
  recovery: Boolean(document.querySelector('.recovery-dialog')),
  canvas: document.querySelectorAll('.gallery-scene canvas').length
})`);
check(
  "demo sandbox opens with three ready-to-edit works",
  report.demoSandbox.hash === "#/create/white-cube/demo" &&
    report.demoSandbox.title === "Field Studies" &&
    report.demoSandbox.artist === "AURA sample collection" &&
    report.demoSandbox.artworks === 3 &&
    report.demoSandbox.layout.split("|").length === 3 &&
    !report.demoSandbox.recovery &&
    report.demoSandbox.canvas === 1,
  report.demoSandbox,
);

await evaluate(`document.querySelector('.artwork-list button')?.click()`);
await waitFor(`Boolean(document.querySelector('.artwork-dimensions strong'))`);
await evaluate(`(() => {
  const canvas = document.querySelector('.gallery-scene canvas');
  window.__closureCanvas = canvas;
  canvas.dataset.qaIdentity = 'audit-closure';
})()`);
report.inspector = await evaluate(`({
  dimensions: document.querySelector('.artwork-dimensions strong')?.innerText,
  frameChoices: [...document.querySelectorAll('.placement .choices button')].map((button) => button.innerText.trim().toLowerCase()),
  shortcuts: [...document.querySelectorAll('.placement-actions button')].map((button) => button.innerText.trim()),
  stateActions: [...document.querySelectorAll('.artwork-state-actions button')].map((button) => button.innerText.trim())
})`);
check(
  "precision inspector exposes physical size, frame, state and alignment tools",
  /\d+ × \d+ cm/.test(report.inspector.dimensions) &&
    ["black", "white", "oak", "none"].every((frame) =>
      report.inspector.frameChoices.includes(frame),
    ) &&
    ["ALIGN LEFT", "CENTER ON WALL", "ALIGN RIGHT", "SPACE THIS WALL"].every(
      (label) => report.inspector.shortcuts.includes(label),
    ) &&
    report.inspector.stateActions.includes("Lock placement") &&
    report.inspector.stateActions.includes("Hide in gallery"),
  report.inspector,
);

await evaluate(
  `[...document.querySelectorAll('.artwork-state-actions button')].find((button) => button.innerText.includes('Lock placement'))?.click()`,
);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[0].includes(':locked:')`,
);
report.locked = await evaluate(`({
  layout: document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[0],
  disabledPlacementInputs: document.querySelectorAll('.placement .range-field input:disabled, .placement select:disabled').length,
  disabledShortcuts: [...document.querySelectorAll('.placement-actions button')].filter((button) => button.disabled).map((button) => button.innerText.trim())
})`);
check(
  "locking is reflected in scene state and blocks placement controls",
  report.locked.layout.includes(":locked:") &&
    report.locked.disabledPlacementInputs >= 7 &&
    [
      "ALIGN LEFT",
      "CENTER ON WALL",
      "ALIGN RIGHT",
      "EYE LINE 1.55 M",
      "SPACE THIS WALL",
    ].every((label) => report.locked.disabledShortcuts.includes(label)),
  report.locked,
);

await evaluate(
  `[...document.querySelectorAll('.artwork-state-actions button')].find((button) => button.innerText.includes('Unlock placement'))?.click()`,
);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[0].includes(':free:')`,
);
const placementX = () =>
  evaluate(
    `Number(document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[0].split(':')[1])`,
  );
await evaluate(
  `[...document.querySelectorAll('.placement-actions button')].find((button) => button.textContent.trim() === 'Align left')?.click()`,
);
await wait(220);
const leftX = await placementX();
await evaluate(
  `[...document.querySelectorAll('.placement-actions button')].find((button) => button.textContent.trim() === 'Align right')?.click()`,
);
await wait(220);
const rightX = await placementX();
await evaluate(`document.querySelectorAll('.artwork-list button')[1]?.click()`);
await wait(160);
await evaluate(
  `[...document.querySelectorAll('.placement-actions button')].find((button) => button.textContent.trim() === 'Center on wall')?.click()`,
);
await wait(220);
const centerX = await evaluate(
  `Number(document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[1].split(':')[1])`,
);
report.alignments = { leftX, centerX, rightX };
check(
  "left, center and right alignment write valid exact positions",
  leftX < -4 && Math.abs(centerX) < 0.01 && rightX > 4,
  report.alignments,
);

await evaluate(
  `[...document.querySelectorAll('.placement .choices button')].find((button) => button.innerText.trim().toLowerCase() === 'oak')?.click()`,
);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[1].includes(':oak:')`,
);
const lightsBeforeHide = await evaluate(
  `Number(document.querySelector('.gallery-scene')?.dataset.artLights)`,
);
await evaluate(
  `[...document.querySelectorAll('.artwork-state-actions button')].find((button) => button.innerText.includes('Hide in gallery'))?.click()`,
);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[1].endsWith(':hidden')`,
);
await wait(180);
const hiddenState = await evaluate(`({
  layout: document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[1],
  lights: Number(document.querySelector('.gallery-scene')?.dataset.artLights),
  listState: document.querySelectorAll('.artwork-list button')[1]?.innerText
})`);
await evaluate(
  `[...document.querySelectorAll('.artwork-state-actions button')].find((button) => button.innerText.includes('Show in gallery'))?.click()`,
);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[1].endsWith(':visible')`,
);
const visibleState = await evaluate(`({
  layout: document.querySelector('.gallery-scene')?.dataset.artworkLayout?.split('|')[1],
  lights: Number(document.querySelector('.gallery-scene')?.dataset.artLights)
})`);
report.frameAndVisibility = { lightsBeforeHide, hiddenState, visibleState };
check(
  "oak frame and hide/show state synchronize with scoped art lighting",
  hiddenState.layout.includes(":oak:") &&
    hiddenState.layout.endsWith(":hidden") &&
    hiddenState.listState.includes("Hidden") &&
    hiddenState.lights === lightsBeforeHide - 1 &&
    visibleState.layout.endsWith(":visible") &&
    visibleState.lights === lightsBeforeHide,
  report.frameAndVisibility,
);

await evaluate(
  `[...document.querySelectorAll('.placement-actions button')].find((button) => button.textContent.trim() === 'Space this wall')?.click()`,
);
await wait(250);
report.distribution = await evaluate(`({
  layout: document.querySelector('.gallery-scene')?.dataset.artworkLayout,
  alert: document.querySelector('.studio-alert')?.innerText ?? null
})`);
const distributedX = report.distribution.layout
  .split("|")
  .map((item) => Number(item.split(":")[1]));
const sortedDistributedX = [...distributedX].sort(
  (left, right) => left - right,
);
check(
  "wall distribution stays valid and evenly ordered",
  distributedX.length === 3 &&
    sortedDistributedX[0] < sortedDistributedX[1] &&
    sortedDistributedX[1] < sortedDistributedX[2] &&
    Math.abs(
      sortedDistributedX[1] -
        sortedDistributedX[0] -
        (sortedDistributedX[2] - sortedDistributedX[1]),
    ) < 0.01 &&
    !report.distribution.alert,
  { ...report.distribution, distributedX, sortedDistributedX },
);
await evaluate(`document.querySelector('.tool-panel').scrollTop = 1150`);
await wait(120);
await screenshot("regression-editor-precision");

stage = "selected-walk-reset";
await evaluate(
  `document.querySelector('[data-scene-mode-option="walk-preview"]')?.click()`,
);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.transition === 'idle' && document.querySelector('.gallery-scene')?.dataset.sceneMode === 'walk'`,
  3500,
);
const walkBeforeReset = await evaluate(`({
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition,
  sameCanvas: window.__closureCanvas === document.querySelector('.gallery-scene canvas'),
  status: document.querySelector('.scene-status')?.innerText,
  editing: document.querySelector('.gallery-scene')?.dataset.editing
})`);
await evaluate(`document.querySelector('[data-builder-reset-view]')?.click()`);
await wait(200);
const walkAfterReset = await evaluate(`({
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition,
  sameCanvas: window.__closureCanvas === document.querySelector('.gallery-scene canvas'),
  status: document.querySelector('.scene-status')?.innerText,
  editing: document.querySelector('.gallery-scene')?.dataset.editing
})`);
report.walkReset = { walkBeforeReset, walkAfterReset };
const walkPosition = walkAfterReset.camera.split(",").map(Number);
check(
  "walk preview and reset reuse the renderer in front of selected art",
  walkBeforeReset.sameCanvas &&
    walkAfterReset.sameCanvas &&
    walkAfterReset.editing === "disabled" &&
    Math.abs(walkPosition[2] + 3.165) < 0.25 &&
    walkAfterReset.status.includes("selected artwork"),
  report.walkReset,
);

stage = "forum-zones";
await clearOrigin();
await navigate("/#/create/pavilion/demo", 900);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.captureReady === 'true'`,
  10000,
);
await waitFor(
  `document.querySelectorAll('.pavilion-zone-map button').length === 5`,
);
await evaluate(`document.querySelector('[data-zone="north-west"]')?.click()`);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.pavilionZone === 'north-west'`,
  3000,
);
report.forum = await evaluate(`({
  architecture: document.querySelector('.gallery-scene')?.dataset.architecture,
  zone: document.querySelector('.gallery-scene')?.dataset.pavilionZone,
  zones: [...document.querySelectorAll('.pavilion-zone-map button')].map((button) => button.dataset.zone),
  layout: document.querySelector('.gallery-scene')?.dataset.artworkLayout,
  canvas: document.querySelectorAll('.gallery-scene canvas').length,
  mapLabel: document.querySelector('.pavilion-zone-nav')?.innerText
})`);
check(
  "Grand Forum exposes five camera zones and a valid feature-wall demo",
  report.forum.architecture === "central-axis-four-side-galleries" &&
    report.forum.zone === "north-west" &&
    report.forum.zones.length === 5 &&
    report.forum.layout
      .split("|")
      .every((item) => item.startsWith("divider-front:")) &&
    report.forum.canvas === 1 &&
    report.forum.mapLabel.toLowerCase().includes("five camera zones"),
  report.forum,
);
await screenshot("regression-forum-zones");

stage = "editor-mobile";
await clearOrigin();
await viewport(390, 844, true);
await navigate("/#/create/white-cube/demo", 850);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.captureReady === 'true'`,
  10000,
);
await evaluate(`document.querySelector('.artwork-list button')?.click()`);
await wait(300);
report.mobileEditor = await evaluate(`(() => {
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const actions = [...document.querySelectorAll('.studio-actions > *')].filter(visible).map((element) => ({
    label: element.getAttribute('aria-label') ?? element.innerText.trim(),
    rect: element.getBoundingClientRect().toJSON()
  }));
  const overlap = actions.some((left, index) => actions.slice(index + 1).some((right) =>
    left.rect.left < right.rect.right && left.rect.right > right.rect.left && left.rect.top < right.rect.bottom && left.rect.bottom > right.rect.top
  ));
  const controls = [...document.querySelectorAll('.builder-scene-controls button')].map((button) => ({ text: button.innerText.trim(), rect: button.getBoundingClientRect().toJSON() }));
  const state = [...document.querySelectorAll('.artwork-state-actions button')].map((button) => ({ text: button.innerText.trim(), rect: button.getBoundingClientRect().toJSON() }));
  return {
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    actions,
    overlap,
    controls,
    state,
    canvas: document.querySelectorAll('.gallery-scene canvas').length
  };
})()`);
check(
  "mobile editor keeps header, view controls and precision actions usable",
  report.mobileEditor.overflowX === 0 &&
    !report.mobileEditor.overlap &&
    report.mobileEditor.controls.every((item) => item.rect.height >= 44) &&
    report.mobileEditor.state.every((item) => item.rect.height >= 44) &&
    report.mobileEditor.canvas === 1,
  report.mobileEditor,
);
await screenshot("regression-editor-mobile-final");

stage = "danny-controls-directory";
await viewport(1440, 1000);
await navigate("/#/demo", 650);
await waitFor(
  `Number(document.querySelector('.gallery-scene')?.dataset.artworkTargets) > 0`,
  16000,
);
await waitFor(
  `document.querySelector('[data-visitor-smart-view]') && !document.querySelector('[data-visitor-smart-view]').disabled`,
  5000,
);
await evaluate(`document.querySelector('[data-visitor-smart-view]')?.click()`);
await waitFor(
  `document.querySelector('.gallery-scene')?.dataset.smartView && document.querySelector('.gallery-scene')?.dataset.smartView !== 'reset'`,
  3000,
);
await evaluate(`document.querySelector('[data-visitor-tour-control]')?.click()`);
await waitFor(
  `document.querySelector('[data-visitor-tour-control]')?.getAttribute('aria-pressed') === 'true'`,
  2000,
);
const tourActive = await evaluate(
  `document.querySelector('[data-visitor-tour-control]')?.innerText`,
);
await evaluate(`document.querySelector('[data-visitor-tour-control]')?.click()`);
await waitFor(
  `document.querySelector('[data-visitor-tour-control]')?.getAttribute('aria-pressed') === 'false'`,
  2000,
);
await evaluate(`document.querySelector('[data-visitor-reset-view]')?.click()`);
await wait(180);
report.dannyControls = await evaluate(`({
  controls: document.querySelectorAll('[data-visitor-controls] button').length,
  anchors: Number(document.querySelector('.gallery-scene')?.dataset.viewAnchors),
  smartViews: Number(document.querySelector('.gallery-scene')?.dataset.smartViewCount),
  routes: Number(document.querySelector('.gallery-scene')?.dataset.routeWaypoints),
  duration: Number(document.querySelector('.gallery-scene')?.dataset.tourDuration),
  reset: document.querySelector('.gallery-scene')?.dataset.smartView,
  canvas: document.querySelectorAll('.gallery-scene canvas').length
})`);
check(
  "Danny demo exposes guided tour, smart views, routes and reset on one canvas",
  report.dannyControls.controls >= 6 &&
    report.dannyControls.anchors >= 14 &&
    report.dannyControls.smartViews >= 14 &&
    report.dannyControls.routes >= 8 &&
    report.dannyControls.duration === 45000 &&
    tourActive.includes("Skip tour") &&
    ["reset", "entrance"].includes(report.dannyControls.reset) &&
    report.dannyControls.canvas === 1,
  { ...report.dannyControls, tourActive },
);

await evaluate(`document.querySelector('.artwork-directory-toggle')?.click()`);
await waitFor(`Boolean(document.querySelector('#artwork-directory'))`);
await waitFor(
  `document.querySelectorAll('.artwork-directory-list > li').length === 7`,
  5000,
);
report.directoryOpen = await evaluate(`({
  items: document.querySelectorAll('.artwork-directory-list > li').length,
  dialog: document.querySelector('#artwork-directory')?.getAttribute('role'),
  modal: document.querySelector('#artwork-directory')?.getAttribute('aria-modal'),
  focusedInside: Boolean(document.activeElement?.closest('#artwork-directory')),
  canvas: document.querySelectorAll('.gallery-scene canvas').length,
  titles: [...document.querySelectorAll('.artwork-directory-list h3')].map((heading) => heading.innerText)
})`);
check(
  "accessible Danny directory lists all seven real model works",
  report.directoryOpen.items === 7 &&
    report.directoryOpen.dialog === "dialog" &&
    report.directoryOpen.modal === "true" &&
    report.directoryOpen.focusedInside &&
    report.directoryOpen.canvas === 1 &&
    new Set(report.directoryOpen.titles).size === 7,
  report.directoryOpen,
);
await screenshot("regression-danny-directory");
await command("Input.dispatchKeyEvent", {
  type: "keyDown",
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
});
await command("Input.dispatchKeyEvent", {
  type: "keyUp",
  key: "Escape",
  code: "Escape",
  windowsVirtualKeyCode: 27,
});
await wait(180);
report.directoryClosed = await evaluate(`({
  closed: !document.querySelector('#artwork-directory'),
  focusReturned: document.activeElement?.classList.contains('artwork-directory-toggle')
})`);
check(
  "directory closes with Escape and returns focus",
  report.directoryClosed.closed && report.directoryClosed.focusReturned,
  report.directoryClosed,
);

report.newConsoleErrors = diagnostics.filter((entry) =>
  ["error", "exception"].includes(entry.type),
);
check(
  "audit closure produced no console errors",
  report.newConsoleErrors.length === 0,
  report.newConsoleErrors,
);
report.summary = {
  passed: report.checks.filter((item) => item.pass).length,
  failed: report.checks.filter((item) => !item.pass).length,
  diagnostics: diagnostics.length,
};

await writeFile(
  new URL("audit-closure-qa.json", outDir),
  JSON.stringify(report, null, 2),
);
await fetch(`${endpoint}/json/close/${target.id}`).catch(() => undefined);
socket.close();

console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed > 0) process.exitCode = 1;
