import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { awaitHydrated } from './hydration';

/**
 * Ground truths read from the parser's generated reports.json rather than
 * hard-coded, so adding an edition (or next year's series) exercises the same
 * assertions instead of reddening unrelated tests. Mirrors e2e/data.ts.
 */
type Report = {
  id: string;
  seriesSlug: string | null;
  current: boolean;
  supersededBy: string | null;
};
const dataDir = fileURLToPath(new URL('../src/content/data/', import.meta.url));
const RECORDS = (JSON.parse(readFileSync(`${dataDir}reports.json`, 'utf8')) as { reports: Report[] }).reports;
const SERIES_COUNT = new Set(RECORDS.map((r) => r.seriesSlug ?? r.id)).size;
const CURRENT_COUNT = RECORDS.filter((r) => r.current).length;
const SUPERSEDED_COUNT = RECORDS.length - CURRENT_COUNT;

test('the field reports page renders one card per edition, grouped by series', async ({ page }) => {
  await page.goto('./field-reports/');
  await awaitHydrated(page, 'FieldReports');
  await expect(page.locator('.cb-grp').first()).toBeVisible();
  await expect(page.locator('.cb-grp')).toHaveCount(SERIES_COUNT);
  await expect(page.locator('.cb-card')).toHaveCount(RECORDS.length);
});

test('the current edition of each series is badged, superseded editions link forward', async ({ page }) => {
  await page.goto('./field-reports/');
  await awaitHydrated(page, 'FieldReports');
  await expect(page.locator('.fr-current')).toHaveCount(CURRENT_COUNT);
  await expect(page.locator('.fr-superseded')).toHaveCount(SUPERSEDED_COUNT);

  // Every "superseded → see <edition>" link resolves to exactly one edition
  // card on the page (the derived current edition of its series).
  const links = page.locator('.fr-super-link');
  const n = await links.count();
  expect(n).toBe(RECORDS.filter((r) => r.supersededBy !== null).length);
  for (let i = 0; i < n; i++) {
    const href = await links.nth(i).getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!.startsWith('#')).toBe(true);
    await expect(page.locator(href!)).toHaveCount(1);
  }
});

test('the field reports page has no axe violations', async ({ page }) => {
  await page.goto('./field-reports/');
  await awaitHydrated(page, 'FieldReports');
  await expect(page.locator('.cb-grp').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
