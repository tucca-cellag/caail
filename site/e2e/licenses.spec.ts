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

test('the /licenses/ hub lists the 4 tiers', async ({ page }) => {
  await page.goto('./licenses/');
  await expect(page.locator('.lh-tier-card')).toHaveCount(4);
});

test('a tier view shows a cross-content list (?tier=restricted)', async ({ page }) => {
  await page.goto('./licenses/?tier=restricted');
  await expect(page.locator('.lh-title')).toHaveText(/Restricted/);
  // restricted spans at least software + databases
  await expect(page.getByRole('heading', { name: /Software/ })).toBeVisible();
  await expect(page.locator('.lh-item').first()).toBeVisible();
});

test('a card badge navigates to the hub filtered to its tier', async ({ page }) => {
  await page.goto('./software/');
  const badge = page.locator('.cb-card .lic-badge--permissive').first();
  await badge.click();
  await expect(page).toHaveURL(/\/licenses\/\?tier=permissive/);
  await expect(page.locator('.lh-title')).toHaveText(/Permissive/);
});

test('the /licenses/ hub has no axe violations', async ({ page }) => {
  await page.goto('./licenses/');
  await expect(page.locator('.lh-tier-card').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('the catalog license facet narrows the grid to a tier', async ({ page }) => {
  await page.goto('./software/');
  const total = await page.locator('.cb-card').count();
  await page.getByRole('button', { name: 'Restricted' }).click();
  const narrowed = await page.locator('.cb-card').count();
  expect(narrowed).toBeGreaterThan(0);
  expect(narrowed).toBeLessThan(total);
  // every visible card now carries a restricted badge (or the facet is exclusive)
  await expect(page.locator('.cb-card .lic-badge--permissive')).toHaveCount(0);
  // clearing restores
  await page.getByRole('button', { name: 'Restricted' }).click();
  expect(await page.locator('.cb-card').count()).toBe(total);
});
