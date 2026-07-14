import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('topic hub index lists the 7 themes', async ({ page }) => {
  await page.goto('./topics/');
  await expect(page.locator('[data-theme-card]')).toHaveCount(7);
});

test('a theme view shows grouped items and sub-tag nav', async ({ page }) => {
  await page.goto('./topics/?t=metabolism-modeling');
  // client-rendered from the ?t= param
  await expect(page.locator('.th-title')).toHaveText(/Metabolism/);
  await expect(page.getByRole('heading', { name: /Papers/ })).toBeVisible();
  await expect(page.locator('.th-subtag').first()).toBeVisible();
});

test('topic chips are not offset by Starlight prose-flow margins (#67 trap)', async ({ page }) => {
  await page.goto('./software/');
  await expect(page.locator('.topic-chip').first()).toBeVisible();
  // every chip <li> must have margin-top 0, or the 2nd+ chip drops below the first
  const margins = await page.locator('.topic-chips li').evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).marginTop),
  );
  expect(margins.length).toBeGreaterThan(1);
  expect(margins.every((m) => m === '0px')).toBe(true);
});

test('the topic hub has no axe accessibility violations', async ({ page }) => {
  await page.goto('./topics/');
  await expect(page.locator('[data-theme-card]').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
