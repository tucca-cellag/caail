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

test('research area prose page renders with its mapped title', async ({ page }) => {
  await page.goto('./research-areas/bioprocess/');
  await expect(page.getByRole('heading', { level: 1, name: 'Bioprocess control' })).toBeVisible();
});

test('internal prose link to a rendered page resolves to a site route; deferred falls back to GitHub', async ({ page }) => {
  await page.goto('./datasets/cow/');
  const main = page.locator('main');
  // a link to a rendered ResearchAreas/Datasets page is a /caail/... route (ends with /)
  await expect(main.locator('a[href*="/caail/"][href$="/"]').first()).toBeVisible();
  // a deferred target (Software/Databases/Papers) falls back to a GitHub blob URL
  await expect(main.locator('a[href^="https://github.com/tucca-cellag/caail/blob/main/"]').first()).toBeVisible();
  // no raw relative .md links remain in the prose body
  await expect(main.locator('a[href$=".md"]')).toHaveCount(0);
});

test('pagefind indexes prose content', async ({ page }) => {
  await page.goto('./');
  // Open Starlight search. Prefer the visible search button; fall back to the "/" shortcut.
  const searchButton = page.getByRole('button', { name: /search/i });
  if (await searchButton.count()) { await searchButton.first().click(); } else { await page.keyboard.press('/'); }
  const input = page.getByPlaceholder(/search/i);
  await input.fill('bioprocess');
  // Pagefind renders result links; expect a result pointing at the bioprocess page.
  await expect(page.locator('a[href*="/research-areas/bioprocess"]').first()).toBeVisible({ timeout: 10000 });
});
