import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Homepage "Start here" — the four audience cards must be real, resolving links
// (regression guard for the bug where they were non-clickable <div>s).
// ---------------------------------------------------------------------------

test('homepage "Start here" cards link to the primers and the tools', async ({ page }) => {
  await page.goto('./');
  for (const href of [
    '/caail/primers/cell-ag/',
    '/caail/primers/ai/',
    '/caail/papers/explorer/',
    '/caail/datasets/readme/',
  ]) {
    await expect(page.locator(`section.start a.card[href="${href}"]`)).toHaveCount(1);
  }
});

// ---------------------------------------------------------------------------
// Primers/*.md → PrimerHub at /primers/cell-ag/ and /primers/ai/
// ---------------------------------------------------------------------------

test('cell-ag primer embeds the field-foundation videos and resolves its nav links', async ({ page }) => {
  await page.goto('./primers/cell-ag/');
  await expect(page.getByRole('heading', { name: 'Watch first — field foundations' })).toBeVisible();
  expect(await page.locator('lite-youtube').count()).toBe(5); // the five field-foundation videos
  // Internal CAAIL nav cards: same-tab links to real site routes (with anchors kept).
  await expect(page.locator('a.primer-nav[href="/caail/papers/explorer/"]')).toHaveCount(1);
  await expect(page.locator('a.primer-nav[href="/caail/reference-works/"]')).toHaveCount(1);
  await expect(page.locator('a.primer-nav[href="/caail/primers/ai/"]')).toHaveCount(1);
  // No repo-relative .md link leaks through (all rewritten to routes/GitHub).
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
  // No nested anchors (invalid HTML / a11y hazard).
  expect(await page.locator('a a').count()).toBe(0);
});

test('ai primer surfaces learning playlists and go-deeper nav links', async ({ page }) => {
  await page.goto('./primers/ai/');
  await expect(page.getByRole('heading', { name: 'Learn the fundamentals' })).toBeVisible();
  // External learning playlists (new-tab cards).
  expect(await page.locator('a.talk-card[target="_blank"]').count()).toBe(7);
  // Deep-link into the Talks page section that stayed in Talks.md.
  await expect(
    page.locator('a.primer-nav[href="/caail/talks/#ai-agents-foundation-models-for-biology"]'),
  ).toHaveCount(1);
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

for (const slug of ['cell-ag', 'ai'] as const) {
  test(`${slug} primer has no serious/critical a11y violations`, async ({ page }) => {
    await page.goto(`./primers/${slug}/`);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
