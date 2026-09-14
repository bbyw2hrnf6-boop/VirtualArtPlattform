import { expect, test, type Locator, type Page } from '@playwright/test';

const position = async (scene: Locator) => (await scene.getAttribute('data-camera-position'))!.split(',').map(Number);
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((n, i) => n - b[i]));
const renderedFrames = async (scene: Locator) => Number(await scene.getAttribute('data-render-frames'));

const holdThroughMovementSample = async (
  page: Page,
  scene: Locator,
  press: () => Promise<void>,
  release: () => Promise<void>,
) => {
  const firstFrame = await renderedFrames(scene);
  await press();
  const pressedAt = Date.now();
  try {
    // SwiftShader can render only a few frames per second. Require both the
    // user-facing hold duration and enough actual movement updates so this
    // checks pace rather than runner throughput or diagnostic cadence.
    await expect.poll(() => renderedFrames(scene)).toBeGreaterThanOrEqual(firstFrame + 8);
    const remainingHold = 1000 - (Date.now() - pressedAt);
    if (remainingHold > 0) await page.waitForTimeout(remainingHold);
  } finally {
    await release();
  }
};

for (const width of [1440, 390]) {
  test(`${width}px view and pace stay camera-local across Arrange, reset and focus`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/create/pavilion/demo');
    const scene = page.locator('.studio .gallery-scene');
    await expect(scene).toHaveAttribute('data-arrival', 'ready');
    const canvas = scene.locator('canvas');
    await canvas.evaluate(el => { el.dataset.testIdentity = 'persistent'; });
    const limit = Number(await scene.getAttribute('data-arrange-zoom-limit'));
    const originalDistance = distance(await position(scene), (await scene.getAttribute('data-camera-target'))!.split(',').map(Number));
    expect(limit).toBeGreaterThanOrEqual(originalDistance * 3.9);
    expect(Number(await scene.getAttribute('data-camera-far'))).toBeGreaterThan(limit);
    await canvas.hover();
    await page.mouse.wheel(0, 15000);
    await expect.poll(async () => distance(await position(scene), (await scene.getAttribute('data-camera-target'))!.split(',').map(Number))).toBeGreaterThan(originalDistance * 2.5);
    await page.screenshot({ path: testInfo.outputPath(`arrange-far-${width}.png`) });
    await page.getByRole('button', { name: 'Walk preview', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera-fov', width === 390 ? '78.0' : '62.0');
    const panel = scene.locator('.walk-preferences');
    const trigger = panel.locator('summary');
    await trigger.click();
    await expect(page.getByRole('slider', { name: 'Walking speed', exact: true })).toHaveValue('1.25');
    const before = await position(scene);
    await page.getByRole('slider', { name: 'Field of view', exact: true }).fill('86');
    await page.getByRole('slider', { name: 'Walking speed', exact: true }).fill('2');
    await expect(scene).toHaveAttribute('data-camera-fov', '86.0');
    expect(distance(before, await position(scene))).toBeLessThan(.01);
    await expect(canvas).toHaveAttribute('data-walk-pace', '2');
    for (const control of await panel.locator('summary, input, button').all()) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: testInfo.outputPath(`view-pace-${width}.png`) });
    await page.getByRole('slider', { name: 'Walking speed', exact: true }).press('Escape');
    await expect(panel).not.toHaveAttribute('open');
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Arrange', exact: true }).click();
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: 'Walk preview', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera-fov', '86.0');
    await scene.locator('[data-visitor-reset-view]').click();
    await expect(scene).toHaveAttribute('data-camera-fov', '86.0');
    await scene.locator('[data-visitor-smart-view]').click();
    await expect(scene).toHaveAttribute('data-camera-fov', '86.0');
    await scene.locator('[data-visitor-tour-control]').click();
    await expect(scene).toHaveAttribute('data-camera-fov', '86.0');
    await trigger.click();
    await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera-fov', width === 390 ? '78.0' : '62.0');
    await expect(canvas).toHaveAttribute('data-walk-pace', '1.25');
    await expect(canvas).toHaveAttribute('data-test-identity', 'persistent');
    await expect(page.locator('.studio')).toContainText('Draft · Not live');
    expect(errors).toEqual([]);
  });

  test(`${width}px requested lens survives an immediate Arrange round trip`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/create/pavilion/demo');
    const scene = page.locator('.studio .gallery-scene');
    await expect(scene).toHaveAttribute('data-arrival', 'ready');
    const canvas = scene.locator('canvas');
    await canvas.evaluate(el => { el.dataset.testIdentity = 'persistent'; });
    await page.getByRole('button', { name: 'Walk preview', exact: true }).click();

    // Wheel requests a lens before easing finishes; a fast mode switch must
    // restore that requested value, not the intermediate rendered camera.
    await canvas.hover(); await page.mouse.wheel(0, 200);
    await expect.poll(async () => Number(await canvas.getAttribute('data-walk-fov'))).toBeGreaterThan(width === 390 ? 78 : 62);
    const requestedFov = Number(await canvas.getAttribute('data-walk-fov'));
    await page.getByRole('button', { name: 'Arrange', exact: true }).click();
    await page.getByRole('button', { name: 'Walk preview', exact: true }).click();
    await expect(scene).toHaveAttribute('data-camera-fov', requestedFov.toFixed(1));
    await expect(canvas).toHaveAttribute('data-test-identity', 'persistent');
    await expect(page.locator('.studio')).toContainText('Draft · Not live');
    expect(errors).toEqual([]);
  });
}

test('Danny uses the same mobile lens and session settings after Overview and reset', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/demo');
  const scene = page.locator('.gallery-scene');
  const trigger = scene.locator('.walk-preferences summary');
  await trigger.click();
  await expect(page.getByRole('slider', { name: 'Field of view', exact: true })).toHaveValue('78');
  await page.getByRole('slider', { name: 'Field of view', exact: true }).fill('88');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(trigger).toBeHidden();
  await page.getByRole('button', { name: 'Walk', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(scene).toHaveAttribute('data-camera-fov', '88.0');
});

test('Arrange has single-tap zoom alternatives that preserve the renderer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/create/white-cube/demo');
  const scene = page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival', 'ready');
  const from = await position(scene);
  const target = (await scene.getAttribute('data-camera-target'))!.split(',').map(Number);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => distance(await position(scene), target)).toBeGreaterThan(distance(from, target) * 1.3);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => distance(await position(scene), from)).toBeLessThan(.1);
});

test('walking pace changes both keyboard and mobile hold movement without escaping room bounds', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/create/pavilion/demo');
  const scene = page.locator('.studio .gallery-scene');
  await expect(scene).toHaveAttribute('data-arrival', 'ready');
  await page.getByRole('button', { name: 'Walk preview', exact: true }).click();
  const canvas = scene.locator('canvas');
  for (const input of ['keyboard', 'hold']) {
    const travelled: number[] = [];
    for (const pace of ['0.5', '2']) {
      await page.getByRole('button', { name: 'Reset view', exact: true }).click();
      // Camera diagnostics publish on a cadence; observe the reset pose before
      // measuring distance so the previous run is not counted as movement.
      await expect.poll(() => position(scene)).toEqual([0, 1.75, 29]);
      await scene.locator('.walk-preferences summary').click();
      await page.getByRole('slider', { name: 'Walking speed', exact: true }).fill(pace);
      await expect(canvas).toHaveAttribute('data-walk-pace', pace);
      await page.getByRole('slider', { name: 'Walking speed', exact: true }).press('Escape');
      const from = await position(scene);
      if (input === 'keyboard') {
        await canvas.focus();
        await holdThroughMovementSample(
          page,
          scene,
          () => page.keyboard.down('w'),
          () => page.keyboard.up('w'),
        );
      } else {
        const box = await page.getByRole('button', { name: 'Move forward', exact: true }).boundingBox();
        await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
        await holdThroughMovementSample(
          page,
          scene,
          () => page.mouse.down(),
          () => page.mouse.up(),
        );
      }
      await expect.poll(async () => distance(from, await position(scene))).toBeGreaterThan(.2);
      const to = await position(scene);
      travelled.push(distance(from, to));
      expect(Math.abs(to[0])).toBeLessThan(20);
      expect(Math.abs(to[2])).toBeLessThan(30);
    }
    expect(travelled[0]).toBeGreaterThan(.2);
    expect(travelled[1]).toBeGreaterThan(travelled[0] * 2);
  }
});
