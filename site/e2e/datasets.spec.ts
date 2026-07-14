import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('curated dataset entries render as tagged cards on /datasets/chicken/', async ({ page }) => {
  await page.goto('./datasets/chicken/');
  // Featured atlas (linked) and GEM (unlinked) both become cards.
  await expect(page.locator('#ds-chickengtex-portal.ds-card')).toBeVisible();
  const gem = page.locator('.ds-card--gem').first();
  await expect(gem).toBeVisible();
  await expect(gem).toContainText('iES1300');
  // At least one card carries topic chips linking to the hub.
  const chip = page.locator('.ds-card .topic-chip').first();
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('href', /\/topics\/\?t=/);
});

test('the inventory table and narrative stay intact (not carded)', async ({ page }) => {
  await page.goto('./datasets/chicken/');
  // The `## Complete data inventory` table still renders as a real table…
  await expect(page.getByRole('heading', { name: 'Complete data inventory' })).toBeVisible();
  await expect(page.locator('table').first()).toBeVisible();
  // …and its rows are NOT wrapped in a dataset card.
  await expect(page.locator('.ds-card table')).toHaveCount(0);
});

test('dataset-card chips are not offset by Starlight prose-flow margins (#67 trap)', async ({ page }) => {
  await page.goto('./datasets/chicken/');
  await expect(page.locator('.ds-card .topic-chip').first()).toBeVisible();
  const margins = await page.locator('.ds-card .topic-chips li').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).marginTop),
  );
  expect(margins.length).toBeGreaterThan(1);
  expect(margins.every((m) => m === '0px')).toBe(true);
});

test('the datasets page has no axe accessibility violations', async ({ page }) => {
  await page.goto('./datasets/chicken/');
  await expect(page.locator('.ds-card').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
