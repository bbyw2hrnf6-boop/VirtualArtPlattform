import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const firebase = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'));
const candidatePolicy = firebase.hosting.headers
  .find((entry: { source?: string }) => entry.source === '**')?.headers
  .find((header: { key?: string }) => header.key === 'Content-Security-Policy-Report-Only')?.value;
const enforcePolicy = typeof candidatePolicy === 'string'
  ? candidatePolicy
      .split(';')
      .map((directive: string) => directive.trim())
      .filter((directive: string) => !directive.startsWith('report-uri ') && !directive.startsWith('report-to '))
      .join('; ')
  : '';

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

test('candidate CSP enforces on the bundled home and Create shells without violations', async ({ page }) => {
  test.skip(Boolean(process.env.LIEUVA_BROWSER_SMOKE_BASE_URL), 'Synthetic enforcement runs only against the local immutable build.');
  expect(enforcePolicy).not.toBe('');

  await page.addInitScript(() => {
    (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations?.push(
        `${event.effectiveDirective}:${event.blockedURI}`,
      );
    });
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': enforcePolicy },
    });
  });

  for (const path of ['/', '/#/create']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('#main-content')).toBeVisible();
    expect(await page.evaluate(() => (
      (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations ?? []
    ))).toEqual([]);
  }

  await page.getByRole('button', { name: /Try the White Cube with 3 sample works/i }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (
    (window as typeof window & { __lieuvaCspViolations?: string[] }).__lieuvaCspViolations ?? []
  ))).toEqual([]);
});
