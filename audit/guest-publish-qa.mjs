import { writeFile } from "node:fs/promises";

const endpoint = "http://127.0.0.1:9333";
const target = await fetch(`${endpoint}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const diagnostics = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  } else if (message.method === "Runtime.exceptionThrown") {
    diagnostics.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text);
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
  const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function viewport(width, height, mobile = false) {
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
}
async function screenshot(name) {
  const image = await command("Page.captureScreenshot", { format: "png", fromSurface: true });
  await writeFile(new URL(name, import.meta.url), Buffer.from(image.data, "base64"));
}

await Promise.all([command("Page.enable"), command("Runtime.enable")]);
await viewport(1440, 1000);
await command("Page.navigate", { url: "http://127.0.0.1:5174/#/create/white-cube/demo" });
await wait(2600);
await evaluate(`document.querySelector('.studio-header .publish-button')?.click()`);
await wait(700);
const desktop = await evaluate(`({
  review: Boolean(document.querySelector('.publish-review')),
  gate: Boolean(document.querySelector('.publish-account-gate')),
  gateText: document.querySelector('.publish-account-gate')?.innerText,
  publishLabel: document.querySelector('.publish-review .editor-modal-actions .publish-button')?.textContent?.trim(),
  visibilityChoices: document.querySelectorAll('.publish-visibility input').length,
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
await screenshot("guest-publish-gate-desktop.png");
await viewport(390, 844, true);
await wait(350);
const mobile = await evaluate(`({
  gate: Boolean(document.querySelector('.publish-account-gate')),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  controls: [...document.querySelectorAll('.publish-review button')].map((node) => ({
    label: node.textContent?.trim() || node.getAttribute('aria-label'),
    height: node.getBoundingClientRect().height
  })).filter((item) => item.height > 0)
})`);
await screenshot("guest-publish-gate-mobile.png");
await evaluate(`document.querySelector('.publish-review .editor-modal-actions .publish-button')?.click()`);
await wait(500);
const accountPrompt = await evaluate(`({
  accountDialog: Boolean(document.querySelector('.account-dialog')),
  reviewClosed: !document.querySelector('.publish-review'),
  editorPreserved: Boolean(document.querySelector('.studio')),
  hasGoogle: Boolean(document.querySelector('.account-google')),
  hasEmailForm: Boolean(document.querySelector('.account-dialog form'))
})`);
const report = { runAt: new Date().toISOString(), desktop, mobile, accountPrompt, diagnostics };
await writeFile(new URL("guest-publish-qa.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
socket.close();
