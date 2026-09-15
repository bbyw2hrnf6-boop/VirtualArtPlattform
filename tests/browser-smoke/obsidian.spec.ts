import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Obsidian loads all rooms, movement and artwork access at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' && /shader|webgl|gl_invalid|texture/i.test(message.text())) errors.push(message.text()); });
    await page.goto('/#/showcase/obsidian');
    await expect(page.getByRole('heading', { name: 'Obsidian.', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enter the exhibition' }).click();
    const scene = page.locator('.obsidian__scene');
    await expect(scene).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await page.screenshot({ path: info.outputPath('obsidian-room-1.png') });
    const canvas = scene.locator('canvas');
    const size = await canvas.boundingBox();
    await canvas.click({ position: { x: size!.width * (viewport.width === 390 ? .1 : .22), y: size!.height * (viewport.width === 390 ? .68 : .72) } });
    await expect(scene).toHaveAttribute('data-destination', 'true');
    const start = await scene.getAttribute('data-position');
    await canvas.focus();
    await page.keyboard.down('w');
    await expect(scene).not.toHaveAttribute('data-position', start!);
    await page.keyboard.up('w');
    await expect(scene).toHaveAttribute('data-idle', 'true');
    const walkPosition = await scene.getAttribute('data-position');
    const beforeZoom = Number(await scene.getAttribute('data-fov'));
    await canvas.dispatchEvent('wheel', { deltaY: 700 });
    await expect.poll(async () => Number(await scene.getAttribute('data-fov'))).toBeGreaterThan(beforeZoom + 3);
    await expect(scene).toHaveAttribute('data-idle', 'true');
    const walkFov = await canvas.getAttribute('data-walk-fov');
    const sameCanvas = await canvas.elementHandle();
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
    await expect(scene).toHaveAttribute('data-mode', 'overview');
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const overviewPosition = await scene.getAttribute('data-position');
    await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
    await expect(scene).not.toHaveAttribute('data-position', overviewPosition!);
    await page.screenshot({ path: info.outputPath('obsidian-overview.png') });
    await page.getByRole('button', { name: 'Walk', exact: true }).click();
    await expect(scene).toHaveAttribute('data-position', walkPosition!);
    await expect(canvas).toHaveAttribute('data-walk-fov', walkFov!);
    expect(await sameCanvas!.evaluate(el => el === document.querySelector('.obsidian__scene canvas'))).toBe(true);
    await expect(scene).toHaveAttribute('data-reflection', 'planar');
    if (viewport.width === 390) {
      const initial = await scene.getAttribute('data-position');
      const right = page.getByRole('button', { name: 'Move right', exact: true });
      await right.focus();
      await page.keyboard.down('Space');
      await expect(scene).not.toHaveAttribute('data-position', initial!);
      await page.keyboard.up('Space');
      await expect(scene).toHaveAttribute('data-idle', 'true');
      // Two fingers change FOV without becoming a tap-to-walk on release.
      await canvas.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 110, clientY: 340, button: 0 });
      await canvas.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 240, clientY: 340, button: 0 });
      await canvas.dispatchEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 310, clientY: 340 });
      await canvas.dispatchEvent('pointerup', { pointerId: 2, pointerType: 'touch', button: 0 });
      await canvas.dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', button: 0 });
      await expect(canvas).not.toHaveAttribute('data-walk-fov', walkFov!);
      await expect(scene).toHaveAttribute('data-destination', 'false');
    }
    for (const name of ['Living Matter', 'Future Nature']) {
      await page.getByRole('navigation', { name: 'Exhibition rooms' }).getByRole('button', { name: new RegExp(name) }).click();
      await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
      await page.screenshot({ path: info.outputPath(`obsidian-${name.toLowerCase().replaceAll(' ', '-')}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('link', { name: 'Browse the collection' }).click();
    await page.getByRole('button', { name: /Canopy of Tomorrow/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', /A01.webp$/);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Canopy of Tomorrow/ })).toBeFocused();
    await page.getByRole('button', { name: 'Enter the exhibition' }).click();
    await expect(scene).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Botanical Origins', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Obsidian keeps the collection available when WebGL assets fail', async ({ page }) => {
  await page.route('**/obsidian-*.glb', route => route.abort());
  await page.goto('/#/showcase/obsidian');
  await page.getByRole('button', { name: 'Enter the exhibition' }).click();
  await expect(page.getByRole('status')).toContainText('The 3D view could not load');
  await expect(page.locator('.obsidian__art-grid button')).toHaveCount(11);
});
