import { expect, test } from '@playwright/test';

test('loads the public home and Create Space shell without browser errors', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/LIEUVA/);
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Follow the work.' })).toBeVisible();

  await page.goto('/#/create', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Create a Space.*LIEUVA/);
  await expect(page.getByRole('heading', { level: 1, name: /Choose your space/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Try the White Cube with 3 sample works/i })).toBeVisible();

  expect(pageErrors).toEqual([]);
});
