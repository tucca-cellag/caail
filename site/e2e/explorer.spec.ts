import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage shows the sections grid with counts', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Explore the library' })).toBeVisible();
  await expect(page.getByRole('link', { name: /193 Papers/ }).first()).toBeVisible();
});

test('explorer cell click opens the reference side panel', async ({ page }) => {
  await page.goto('./papers/explorer/');
  await page.getByRole('button', { name: 'Deep Learning × Cellular Engineering: 7 papers' }).click();
  await expect(page.getByRole('heading', { name: 'Deep Learning × Cellular Engineering' })).toBeVisible();
  await expect(page.getByText(/Ji, Y\..*Davuluri, R\. V\. \(2021\)/)).toBeVisible();
  await expect(page.getByRole('link', { name: '10.1093/bioinformatics/btab083' })).toBeVisible();
  await expect(page.getByRole('link', { name: '⟨⟩ Code' }).first()).toBeVisible();
});

test('homepage has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
