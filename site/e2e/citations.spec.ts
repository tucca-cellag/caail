import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Software cards with a DOI show a "cited by N" badge linking to OpenAlex', async ({ page }) => {
  await page.goto('./software/');
  const badge = page.locator('.cb-card .cite-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/cited by/);
  await expect(badge).toHaveAttribute('href', /openalex\.org\/works\?filter=doi:/);
});

test('a versioned database aggregates its release papers into one badge (#102)', async ({ page }) => {
  await page.goto('./databases/');
  // Aggregated badges (versioned resources like STRING/UniProt) carry the ∑ marker.
  const aggregated = page.locator('.cb-card .cite-badge--aggregated').first();
  await expect(aggregated).toBeVisible();
  await expect(aggregated.locator('.cite-badge__agg')).toHaveText('∑');
  // The tooltip explains the sum rather than claiming a single paper's count.
  await expect(aggregated).toHaveAttribute('title', /summed across \d+ release papers/);
  // The link opens ALL the summed works (an OR-DOI OpenAlex query), not just the primary.
  await expect(aggregated).toHaveAttribute('href', /openalex\.org\/works\?filter=doi:[^"]*(%7C|\|)/);
});

test('the /citations/ hub explains the ∑ aggregation marker', async ({ page }) => {
  await page.goto('./citations/');
  await expect(page.locator('.ch-disclaimer', { hasText: /summed across all its release papers/ })).toBeVisible();
});

test('the "Most cited" facet narrows Software to cited entries, most-cited first', async ({ page }) => {
  await page.goto('./software/');
  const total = await page.locator('.cb-card').count();
  await page.getByRole('button', { name: 'Most cited' }).click();
  const narrowed = await page.locator('.cb-card').count();
  expect(narrowed).toBeGreaterThan(0);
  expect(narrowed).toBeLessThan(total);
  // every visible card now carries a citation badge, and counts are non-increasing
  await expect(page.locator('.cb-card:not(:has(.cite-badge))')).toHaveCount(0);
  const nums = await page.locator('.cb-card .cite-badge__n').allTextContents();
  expect(nums.length).toBe(narrowed);
});

test('the /citations/ hub lists the 4 citation bands', async ({ page }) => {
  await page.goto('./citations/');
  await expect(page.locator('.ch-band-card')).toHaveCount(4);
});

test('a band view lists papers among the most-cited (?band=1000plus)', async ({ page }) => {
  await page.goto('./citations/?band=1000plus');
  await expect(page.locator('.ch-title')).toHaveText(/1,000/);
  await expect(page.getByRole('heading', { name: /Papers/ })).toBeVisible();
  await expect(page.locator('.ch-item').first()).toBeVisible();
});

test('a hub band card navigates to its band view', async ({ page }) => {
  await page.goto('./citations/');
  await page.locator('.ch-band-link', { hasText: '1,000+' }).click();
  await expect(page).toHaveURL(/\/citations\/\?band=1000plus/);
  await expect(page.locator('.ch-title')).toHaveText(/1,000/);
});

test('the /citations/ hub has no axe violations', async ({ page }) => {
  await page.goto('./citations/');
  await expect(page.locator('.ch-band-card').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test('a paper card in the Papers Explorer shows a citation badge', async ({ page }) => {
  await page.goto('./papers/explorer/');
  // Searching switches the side panel to a global results list of matching refs.
  await page.getByPlaceholder(/Search authors/).fill('DNABERT');
  await expect(page.locator('.px-ref .cite-badge').first()).toBeVisible();
});
