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

test('the topic hub has no axe accessibility violations', async ({ page }) => {
  await page.goto('./topics/');
  await expect(page.locator('[data-theme-card]').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
