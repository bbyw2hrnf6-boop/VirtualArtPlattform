import { writeFile } from "node:fs/promises";

const endpoint = "http://127.0.0.1:9333";
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
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    diagnostics.push(
      message.params.exceptionDetails?.exception?.description
        ?? message.params.exceptionDetails?.text,
    );
  }
  if (
    message.method === "Runtime.consoleAPICalled"
    && ["error", "warning", "warn"].includes(message.params.type)
  ) {
    diagnostics.push(message.params.args.map(
      (argument) => argument.value ?? argument.description ?? argument.type,
    ).join(" "));
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
  const response = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails)
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function viewport(width, height, mobile = false) {
  await command("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}
async function screenshot(name) {
  const image = await command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(new URL(name, import.meta.url), Buffer.from(image.data, "base64"));
}

await Promise.all([
  command("Page.enable"),
  command("Runtime.enable"),
  command("Log.enable"),
]);
await viewport(1440, 1000);
await command("Page.navigate", { url: "http://127.0.0.1:5174/#/account" });
await wait(1800);
const desktop = await evaluate(`({
  title: document.title,
  text: document.body.innerText.slice(0, 1000),
  accountPage: Boolean(document.querySelector('.account-page')),
  dialog: Boolean(document.querySelector('.account-dialog--page')),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
await screenshot("account-page-desktop.png");
await viewport(390, 844, true);
await wait(350);
const mobile = await evaluate(`({
  accountPage: Boolean(document.querySelector('.account-page')),
  dialog: Boolean(document.querySelector('.account-dialog--page')),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  controls: [...document.querySelectorAll('button,input')].map((node) => ({
    label: node.innerText || node.getAttribute('aria-label') || node.getAttribute('name'),
    height: node.getBoundingClientRect().height
  })).filter((item) => item.height > 0)
})`);
await screenshot("account-page-mobile.png");
const report = { runAt: new Date().toISOString(), desktop, mobile, diagnostics };
await writeFile(
  new URL("account-page-qa.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report, null, 2));
socket.close();
