import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { matrixUnreachedRefs, unreachedSectionCounts } from './data';

test('the reviews page renders one card per matrix-unreached reference', async ({ page }) => {
  await page.goto('./papers/reviews/');
  await expect(page.locator('.rs-group').first()).toBeVisible();
  await expect(page.locator('.px-ref')).toHaveCount(matrixUnreachedRefs().length);
});

test('the reviews page groups by Papers.md section with parser-derived counts', async ({ page }) => {
  await page.goto('./papers/reviews/');
  const sections = unreachedSectionCounts();
  await expect(page.locator('.rs-group')).toHaveCount(sections.size);
  // Reviews & Perspectives leads the shelves and its count matches the parser.
  const first = page.locator('.rs-group').first();
  await expect(first.locator('.rs-gtitle')).toHaveText('Reviews & Perspectives');
  await expect(first.locator('.rs-gcount')).toHaveText(String(sections.get('Reviews & Perspectives')));
});

test('reviews cards carry citation badges and topic chips, matching the Explorer', async ({ page }) => {
  await page.goto('./papers/reviews/');
  const badge = page.locator('.px-ref .cite-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/cited by/);
  await expect(page.locator('.px-ref .topic-chip').first()).toBeVisible();
});

test('the search box filters the shelves and restores them when cleared', async ({ page }) => {
  await page.goto('./papers/reviews/');
  const all = matrixUnreachedRefs().length;
  // getByLabel resolves via the input's aria-label, so this also pins the
  // accessible name (the search box is not just a bare placeholder).
  const search = page.getByLabel('Search reviews and reference works');
  await expect(page.locator('.px-ref')).toHaveCount(all);
  await search.fill('zzzznomatch');
  await expect(page.locator('.rs-empty')).toBeVisible();
  await expect(page.locator('.px-ref')).toHaveCount(0);
  await search.fill('');
  await expect(page.locator('.px-ref')).toHaveCount(all);
});

test('the reviews page has no axe violations', async ({ page }) => {
  await page.goto('./papers/reviews/');
  await expect(page.locator('.rs-group').first()).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
