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

// ---------------------------------------------------------------------------
// Curation.md → /curation (what a matrix placement rests on)
// ---------------------------------------------------------------------------

test('curation renders its evidence tables and dates its coverage figures', async ({ page }) => {
  await page.goto('./curation/');
  // The provenance table is what lets a curator weigh one placement against
  // another, and it is a GFM table, so a silent degradation to pipe text (the
  // failure mdx-gfm.spec.ts exists for) would remove the page's whole point.
  expect(await page.locator('main table').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('main table').filter({ hasText: 'methods_source' })).toHaveCount(1);
  // The coverage figures are a dated snapshot, not a live count: the corpus is
  // not committed, so nothing can derive them at build time. The date therefore
  // has to travel with the figures, and this asserts the ISO form rather than
  // just its presence — a refreshed figure left beside a stale or absent date is
  // the failure, and "Measured recently" would pass a presence check.
  await expect(page.locator('main')).toContainText(/Measured \d{4}-\d{2}-\d{2}\./);
  // Cross-links resolve: Taxonomy is a rendered route, Papers.md is not.
  await expect(page.locator('main a[href="/caail/taxonomy/"]').first()).toBeVisible();
  await expect(page.locator('main a[href$=".md"]:not([href*="github.com"])')).toHaveCount(0);
});

test('curation discloses that entries are AI-drafted, above the fold', async ({ page }) => {
  await page.goto('./curation/');
  // The whole page is an argument about controls on an AI-drafted catalogue, so
  // the disclosure has to arrive before the controls do, not be inferable from
  // them. Pinned because it is a sentence a later tightening pass would treat as
  // redundant with section 2 and cut, leaving the page reading as though a human
  // classified each paper.
  await expect(page.locator('main')).toContainText('Entries are drafted by AI agents');
  // …and it sits above the first section, not buried inside one. Compared against
  // a heading addressed by id rather than `h2:first`, since Starlight injects its
  // own "On this page" h2 into the same subtree.
  const disclosure = await page.getByText('Entries are drafted by AI agents').boundingBox();
  const firstSection = await page.locator('main h2#how-an-entry-is-produced').boundingBox();
  expect(disclosure!.y).toBeLessThan(firstSection!.y);
});

test('curation separates the intended process from the running one', async ({ page }) => {
  await page.goto('./curation/');
  const main = page.locator('main');
  // The page describes a pipeline that is partly built, so every stage carries a
  // status and the roadmap says what is missing. The failure this guards is a
  // later edit that reads the roadmap as a description of today and drops the
  // hedges, which would turn a plan into a claim.
  const stages = page.locator('main table').first();
  await expect(stages).toContainText('Status');
  await expect(stages).toContainText('being broadened');
  await expect(main.locator('h2#_6-roadmap, h2[id$="roadmap"]')).toHaveCount(1);
  // Both halves of the review claim, which are easy to lose in opposite
  // directions. Dropping the first understates CAAIL: every entry IS reviewed by
  // a person before it lands, so the pipeline is human-in-the-loop today.
  // Dropping the second overstates it: that review is two maintainers covering
  // eight themes, not a specialist per area, and the page must not read as
  // though the lead programme were already running.
  await expect(main).toContainText('reviewed by a person before it enters the catalogue');
  await expect(main).toContainText('cannot bring the depth a specialist in each would');
  await expect(main).toContainText('Validate the placements');
});

test('curation asks for topic leads and for feedback on the method itself', async ({ page }) => {
  await page.goto('./curation/');
  const main = page.locator('main');
  // The page's two recruitment asks. They are the reason a reader who is
  // qualified to disagree with the methodology has somewhere to go, and they are
  // the first thing a tightening pass cuts, because neither is load-bearing for
  // describing the process.
  await expect(main).toContainText('Becoming a topic lead');
  await expect(main).toContainText('Feedback on this methodology');
  // The lead ask is reachable from the section that explains the role, not only
  // from the bottom of the page.
  const contact = main.locator('h2[id$="get-in-touch"]');
  await expect(contact).toHaveCount(1);
  const id = await contact.getAttribute('id');
  // `:not(.sl-anchor-link)` is load-bearing, not tidiness. Starlight renders its own
  // permalink anchor ON the heading, inside <main> and pointing at the heading's own id,
  // so a bare count is >= 1 even with every body cross-link deleted — the assertion
  // passed while proving nothing. Excluding it counts only real body references.
  expect(await main.locator(`a[href="#${id}"]:not(.sl-anchor-link)`).count()).toBeGreaterThanOrEqual(1);
});

test('curation quotes no accuracy figure, only the process', async ({ page }) => {
  await page.goto('./curation/');
  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  // Internal sampling of classification accuracy exists, and quoting a figure
  // from it is a standing decision against: the samples are small, so a number
  // read as a general rate would both overclaim and alarm. "In progress" carries
  // the same information honestly. This is a SHAPE check rather than a list of
  // forbidden values, because a test naming them would publish them itself.
  //
  // Sentence-level, not proximity. The first version of this used a 40-character
  // window between the quantity and the error word, passed on the live page, and
  // did NOT match the sentence it was written to catch — the clause between the
  // two was longer than the window. It looked like a guard and guarded nothing.
  // Verified both ways before being trusted: it fires on that sentence, and the
  // whole current page produces no false positive.
  const QUANTITY = /\b\d+(\.\d+)?\s*(%|percent)\b|\b\d+\s+of\s+\d+\b|\bof\s+\d+\s+\w+.{0,60}?\b\d+\b/i;
  const ERRORWORD = /\b(wrong|incorrect|erroneous|inaccurate|misclassif\w*|misplaced|mis-assigned|error rate)\b/i;
  const offenders = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => QUANTITY.test(s) && ERRORWORD.test(s));
  expect(offenders, 'an accuracy figure reached the page').toEqual([]);
  // The replacement has to stay, or removing the figure silently removes the
  // disclosure too and the page reads as though accuracy were unexamined.
  await expect(page.locator('main')).toContainText('CAAIL does not publish one');
});

test('curation has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./curation/');
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
    expect(await page.locator('article.cb-card > h3 .cb-name-link').count()).toBeGreaterThan(10);
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
