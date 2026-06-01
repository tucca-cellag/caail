import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Talks.md → grouped inline embeds on /talks
// ---------------------------------------------------------------------------

test('talks renders the three sections with embeds and playlist cards', async ({ page }) => {
  await page.goto('./talks/');
  for (const h of ['Applied AI/ML for Cellular Agriculture', 'AI Agents & Foundation Models for Biology', 'AI Fundamentals']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  expect(await page.locator('lite-youtube').count()).toBeGreaterThan(1); // video facades
  expect(await page.locator('a.talk-card').count()).toBeGreaterThan(0); // playlist cards
});

test('talks has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./talks/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// OtherResources.md surfaced as a prose page (talks/videos now live on /talks)
// ---------------------------------------------------------------------------

test('other-resources renders sections, a native TOC, and rewritten links', async ({ page }) => {
  await page.goto('./other-resources/');
  // a representative section from deep in the file
  await expect(page.getByRole('heading', { name: 'Books' })).toBeVisible();
  // the moved video/talk sections are no longer headings here
  await expect(page.getByRole('heading', { name: 'Applied AI/ML for Cellular Agriculture' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'AI Agents & Foundation Models for Biology' })).toHaveCount(0);
  // its own native heading TOC (real markdown headings)
  await expect(page.locator('starlight-toc a').filter({ hasText: 'Editorials & Opinion' })).toHaveCount(1);
  // internal links rewritten: rendered page → site route; deferred file → GitHub blob; no raw .md
  await expect(page.locator('main a[href="/caail/datasets/cow/"]').first()).toBeVisible();
  await expect(
    page.locator('main a[href^="https://github.com/tucca-cellag/caail/blob/main/Papers.md"]').first(),
  ).toBeVisible();
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

test('other-resources has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./other-resources/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Software/Databases right-rail "On This Page" lists the application areas
// ---------------------------------------------------------------------------

for (const kind of ['software', 'databases'] as const) {
  test(`${kind} has a right-rail TOC listing its application areas (anchors resolve)`, async ({ page }) => {
    await page.goto(`./${kind}/`);
    const tocLinks = page.locator('starlight-toc a');
    // Overview + ≥1 area
    expect(await tocLinks.count()).toBeGreaterThan(1);
    // every in-page anchor in the TOC resolves to a real element id
    const unresolved = await page.evaluate(() => {
      const links = [...document.querySelectorAll('starlight-toc a')] as HTMLAnchorElement[];
      return links
        .map((a) => a.getAttribute('href') || '')
        .filter((h) => h.startsWith('#') && h.length > 1)
        .filter((h) => !document.getElementById(h.slice(1)));
    });
    expect(unresolved).toEqual([]);
  });
}
