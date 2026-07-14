import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Software cards show tier-colored license badges linking to the hub', async ({ page }) => {
  await page.goto('./software/');
  const badge = page.locator('.cb-card .lic-badge').first();
  await expect(badge).toBeVisible();
  // badge links to the /licenses/ hub filtered to a tier
  await expect(badge).toHaveAttribute('href', /\/licenses\/\?tier=(permissive|copyleft|restricted|unknown)/);
  // at least one of each meaningful tier is present across the page
  await expect(page.locator('.lic-badge--permissive').first()).toBeVisible();
  await expect(page.locator('.lic-badge--restricted').first()).toBeVisible();
});

test('a manual (curated) badge is visually distinct (dashed)', async ({ page }) => {
  await page.goto('./software/');
  const manual = page.locator('.lic-badge--manual').first();
  await expect(manual).toBeVisible();
  const style = await manual.evaluate((el) => getComputedStyle(el).borderStyle);
  expect(style).toBe('dashed');
});

test('Databases cards also carry license badges', async ({ page }) => {
  await page.goto('./databases/');
  await expect(page.locator('.cb-card .lic-badge').first()).toBeVisible();
});

test('the license badges introduce no axe violations on /software/', async ({ page }) => {
  await page.goto('./software/');
  await expect(page.locator('.lic-badge').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
