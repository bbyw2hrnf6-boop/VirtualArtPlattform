import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const browserBinary =
  "/Users/uhorizon/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const profile = await mkdtemp(join(tmpdir(), "aura-scroll-qa-"));
const pageUrl = pathToFileURL(join(root, "dist", "index.html")).href;
const outputPath = join(root, "audit", "final", "scroll-story-pipe-qa.json");

class PipeCdp {
  constructor(child) {
    this.child = child;
    this.input = child.stdio[3];
    this.output = child.stdio[4];
    this.pending = new Map();
    this.listeners = new Set();
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
    this.output.on("data", (chunk) => this.receive(chunk));
  }

  receive(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let delimiter = this.buffer.indexOf(0);
    while (delimiter >= 0) {
      const payload = this.buffer.subarray(0, delimiter).toString("utf8");
      this.buffer = this.buffer.subarray(delimiter + 1);
      if (payload) {
        const message = JSON.parse(payload);
        if (message.id) {
          const pending = this.pending.get(message.id);
          this.pending.delete(message.id);
          if (message.error) pending?.reject(new Error(message.error.message));
          else pending?.resolve(message.result ?? {});
        } else {
          this.listeners.forEach((listener) => listener(message));
        }
      }
      delimiter = this.buffer.indexOf(0);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 20_000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.input.write(`${JSON.stringify(message)}\0`);
    });
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const child = spawn(
  browserBinary,
  [
    "--headless",
    "--no-sandbox",
    "--single-process",
    "--no-zygote",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--metrics-recording-only",
    "--allow-file-access-from-files",
    "--disable-web-security",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader-webgl",
    "--remote-debugging-pipe",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
);

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-20_000);
});

const cdp = new PipeCdp(child);
const pageErrors = [];
let sessionId;
const unsubscribe = cdp.on((message) => {
  if (message.sessionId !== sessionId) return;
  if (message.method === "Runtime.exceptionThrown") {
    pageErrors.push(message.params?.exceptionDetails?.exception?.description ?? "Runtime exception");
  }
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
    pageErrors.push(message.params.entry.text);
  }
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function evaluate(expression) {
  const response = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function waitFor(expression, timeout = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(120);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function screenshot(name) {
  const capture = await cdp.send(
    "Page.captureScreenshot",
    { format: "png", fromSurface: true, captureBeyondViewport: false },
    sessionId,
  );
  const path = join(root, "audit", "final", name);
  await writeFile(path, Buffer.from(capture.data, "base64"));
  return path;
}

async function viewport(width, height, mobile = false) {
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height },
    sessionId,
  );
}

async function openHome() {
  await cdp.send("Page.navigate", { url: pageUrl }, sessionId);
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.documentElement.style.scrollBehavior = 'auto'; true");
  await waitFor("Boolean(document.querySelector('.story-deferred'))");
}

async function loadStory(expectedWebgl = "ready") {
  await evaluate(`(() => {
    const target = document.querySelector('.story-deferred');
    if (!target) return false;
    window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY + 2);
    return true;
  })()`);
  await waitFor("Boolean(document.querySelector('.sgs'))");
  await waitFor(`document.querySelector('.sgs')?.dataset.webgl === '${expectedWebgl}'`, 20_000);
  await delay(450);
}

async function sampleStory(progress, screenshotName) {
  await evaluate(`(() => {
    const section = document.querySelector('.sgs');
    const start = section.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    window.scrollTo(0, start + travel * ${progress});
    return true;
  })()`);
  await delay(520);
  const state = await evaluate(`(() => {
    const section = document.querySelector('.sgs');
    const chapters = [...section.querySelectorAll('.sgs__chapters article')];
    const active = chapters
      .map((chapter) => ({ title: chapter.querySelector('h2')?.textContent, opacity: Number(chapter.style.opacity || 0) }))
      .sort((a, b) => b.opacity - a.opacity)[0];
    const canvas = section.querySelector('canvas');
    return {
      requestedProgress: ${progress},
      renderedProgress: Number(getComputedStyle(section).getPropertyValue('--sgs-progress')),
      active,
      interactive: section.dataset.interactive,
      webgl: section.dataset.webgl,
      canvasAriaHidden: canvas.getAttribute('aria-hidden'),
      canvasTabIndex: canvas.tabIndex,
      roomShowcaseFollows: section.closest('.story-deferred')?.nextElementSibling?.classList.contains('room-showcase') === true,
    };
  })()`);
  if (screenshotName) state.screenshot = await screenshot(screenshotName);
  return state;
}

const report = { pageUrl, desktop: [], mobile: [], danny: {}, pageErrors: [] };

try {
  await cdp.send("Browser.getVersion");
  const { targetInfos } = await cdp.send("Target.getTargets");
  let target = targetInfos.find((item) => item.type === "page");
  if (!target) {
    const created = await cdp.send("Target.createTarget", { url: "about:blank" });
    target = { targetId: created.targetId };
  }
  const attached = await cdp.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  sessionId = attached.sessionId;
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  await cdp.send("Log.enable", {}, sessionId);
  const localAssetSources = Object.fromEntries(
    await Promise.all(
      ["danny-gallery.glb", "danny-gallery-mobile.glb"].map(async (name) => [
        new URL(`./assets/demo/${name}`, pageUrl).href,
        (await readFile(join(root, "dist", "assets", "demo", name))).toString("base64"),
      ]),
    ),
  );
  await cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(() => {
        const assets = ${JSON.stringify(localAssetSources)};
        const nativeFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          const encoded = assets[new URL(url, document.baseURI).href];
          if (!encoded) return nativeFetch(input, init);
          const binary = atob(encoded);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
          return Promise.resolve(new Response(bytes, { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } }));
        };
      })();`,
    },
    sessionId,
  );

  await viewport(1440, 1000);
  await openHome();
  await loadStory();
  for (const [progress, name] of [
    [0.04, "scroll-story-01-outline.png"],
    [0.13, "scroll-story-02-blueprint.png"],
    [0.25, undefined],
    [0.38, "scroll-story-04-atmosphere.png"],
    [0.51, undefined],
    [0.63, "scroll-story-06-arrange.png"],
    [0.73, "scroll-story-07-responsive-space.png"],
    [0.83, undefined],
    [0.95, "scroll-story-09-live.png"],
  ]) {
    report.desktop.push(await sampleStory(progress, name));
  }
  report.desktop.push(await sampleStory(0.25));
  report.desktop.push(await sampleStory(0.95));
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", x: 720, y: 520, button: "left", clickCount: 1 },
    sessionId,
  );
  await cdp.send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", x: 720, y: 520, button: "left", clickCount: 1 },
    sessionId,
  );
  await delay(180);
  report.artworkSelection = await evaluate(`(() => {
    const card = document.querySelector('.sgs__artwork-card');
    return {
      open: card?.getAttribute('aria-hidden') === 'false',
      title: card?.querySelector('h3')?.textContent,
      closeTarget: card?.querySelector('button')?.getBoundingClientRect().width,
    };
  })()`);
  await evaluate("document.querySelector('.sgs canvas')?.focus(); document.querySelector('button[data-story-move=forward]')?.click(); true");
  report.desktopInteraction = await evaluate(`(() => {
    const section = document.querySelector('.sgs');
    return {
      focused: document.activeElement === section.querySelector('canvas'),
      interactive: section.dataset.interactive,
      controls: section.querySelectorAll('button[data-story-move]').length,
      artworkCards: section.querySelectorAll('.sgs__artwork-card').length,
    };
  })()`);

  await cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    sessionId,
  );
  await openHome();
  await loadStory();
  report.reducedMotion = await evaluate(`(() => {
    const section = document.querySelector('.sgs');
    return {
      motion: section.dataset.motion,
      progress: Number(getComputedStyle(section).getPropertyValue('--sgs-progress')),
      interactive: section.dataset.interactive,
      visibleActCards: [...section.querySelectorAll('.sgs__chapters article')]
        .filter((item) => getComputedStyle(item).display !== 'none').length,
      sectionHeight: section.getBoundingClientRect().height,
    };
  })()`);
  report.reducedMotion.screenshot = await screenshot("scroll-story-reduced-motion.png");
  await cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] },
    sessionId,
  );

  await viewport(390, 844, true);
  await openHome();
  await loadStory();
  report.mobile.push(await sampleStory(0.63, "scroll-story-mobile-arrange.png"));
  report.mobile.push(await sampleStory(0.95, "scroll-story-mobile-live.png"));

  await viewport(1440, 1000);
  await cdp.send("Page.navigate", { url: `${pageUrl}#/demo` }, sessionId);
  await waitFor("document.readyState === 'complete'");
  await waitFor("Boolean(document.querySelector('.gallery-scene .scene-status[data-ready=true]'))", 25_000);
  await delay(800);
  report.danny = await evaluate(`(() => {
    const scene = document.querySelector('.gallery-scene .scene-status[data-ready=true]')?.closest('.gallery-scene');
    return {
      ready: Boolean(scene),
      exposure: scene?.dataset.toneMappingExposure,
      environmentIntensity: scene?.dataset.environmentIntensity,
      authoredLights: scene?.dataset.authoredLights,
      activeAuthoredLights: scene?.dataset.activeAuthoredLights,
      lightBudget: scene?.dataset.authoredLightBudget,
      lightingPreset: scene?.dataset.lightingPreset,
    };
  })()`);
  report.danny.screenshot = await screenshot("danny-brightness-final.png");

  report.pageErrors = [...pageErrors];
  const fallbackErrorStart = pageErrors.length;
  await cdp.send(
    "Page.addScriptToEvaluateOnNewDocument",
    {
      source: `(() => {
        const nativeGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
          return nativeGetContext.call(this, type, ...args);
        };
      })();`,
    },
    sessionId,
  );
  await cdp.send("Page.navigate", { url: pageUrl }, sessionId);
  await waitFor("document.readyState === 'complete'");
  await evaluate("document.documentElement.style.scrollBehavior = 'auto'; true");
  await loadStory("unavailable");
  report.webglFallback = await evaluate(`(() => {
    const section = document.querySelector('.sgs');
    const sequence = section.querySelector('.sgs__accessible-sequence');
    sequence.scrollIntoView();
    return {
      webgl: section.dataset.webgl,
      items: sequence.children.length,
      display: getComputedStyle(sequence).display,
      height: sequence.getBoundingClientRect().height,
      sectionHeight: section.getBoundingClientRect().height,
    };
  })()`);
  await delay(120);
  report.webglFallback.screenshot = await screenshot("scroll-story-webgl-fallback.png");
  report.fallbackDiagnostics = pageErrors.slice(fallbackErrorStart);

  report.assertions = {
    nineDistinctStages: new Set(report.desktop.slice(0, 9).map((item) => item.active?.title)).size === 9,
    reversible: report.desktop.at(-2)?.renderedProgress < 0.27 && report.desktop.at(-2)?.interactive === "false" && report.desktop.at(-1)?.interactive === "true",
    liveCanvasAccessible: report.desktopInteraction.focused && report.desktopInteraction.controls === 4,
    artworkSelectable: report.artworkSelection.open && report.artworkSelection.title === "Forest Study" && report.artworkSelection.closeTarget >= 44,
    reducedMotionStatic: report.reducedMotion.motion === "reduced" && report.reducedMotion.progress === 1 && report.reducedMotion.interactive === "false" && report.reducedMotion.visibleActCards === 3,
    webglFallbackVisible: report.webglFallback.webgl === "unavailable" && report.webglFallback.items === 9 && report.webglFallback.display === "grid" && report.webglFallback.height > 300,
    roomCardsImmediatelyFollow: report.desktop.every((item) => item.roomShowcaseFollows),
    desktopWebglReady: report.desktop.every((item) => item.webgl === "ready"),
    mobileWebglReady: report.mobile.every((item) => item.webgl === "ready"),
    dannyLightingReady: report.danny.ready && Number(report.danny.exposure) >= 0.9,
    noPageErrors: report.pageErrors.length === 0,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (Object.values(report.assertions).some((value) => !value)) {
    throw new Error(`QA assertion failed: ${JSON.stringify(report.assertions)}`);
  }
  process.stdout.write(`${JSON.stringify(report.assertions)}\n`);
} catch (error) {
  report.pageErrors = [...pageErrors];
  report.failure = error instanceof Error ? error.stack : String(error);
  report.browserStderr = stderr;
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  throw error;
} finally {
  unsubscribe();
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(2_000),
  ]);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rm(profile, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(150);
    }
  }
}
