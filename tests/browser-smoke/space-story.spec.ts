import { expect, test as base, type Locator } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, runTest) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await runTest(page);
    expect(errors).toEqual([]);
  },
});

async function expectStoryFrame(scene: Locator, progress: number) {
  // DOM chapter state changes immediately; shader/reflection work settles later.
  await expect.poll(async () => Number(await scene.getAttribute('data-presentation-progress')),
    { timeout: 30_000 }).toBeCloseTo(progress, 3);
  await expect(scene).toHaveAttribute('data-presentation-idle', 'true', { timeout: 30_000 });
}

async function expectStationaryScene(scene: Locator) {
  await expect(scene).toHaveAttribute('data-render-idle', 'true', { timeout: 30_000 });
  const frames = await scene.evaluate(async element => {
    const before = (element as HTMLElement).dataset.renderFrames;
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return { before, after: (element as HTMLElement).dataset.renderFrames };
  });
  expect(Number(frames.before)).toBeGreaterThan(0);
  expect(frames.after).toBe(frames.before);
}

test.beforeEach(async ({ page }) => {
  const rate = Number(process.env.LIEUVA_BROWSER_SMOKE_CPU_RATE ?? 1);
  if (rate > 1) {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate });
  }
});

test('quiet preparation and reversible chapters', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/premium-v3/*.glb*', async route => { await held; await route.continue(); });
  await page.goto('/');
  const story = page.locator('.sgs');
  try {
    // The quiet poster precedes a deferred JS chunk. Software-rendered CI can
    // take time to mount that chunk; keep the preparation wait bounded.
    await expect(story).toHaveAttribute('data-arrival', 'loading', { timeout: 30_000 });
    await expect(story.locator('.sgs__poster')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(story.getByRole('heading', { level: 1 })).toBeVisible();
  } finally { release(); }
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  const scene = story.locator('.gallery-scene');
  await expectStoryFrame(scene, 0);
  const stationaryFrames = await scene.evaluate(async element => {
    const before = (element as HTMLElement).dataset.presentationFrames;
    for (let i = 0; i < 4; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    return { before, after: (element as HTMLElement).dataset.presentationFrames };
  });
  expect(stationaryFrames.before).toBeTruthy();
  expect(stationaryFrames.after).toBe(stationaryFrames.before);
  await expect(story.locator('.sgs__poster')).toHaveCSS('opacity', '0', { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath('story-desktop-opening.png') });
  await page.getByRole('button', { name: 'Chapter 3: Your atmosphere', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '2');
  await expectStoryFrame(scene, .505);
  await page.getByRole('button', { name: 'Chapter 1: Your space', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '0');
  await expectStoryFrame(scene, .005);
});

// Each independent journey gets its own browser context and time budget. CI's
// software GPU must not spend the Studio's arrival allowance on earlier film QA.
test('the film can play, pause with the keyboard and continue below the story', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const story = page.locator('.sgs');
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expectStoryFrame(story.locator('.gallery-scene'), 0);
  await page.getByRole('button', { name: 'Play the film · 20 sec' }).click();
  await expect(page.getByRole('button', { name: 'Pause film' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause film' }).press('Space');
  await expect(page.getByRole('button', { name: 'Play the film · 20 sec' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Continue below the story', exact: true }).click();
  await expect.poll(() => story.evaluate(el => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(1);
});

test('a previewed material survives the real desktop Studio handoff', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const story = page.locator('.sgs');
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  const scene = story.locator('.gallery-scene');
  await page.getByRole('button', { name: 'Chapter 3: Your atmosphere', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '2');
  await expectStoryFrame(scene, .505);
  const beforeFinish = Number(await scene.getAttribute('data-presentation-frames'));
  await page.getByRole('button', { name: 'Preview oak floor', exact: true }).click();
  await expect(story.locator('.gallery-scene')).toHaveAttribute('data-floor', 'oak');
  await expect(scene).toHaveAttribute('data-presentation-idle', 'true', { timeout: 30_000 });
  expect(Number(await scene.getAttribute('data-presentation-frames'))).toBeGreaterThan(beforeFinish);
  await expect.poll(() => story.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--story-progress')))).toBeGreaterThan(.504);
  await page.screenshot({ path: testInfo.outputPath('story-desktop-material.png') });
  await page.getByRole('button', { name: 'Chapter 4: Their experience', exact: true }).click();
  await expect(story).toHaveAttribute('data-chapter', '3');
  await page.getByRole('button', { name: 'Show floor finishes' }).click();
  await page.getByRole('button', { name: 'Preview oak floor', exact: true }).click();
  await page.getByRole('button', { name: 'Open this Space in Studio' }).click();
  await expect(page).toHaveURL(/#\/create\/white-cube\/story-/);
  await expect(page.locator('.studio .gallery-scene')).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(page.locator('.studio .gallery-scene')).toHaveAttribute('data-floor', 'oak');
});

test('mobile reduced motion stays composed and offers a functioning Studio action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const story = page.locator('.sgs');
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(story).toHaveAttribute('data-motion', 'reduced');
  await expect(story.locator('.gallery-scene')).toHaveAttribute('data-cutaway', 'inactive');
  await expect(story.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play the film · 20 sec' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Open this Space in Studio' })).toBeInViewport();
});

for (const room of ['white-cube', 'nocturne', 'pavilion']) {
  test(`${room}: one arrival screen precedes the prepared room`, async ({ page }) => {
    await page.goto(`/#/create/${room}/demo`);
    const scene = page.locator('.studio .gallery-scene');
    await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
    await expect(scene).toHaveAttribute('data-environment', 'premium-v3');
    await expect(scene).toHaveAttribute('data-capture-ready', 'true');
    await expectStationaryScene(scene);
    await expect(page.locator('.space-entry-loading,.demo-loading-poster')).toHaveCount(0);
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  });
}

test('Danny reference route keeps its metadata and accessible artwork directory', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/demo');
  const viewer = page.locator('main.viewer');
  const scene = viewer.locator('.gallery-scene');
  await expect(scene).toHaveAttribute('data-load-progress', '100', { timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-artwork-hotspots', '7');
  await expect(scene.locator('canvas[data-scene-canvas="danny"]')).toBeVisible();
  await expect(viewer.getByText('Danny Hirsch Arts', { exact: true })).toBeVisible();
  await expect(viewer.getByText('Threshold · 2026', { exact: true })).toBeVisible();
  await expect(viewer.getByRole('heading', { level: 1, name: 'Threshold' })).toBeVisible();

  const directoryButton = viewer.getByRole('button', {
    name: 'Open artwork list, 7 works',
  });
  await directoryButton.click();
  const directory = page.getByRole('dialog', { name: /Threshold.*Artwork directory/ });
  await expect(directory).toBeVisible();
  await expect(directory.locator('.artwork-directory-list > li')).toHaveCount(7);
  await expect(directory.getByRole('heading', { name: 'Yellow Field, Veined' })).toBeVisible();
  await expect(directory.getByRole('heading', { name: 'wARTrobe · Front' })).toBeVisible();
  await expect(directory.getByRole('img', {
    name: 'Magnified surface detail of Yellow Field, Veined by Danny Hirsch',
  })).toBeVisible({ timeout: 30_000 });
  await directory.getByRole('button', { name: 'Close artwork directory' }).click();
  await expect(directoryButton).toBeFocused();
});

test('Arrange redraws camera and roof changes and resumes Walk preview', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#/create/white-cube/demo');
  const scene = page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expectStationaryScene(scene);
  const frames = Number(await scene.getAttribute('data-render-frames'));
  const position = await scene.getAttribute('data-camera-position');
  await page.getByRole('button', { name: 'Rotate room 45 degrees right', exact: true }).click();
  await expect(scene).not.toHaveAttribute('data-camera-position', position!);
  await expect.poll(async () => Number(await scene.getAttribute('data-render-frames'))).toBeGreaterThan(frames);
  await expectStationaryScene(scene);
  await page.getByRole('button', { name: 'Preview ceiling', exact: true }).click();
  await expect(scene).toHaveAttribute('data-cutaway', 'inactive');
  await expectStationaryScene(scene);
  await page.getByRole('button', { name: 'Walk preview', exact: true }).click();
  await expect(scene).toHaveAttribute('data-editor-mode', 'walk-preview');
  await expect(scene).toHaveAttribute('data-render-idle', 'false');
  const walkFrames = Number(await scene.getAttribute('data-render-frames'));
  await expect.poll(async () => Number(await scene.getAttribute('data-render-frames'))).toBeGreaterThan(walkFrames);
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(scene).toHaveAttribute('data-editor-mode', 'arrange');
  await expectStationaryScene(scene);
});


test('mobile materials remain clear of the real Studio handoff', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const story = page.locator('.sgs');
  await expect(story).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Chapter 4: Their experience', exact: true }).click();
  await expect.poll(() => story.evaluate(el => Number((el as HTMLElement).style.getPropertyValue('--story-progress')))).toBeGreaterThan(.754);
  await expectStoryFrame(story.locator('.gallery-scene'), .755);
  const finishes = await page.locator('.sgs__finish').boundingBox();
  const studioAction = page.getByRole('button', { name: 'Open this Space in Studio' });
  const action = await studioAction.boundingBox();
  expect(finishes).not.toBeNull(); expect(action).not.toBeNull();
  expect(finishes!.y + finishes!.height).toBeLessThan(action!.y);
  await page.screenshot({ path: testInfo.outputPath('story-mobile-finale.png') });
  // An invalid room reflection used to black out lit surfaces on SwiftShader
  // while every DOM assertion still passed. Sample a clear area of the pale
  // right partition at this authored camera pose, outside artwork and controls.
  const room = await story.locator('.sgs__room').boundingBox();
  const wall = await page.screenshot({ clip: { x: room!.x + room!.width * .52, y: room!.y + room!.height * .36, width: 24, height: 24 }, scale: 'css' });
  const wallLuminance = await page.evaluate(async encoded => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 24;
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    return sum / (24 * 24);
  }, wall.toString('base64'));
  expect(wallLuminance).toBeGreaterThan(40);
  await studioAction.click();
  const scene = page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-capture-ready', 'true');
});

test('mobile Studio materials can be applied, dismissed and undone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/create/white-cube/demo');
  const scene = page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival', 'ready', { timeout: 30_000 });
  await expect(scene).toHaveAttribute('data-render-idle', 'true', { timeout: 30_000 });
  const canvas = scene.locator('canvas');
  await canvas.evaluate(el => { el.dataset.testIdentity = 'persistent'; });
  await page.getByRole('button', { name: 'Edit floor', exact: true }).click();
  await expect(page.getByRole('button', {name:/^Done · Back to room/})).toBeInViewport();
  await page.getByRole('button', { name: 'Editor tools are half. Change panel size' }).click();
  // Hold the actual material image, not just the UI swatch. Completion must
  // redraw even after the earlier geometry/material update has been submitted.
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/premium-v3/natural-oak.webp', async route => {
    requested = true;
    await held;
    await route.continue();
  });
  let pendingFrames: number;
  try {
    await page.getByRole('button', { name: 'natural oak', exact: true }).click();
    await expect(scene).toHaveAttribute('data-floor', 'oak');
    await expect.poll(() => requested).toBe(true);
    await expect(scene).toHaveAttribute('data-render-idle', 'false');
    pendingFrames = Number(await scene.getAttribute('data-render-frames'));
  } finally { release(); }
  await expectStationaryScene(scene);
  expect(Number(await scene.getAttribute('data-render-frames'))).toBeGreaterThan(pendingFrames);
  await page.screenshot({ path: testInfo.outputPath('studio-mobile-materials.png') });
  await page.getByRole('button', { name: /^Done · Back to room/ }).click();
  await expect(page.getByRole('button', { name: 'Edit floor', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit more', exact: true }).click();
  const beforeUndo = Number(await scene.getAttribute('data-render-frames'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(scene).toHaveAttribute('data-floor', 'concrete');
  await expectStationaryScene(scene);
  expect(Number(await scene.getAttribute('data-render-frames'))).toBeGreaterThan(beforeUndo);
  await expect(canvas).toHaveAttribute('data-test-identity', 'persistent');
  await page.getByRole('button', { name: 'Ceiling', exact: true }).click();
  await expect(page.locator('.tool-panel')).toHaveAttribute('data-mobile-tool', 'ceiling');
  await page.getByRole('button', { name: 'Close tools', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit more', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Walk preview', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Studio tools' })).toBeHidden();
  await page.getByRole('button', { name: 'Arrange', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Studio tools' })).toBeVisible();
});

test.describe('touch story', () => {
  test.use({ viewport: {width:320,height:667}, hasTouch:true, isMobile:true });
  test('material demonstration, manual choice and explicit touch exploration', async ({page}) => {
    await page.goto('/');
    const story = page.locator('.sgs'), scene = story.locator('.gallery-scene');
    await expect(story).toHaveAttribute('data-arrival','ready');
    const seek = async (shot: number) => {
      await story.evaluate((el,progress) => window.scrollTo({top:scrollY+el.getBoundingClientRect().top+progress*(el.offsetHeight-innerHeight),behavior:'instant'}),shot/24);
      await expectStoryFrame(scene,shot/24);
    };
    await seek(12.5);
    await expect(scene).toHaveAttribute('data-floor','concrete');
    const camera = await scene.getAttribute('data-camera-position');
    await seek(13.5);
    await expect(scene).toHaveAttribute('data-floor','oak');
    await expect(scene).toHaveAttribute('data-camera-position',camera!);
    await seek(14.5);
    await expect(scene).toHaveAttribute('data-floor','black-marble');
    await expect(scene).toHaveAttribute('data-camera-position',camera!);
    for (const [shot,wall,label] of [[15.5,'chalk','Plaster'],[16.5,'warm','Clay'],[17.5,'travertine','Travertine']] as const) {
      await seek(shot);
      await expect(scene).toHaveAttribute('data-wall',wall);
      await expect(story.locator('.sgs__finish')).toHaveAttribute('data-surface','wall');
      await expect(story.getByRole('button',{name:`Preview ${wall} wall`})).toHaveAttribute('aria-pressed','true');
      await expect(story.getByRole('button',{name:`Preview ${wall} wall`})).toContainText(label);
    }
    await seek(23.5);
    await page.getByRole('button',{name:'Show floor finishes'}).tap();
    await page.getByRole('button',{name:'Preview oak floor',exact:true}).tap();
    await expect(scene).toHaveAttribute('data-floor','oak');
    await expect(page.getByRole('button',{name:'Open this Space in Studio'})).toBeInViewport();
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await page.getByRole('button',{name:'Look around',exact:true}).tap();
    await expect(story).toHaveAttribute('data-interactive','true');
    await expect(scene.locator('canvas')).toHaveCSS('touch-action','none');
    const before = await scene.getAttribute('data-camera-yaw');
    const bounds = await scene.locator('canvas').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const x=bounds!.x+bounds!.width*.5,y=bounds!.y+bounds!.height*.6;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let n=1;n<=5;n++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+n*12,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(scene).not.toHaveAttribute('data-camera-yaw',before!);
    await page.getByRole('button',{name:'Back to story',exact:true}).tap();
    await expect(story).toHaveAttribute('data-interactive','false');
    await expect(scene.locator('canvas')).toHaveCSS('touch-action','pan-y pinch-zoom');
    await seek(6.5);
    await expect(scene).toHaveAttribute('data-floor','concrete');
    await expect(scene).toHaveAttribute('data-wall','chalk');
  });
});

test('mobile artwork upload, history, recovery and publication review stay available', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/create/white-cube/demo');
  const scene=page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival','ready');
  await page.getByRole('button',{name:'Edit artwork',exact:true}).click();
  await page.locator('.upload input[type=file]').setInputFiles('public/assets/artworks/aura-cliffs-study.webp');
  await expect(page.locator('.artwork-list button')).toHaveCount(4);
  await page.getByRole('button',{name:'Edit more',exact:true}).click();
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect(page.locator('.artwork-list button')).toHaveCount(3);
  await expect(page.locator('.draft-save-status')).toHaveClass(/--saved/);
  // Observe the same DOM commit as Redo, before any deferred timer can conceal
  // a stale Saved label. Reload is safe only after this revision finishes saving.
  await page.locator('.studio').evaluate(root => {
    const observer = new MutationObserver(() => {
      if (root.querySelectorAll('.artwork-list button').length !== 4) return;
      root.setAttribute('data-save-after-redo', root.querySelector('.draft-save-status')!.className);
      observer.disconnect();
    });
    observer.observe(root, {childList:true, subtree:true});
  });
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await expect(page.locator('.artwork-list button')).toHaveCount(4);
  await expect(page.locator('.studio')).toHaveAttribute('data-save-after-redo', /--saving/);
  await expect(page.locator('.draft-save-status')).toHaveClass(/--saved/);
  await page.reload();
  await expect(scene).toHaveAttribute('data-arrival','ready');
  await expect(page.getByRole('heading',{name:'Continue where you left off?'})).toBeVisible();
  await page.getByRole('button',{name:'Recover draft',exact:true}).click();
  await expect(page.locator('.artwork-list button')).toHaveCount(4);
  await page.getByRole('button',{name:/Review & publish/}).click();
  await expect(page.getByRole('heading',{name:'Check the visitor experience.'})).toBeVisible();
  await expect(page.getByText('Geometry valid ✓',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back to editor',exact:true}).click();
  await expect(page.locator('.editor-modal')).toHaveCount(0);
});


test('20-second playback demonstrates floors and walls automatically and settles at the end', async ({page}, testInfo) => {
  // This is a functional full-quality WebGL journey, not a GPU speed budget.
  // Leave headroom for Linux SwiftShader while the workflow-level timeout still
  // bounds a genuinely hung browser.
  test.setTimeout(240_000);
  // Test the authored duration independently of the runner's GPU throughput.
  // Every shot below still has to reach the real production WebGL renderer.
  // Install before navigation so existing timers/RAF handles are never orphaned.
  await page.clock.install();
  await page.goto('/');
  const story=page.locator('.sgs'),scene=story.locator('.gallery-scene');
  await expect(story).toHaveAttribute('data-arrival','ready');
  // Manual material controls and chapter transitions have their own desktop,
  // touch and mobile journeys above. Start this controlled-clock journey from
  // the canonical opening frame so its scope stays the authored film itself.
  await expect(story).toHaveAttribute('data-chapter','0');
  await expect(scene).toHaveAttribute('data-floor','concrete');
  await expect(scene).toHaveAttribute('data-wall','chalk');
  await page.evaluate(() => window.scrollTo({top:0, behavior:'instant'}));
  await expectStoryFrame(scene,0);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
  await scene.evaluate(el => {
    const seen={floor:new Set<string>(),wall:new Set<string>()};
    const events: unknown[]=[];
    const reflectionBakes: number[]=[];
    new MutationObserver(() => {
      if (el.getAttribute('data-reflections') === 'room-probe' &&
        document.querySelector('.sgs__play')?.getAttribute('aria-pressed') === 'true')
        reflectionBakes.push(performance.now());
    }).observe(el,{attributes:true,attributeFilter:['data-reflections']});
    (el as HTMLElement & {reflectionBakes: number[]}).reflectionBakes=reflectionBakes;
    const record=()=>{for(const key of ['floor','wall'] as const) seen[key].add(el.getAttribute(`data-${key}`)!);events.push({time:performance.now(),progress:el.getAttribute('data-presentation-progress'),floor:el.getAttribute('data-floor'),wall:el.getAttribute('data-wall')});};
    (el as HTMLElement & {finishEvents: unknown[]}).finishEvents=events;
    record();const observer=new MutationObserver(record);observer.observe(el,{attributes:true,attributeFilter:['data-floor','data-wall']});
    (el as HTMLElement & {finishReport:()=>unknown}).finishReport=()=>{observer.disconnect();return {floor:[...seen.floor],wall:[...seen.wall]};};
  });
  try {
    await page.getByRole('button',{name:'Play the film · 20 sec'}).click();
    await expect(page.getByRole('button',{name:'Pause film'})).toHaveAttribute('aria-pressed','true');
    // Jump over the camera path in one timer turn. The model suite exhaustively
    // covers its 1,729 samples; this browser journey only renders the finish
    // thresholds that the transport must preserve after a long GPU stall.
    const renderedFinishes = [
      { ticks: 19_980, shot: 13, floor: 'concrete', wall: 'chalk' },
      { ticks: 17, shot: 14, floor: 'oak', wall: 'chalk' },
      { ticks: 17, shot: 15, floor: 'black-marble', wall: 'chalk' },
      { ticks: 17, shot: 16, floor: 'black-marble', wall: 'chalk' },
      { ticks: 17, shot: 17, floor: 'black-marble', wall: 'warm' },
      { ticks: 17, shot: 18, floor: 'black-marble', wall: 'travertine' },
    ] as const;
    for (const finish of renderedFinishes) {
      // fastForward fires each due timer at most once. One RAF therefore
      // publishes one catch-up stage without grinding through intermediate
      // WebGL frames on SwiftShader.
      await page.clock.fastForward(finish.ticks);
      await expect(story).toHaveAttribute('data-shot', String(finish.shot));
      await expect(scene).toHaveAttribute('data-floor', finish.floor);
      await expect(scene).toHaveAttribute('data-wall', finish.wall);
      await expect(page.getByRole('button',{name:'Pause film'})).toHaveAttribute('aria-pressed','true');
    }
    await page.clock.fastForward(17);
    await expect(page.getByRole('button',{name:'Play the film · 20 sec'})).toHaveAttribute('aria-pressed','false');
    // React has stopped the transport; resume real time so the persistent scene
    // can consume that final presentation prop and settle its renderer.
    await page.clock.resume();
    await expectStoryFrame(scene,1);
    expect(await scene.evaluate(el => (el as HTMLElement & {finishReport:()=>unknown}).finishReport())).toEqual({floor:['concrete','oak','black-marble'],wall:['chalk','warm','travertine']});
    expect(await scene.evaluate(el => (el as HTMLElement & {reflectionBakes: number[]}).reflectionBakes)).toEqual([]);
    await expect(story).toHaveAttribute('data-shot','24');
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  } finally {
    const diagnostics = await scene.evaluate(el => {
      const surface = el as HTMLElement & {finishEvents: unknown[]; reflectionBakes: number[]};
      return {scene: {...surface.dataset}, events: surface.finishEvents, reflectionBakes: surface.reflectionBakes,
        transport: document.querySelector('.sgs__play')?.textContent};
    });
    await testInfo.attach('film-diagnostics', {body: JSON.stringify(diagnostics), contentType:'application/json'});
  }
});
