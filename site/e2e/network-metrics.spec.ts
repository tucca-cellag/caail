import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seriousOnly = (results: { violations: { impact?: string | null }[] }) =>
  results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));

// ---------------------------------------------------------------------------
// M6 — By the Numbers (server-rendered dashboard)
// ---------------------------------------------------------------------------

test('by-the-numbers renders coverage, species bars, and momentum (no JS needed)', async ({ page }) => {
  await page.goto('./by-the-numbers/');
  await expect(page.getByRole('heading', { name: 'Research coverage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /where help is wanted/i })).toBeVisible();
  // a dense species bar and the recruitment signal both render (scope to the
  // dashboard's bar labels — "Fish" also appears in the sidebar nav)
  await expect(page.locator('.md-label').filter({ hasText: 'Fish' })).toBeVisible();
  await expect(page.locator('.md-row.stub .md-val').first()).toBeVisible();
});

test('by-the-numbers has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./by-the-numbers/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = seriousOnly(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// M5 — Citation Network (Cytoscape island)
// ---------------------------------------------------------------------------

test('citation network hydrates and renders the graph canvas', async ({ page }) => {
  await page.goto('./papers/network/');
  // client:idle → cytoscape mounts <canvas> layers into .ng-canvas
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });
  expect(await page.locator('.ng-canvas canvas').count()).toBeGreaterThan(0);
  await expect(page.getByText(/shared-author links/)).toBeVisible();
});

test('citation network has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = seriousOnly(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
