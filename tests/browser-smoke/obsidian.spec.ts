import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Obsidian loads all rooms, movement and artwork access at ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/#/showcase/obsidian');
    await expect(page.getByRole('heading', { name: 'Obsidian.', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Enter the exhibition' }).click();
    const scene = page.locator('.obsidian__scene');
    await expect(scene).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
    await page.screenshot({ path: info.outputPath('obsidian-room-1.png') });
    const start = await scene.getAttribute('data-position');
    await scene.focus();
    await page.keyboard.down('w');
    await expect(scene).not.toHaveAttribute('data-position', start!);
    await page.keyboard.up('w');
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
