import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Talks.md → grouped inline embeds on /talks
// ---------------------------------------------------------------------------

test('talks renders its talk sections with embeds (playlists now live in the AI primer)', async ({ page }) => {
  await page.goto('./talks/');
  for (const h of ['Applied AI/ML for Cellular Agriculture', 'AI Agents & Foundation Models for Biology']) {
    await expect(page.getByRole('heading', { name: h })).toBeVisible();
  }
  // The AI Fundamentals playlists moved to /primers/ai/.
  await expect(page.getByRole('heading', { name: 'AI Fundamentals' })).toHaveCount(0);
  expect(await page.locator('lite-youtube').count()).toBeGreaterThan(1); // video facades

  // right-rail "On This Page" lists the sections, and every anchor resolves
  expect(await page.locator('starlight-toc a').count()).toBeGreaterThan(1); // Overview + sections
  const unresolved = await page.evaluate(() =>
    [...document.querySelectorAll('starlight-toc a')]
      .map((a) => a.getAttribute('href') || '')
      .filter((h) => h.startsWith('#') && h.length > 1)
      .filter((h) => !document.getElementById(h.slice(1))),
  );
  expect(unresolved).toEqual([]);
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
  // a representative section that remains in the file after the split-out
  await expect(page.getByRole('heading', { name: 'Cell-Ag Ecosystem Initiatives' })).toBeVisible();
  // the moved video/talk sections are no longer headings here
  await expect(page.getByRole('heading', { name: 'Applied AI/ML for Cellular Agriculture' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'AI Agents & Foundation Models for Biology' })).toHaveCount(0);
  // the split-out sections are gone too (Books → Reference Works, Courses → primer, bibliographies → Awesome Lists)
  await expect(page.getByRole('heading', { name: 'Books' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Courses' })).toHaveCount(0);
  // its own native heading TOC (real markdown headings)
  await expect(page.locator('starlight-toc a').filter({ hasText: 'Editorials & Opinion' })).toHaveCount(1);
  // internal links rewritten: rendered prose page → site route; deferred file → GitHub blob; no raw .md
  await expect(page.locator('main a[href="/caail/reference-works/"]').first()).toBeVisible();
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
// AIAgentsFoundationModels.md — the thematic hub (now owns Virtual Cell)
// ---------------------------------------------------------------------------

test('ai-agents-foundation-models renders its sections and rewritten links', async ({ page }) => {
  await page.goto('./ai-agents-foundation-models/');
  // the Virtual Cell section now lives here, not on /other-resources/
  await expect(page.getByRole('heading', { name: 'Virtual Cell Initiative & Single-Cell Foundation Models' })).toBeVisible();
  // a rendered-page cross-link resolves to a site route (Datasets/Benchmarks.md → route)
  await expect(page.locator('main a[href="/caail/datasets/benchmarks/"]').first()).toBeVisible();
  // a deferred-file cross-link falls back to a GitHub blob URL (Software.md)
  await expect(
    page.locator('main a[href^="https://github.com/tucca-cellag/caail/blob/main/Software.md"]').first(),
  ).toBeVisible();
  // no raw repo-relative .md link leaks through
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

test('other-resources no longer renders the Virtual Cell heading', async ({ page }) => {
  await page.goto('./other-resources/');
  await expect(page.getByRole('heading', { name: 'Virtual Cell Initiative & Single-Cell Foundation Models' })).toHaveCount(0);
});

test('ai-agents-foundation-models has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./ai-agents-foundation-models/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Taxonomy.md — the prose remark guard must transform it like every other page
// (regression guard for the CAAIL_PAGES-derived caailProseRemark guard)
// ---------------------------------------------------------------------------

test('taxonomy renders a single h1 and rewrites its internal links', async ({ page }) => {
  await page.goto('./taxonomy/');
  // stripLeadingH1 ran: only Starlight's page-title h1 remains (not also the
  // body's "# Matrix taxonomy …" — that duplicate was the guard-gap symptom).
  await expect(page.locator('h1')).toHaveCount(1);
  // rewriteCaailLinks ran: the lone internal ./Papers.md link became a GitHub
  // blob URL (Papers isn't a rendered page) instead of a dead ./Papers.md.
  await expect(
    page.locator('main a[href^="https://github.com/tucca-cellag/caail/blob/main/Papers.md"]').first(),
  ).toBeVisible();
  // no raw repo-relative .md link leaks through
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

test('taxonomy has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./taxonomy/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Software/Databases catalog cards (right-rail TOC + surfaced hyperlinks)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// AwesomeLists.md → card island at /awesome-lists (split out of OtherResources)
// ---------------------------------------------------------------------------

test('awesome-lists renders metric cards, a right-rail TOC, and surfaced links', async ({ page }) => {
  await page.goto('./awesome-lists/');
  // Card grid (one article per curated list) with title links.
  expect(await page.locator('article.cb-card > h3 .cb-name-link').count()).toBeGreaterThan(15);
  // Build-time GitHub metrics: at least one star count + an "as of" caption.
  expect(await page.locator('.al-stat').count()).toBeGreaterThan(10);
  await expect(page.locator('.cb-count')).toContainText('metrics as of');
  // Right-rail TOC lists the topic groups and every in-page anchor resolves.
  const unresolved = await page.evaluate(() =>
    [...document.querySelectorAll('starlight-toc a')]
      .map((a) => a.getAttribute('href') || '')
      .filter((h) => h.startsWith('#') && h.length > 1)
      .filter((h) => !document.getElementById(h.slice(1))),
  );
  expect(unresolved).toEqual([]);
  // No nested anchors (the metric/summary content carries its own links).
  expect(await page.locator('a a').count()).toBe(0);
});

test('awesome-lists has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./awesome-lists/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Funding.md → /funding (split out of OtherResources' Ecosystem Initiatives)
// ---------------------------------------------------------------------------

test('funding renders its bodies + opportunities and rewritten links', async ({ page }) => {
  await page.goto('./funding/');
  await expect(page.getByRole('heading', { name: 'Funding Organizations' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Funding Opportunities & Programs' })).toBeVisible();
  // a rendered-prose cross-link resolves to a site route (./OtherResources.md → route)
  await expect(page.locator('main a[href="/caail/other-resources/"]').first()).toBeVisible();
  // no raw repo-relative .md link leaks through
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

test('funding has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./funding/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// ReferenceWorks.md → /reference-works (Books split out; keeps the DOI table)
// ---------------------------------------------------------------------------

test('reference-works keeps the Encyclopedia entry, its anchor, and the chapter table', async ({ page }) => {
  await page.goto('./reference-works/');
  await expect(
    page.getByRole('heading', { name: 'Encyclopedia of Meat Sciences, 3rd edition' }),
  ).toBeVisible();
  // The deep-link target the Datasets/ResearchAreas pages point at must exist here.
  expect(await page.locator('#encyclopedia-of-meat-sciences-3rd-edition').count()).toBe(1);
  // The DOI chapter-index table survived the move (renders as a real table).
  await expect(page.locator('main table')).toBeVisible();
  expect(await page.locator('main table a[href^="https://doi.org/"]').count()).toBeGreaterThan(10);
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

test('reference-works has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./reference-works/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

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

  test(`${kind} cards surface inline hyperlinks with no a11y violations`, async ({ page }) => {
    await page.goto(`./${kind}/`);
    // Each card is a container (not a wrapping anchor) with a title link…
    // (the h3 sits in a `.cb-head` row alongside the license badge, so this is a
    // descendant match, not a direct child).
    expect(await page.locator('article.cb-card h3 .cb-name-link').count()).toBeGreaterThan(10);
    // …and a summary that carries the canonical markdown's own clickable links.
    expect(await page.locator('.cb-sum a').count()).toBeGreaterThan(5);
    // No repo-relative .md link leaks through (all rewritten to routes/GitHub).
    await expect(page.locator('.cb-sum a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
    // No nested anchors — invalid HTML and an a11y hazard the old card risked.
    expect(await page.locator('a a').count()).toBe(0);

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
