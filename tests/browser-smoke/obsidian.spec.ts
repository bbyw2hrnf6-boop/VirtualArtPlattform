import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test.describe(`Obsidian at ${viewport.width}`, () => {
    const mobile = viewport.width === 390;
    test.use({ viewport, hasTouch: mobile, isMobile: mobile });
    test('shares Space navigation, reaches floor targets while looking, and retains artwork access', async ({ page, context }, info) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', message => { if (message.type() === 'error' && /shader|webgl|gl_invalid|texture/i.test(message.text())) errors.push(message.text()); });
      await page.goto('/#/showcase/obsidian');
      await expect(page.getByRole('heading', { name: 'Obsidian.', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Enter the exhibition' }).click();
      const scene = page.locator('.obsidian__scene');
      const canvas = scene.locator('canvas');
      await expect(scene).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
      await page.getByRole('button', { name: 'Exit flight', exact: true }).click();
      await expect(canvas).toBeFocused();
      await expect(page.locator('.visitor-controls')).toBeVisible();
      await expect(page.getByRole('button', { name: /Controls How to explore/ })).toHaveCount(0);
      await expect(page.getByText(/W\/S move/)).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('obsidian-room-1.png') });
      const size = (await canvas.boundingBox())!;
      const floorPoint = { x: size.x + size.width * (mobile ? .1 : .22), y: size.y + size.height * (mobile ? .68 : .86) };
      const initialPosition = await scene.getAttribute('data-position');
      if (mobile) await page.touchscreen.tap(floorPoint.x, floorPoint.y);
      else await page.mouse.click(floorPoint.x, floorPoint.y);
      await expect(scene).toHaveAttribute('data-destination', 'true');
      const target = (await scene.getAttribute('data-target'))!.split(',').map(Number);
      const beforePitch = Number(await scene.getAttribute('data-pitch'));
      if (mobile) {
        // Chromium's native input pipeline: a single finger looks while the
        // floor route continues; releasing it must not become a second tap.
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: size.width * .5, y: size.y + size.height * .5, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: size.width * .5 + 30, y: size.y + size.height * .5 - 65, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.keyboard.down('e');
        await expect.poll(async () => Number(await scene.getAttribute('data-pitch'))).toBeGreaterThan(beforePitch + .05);
        await page.keyboard.up('e');
      }
      await expect(scene).not.toHaveAttribute('data-position', initialPosition!);
      await expect.poll(async () => Number(await scene.getAttribute('data-pitch'))).toBeGreaterThan(beforePitch + .05);
      expect((await scene.getAttribute('data-target'))!.split(',').map(Number)).toEqual(target);
      // Verify arrival, not merely a destination flag or a single movement frame.
      await expect.poll(async () => {
        const p = (await scene.getAttribute('data-position'))!.split(',').map(Number);
        return Math.hypot(p[0] - target[0], p[2] - target[2]);
        // Full-quality SwiftShader advances the collision-safe 50 ms timestep
        // at low frame rates. Verify physical arrival without altering that cap.
      }, { timeout: 60_000 }).toBeLessThan(.2);
      await expect(scene).toHaveAttribute('data-idle', 'true');
      await expect(scene).toHaveAttribute('data-destination', 'false');
      if (!mobile) {
        const up = Number(await scene.getAttribute('data-pitch'));
        await page.keyboard.down('q');
        await expect.poll(async () => Number(await scene.getAttribute('data-pitch'))).toBeLessThan(up - .05);
        await page.keyboard.up('q');
        const beforeArrow = Number(await scene.getAttribute('data-pitch'));
        await page.keyboard.down('ArrowUp');
        await expect.poll(async () => Number(await scene.getAttribute('data-pitch'))).toBeGreaterThan(beforeArrow + .05);
        await page.keyboard.up('ArrowUp');
        for (const key of ['w', 'a', 's', 'd']) {
          const p = await scene.getAttribute('data-position');
          await page.keyboard.down(key);
          await expect(scene).not.toHaveAttribute('data-position', p!);
          await page.keyboard.up(key);
          await expect(scene).toHaveAttribute('data-idle', 'true');
        }
      }
      const beforeZoom = Number(await scene.getAttribute('data-fov'));
      await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
      await expect.poll(async () => Number(await scene.getAttribute('data-fov'))).toBeGreaterThan(beforeZoom + 3);
      await expect(scene).toHaveAttribute('data-idle', 'true');
      if (mobile) {
        const fov = await canvas.getAttribute('data-walk-fov');
        const p = await scene.getAttribute('data-position');
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 110, y: 380, id: 1 }, { x: 240, y: 380, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 85, y: 380, id: 1 }, { x: 300, y: 380, id: 2 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
        await expect(canvas).not.toHaveAttribute('data-walk-fov', fov!);
        await expect(scene).toHaveAttribute('data-destination', 'false');
        await expect(scene).toHaveAttribute('data-position', p!);
        await expect(scene).toHaveAttribute('data-idle', 'true');
      }
      const walkPosition = await scene.getAttribute('data-position');
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
      await expect(page.getByRole('button', { name: 'Walk', exact: true })).toHaveCSS('background-color', 'rgb(239, 238, 232)');
      await expect(canvas).toHaveAttribute('data-walk-fov', walkFov!);
      expect(await sameCanvas!.evaluate(el => el === document.querySelector('.obsidian__scene canvas'))).toBe(true);
      await expect(scene).toHaveAttribute('data-reflection', 'planar');
      for (const [i, name] of ['Living Matter', 'Future Nature'].entries()) {
        await page.getByRole('combobox', { name: 'Exhibition room' }).selectOption(String(i + 1));
        await expect(page.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath(`obsidian-${name.toLowerCase().replaceAll(' ', '-')}.png`) });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Open artwork list, 11 works', exact: true }).click();
      await page.getByRole('button', { name: /Canopy of Tomorrow/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('img')).toHaveAttribute('src', /A01.webp$/);
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(page.getByRole('button', { name: /Canopy of Tomorrow/ })).toBeFocused();
      await page.getByRole('button', { name: 'Enter the exhibition' }).click();
      await expect(scene).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
      await page.getByRole('button', { name: 'Exit flight', exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Botanical Origins', exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test('Obsidian keeps the collection available when WebGL assets fail', async ({ page }) => {
  await page.route('**/obsidian-*.glb', route => route.abort());
  await page.goto('/#/showcase/obsidian');
  await page.getByRole('button', { name: 'Enter the exhibition' }).click();
  await expect(page.getByRole('status')).toContainText('The 3D view could not load');
  await expect(page.locator('.obsidian__art-grid button')).toHaveCount(11);
});
