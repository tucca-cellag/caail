import { test, expect } from '@playwright/test';
import { topics, type TopicCounts } from './data';

// ---------------------------------------------------------------------------
// TopicsBand — the homepage subject band (CAAIL-231).
//
// Every figure here is read from the parser's output rather than pinned, per the
// note in data.ts: an assertion that survives a content merge is a real
// parser-to-render consistency check, and one that doesn't is noise someone will
// eventually triage away.
//
// The zero test is the one that matters. The band's whole argument is that an
// empty content type is a result CAAIL returns rather than a gap it hides, and a
// rendered `0` is the only thing on the page that carries it. It is also exactly
// the detail a later tidy-up would remove as visual clutter, which is why it is
// asserted here and not left to the build-time guard alone — that guard proves
// the data still has a zero in it, not that the page still shows it.
// ---------------------------------------------------------------------------

test.use({ viewport: { width: 1600, height: 900 } });

/** The four types the cards render, in card order — the labels the band prints. */
const TYPES: { key: keyof TopicCounts; label: string }[] = [
  { key: 'paper', label: 'papers' },
  { key: 'software', label: 'software' },
  { key: 'database', label: 'databases' },
  { key: 'dataset', label: 'datasets' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('the band renders one card per theme, each deep-linking to its own topic view', async ({ page }) => {
  const cards = page.locator('#topics .card');
  await expect(cards).toHaveCount(topics.themes.length);

  for (const theme of topics.themes) {
    const card = page.locator(`#topics .card[href$="?t=${theme.slug}"]`);
    await expect(card, `no card deep-links to ${theme.slug}`).toHaveCount(1);
    await expect(card.locator('h3')).toHaveText(theme.label);
  }
});

test('each card reports the parser\'s per-type counts, and only those four', async ({ page }) => {
  for (const theme of topics.themes) {
    const card = page.locator(`#topics .card[href$="?t=${theme.slug}"]`);
    const pairs = await card.locator('.cell').evaluateAll((els) =>
      els.map((e) => ({
        label: e.querySelector('dt')?.textContent?.trim() ?? '',
        value: e.querySelector('dd')?.textContent?.trim() ?? '',
      })),
    );
    expect(pairs, `${theme.slug} card`).toEqual(
      TYPES.map((t) => ({ label: t.label, value: String(theme.counts[t.key]) })),
    );
  }
});

test('a theme with an empty content type shows the zero rather than omitting it', async ({ page }) => {
  // Derived, not named: whichever themes currently have an empty column are the
  // ones this asserts on, so the test tracks the corpus instead of pinning
  // Scaffolding & Biomaterials forever.
  const withEmpty = topics.themes.filter((t) => TYPES.some((ty) => t.counts[ty.key] === 0));
  expect(
    withEmpty.length,
    'no theme has an empty content type, so the band\'s returned-absence claim has nothing to show',
  ).toBeGreaterThan(0);

  for (const theme of withEmpty) {
    const card = page.locator(`#topics .card[href$="?t=${theme.slug}"]`);
    for (const ty of TYPES.filter((t) => theme.counts[t.key] === 0)) {
      const cell = card.locator(`.cell:has(dt:text-is("${ty.label}"))`);
      await expect(cell, `${theme.slug} → ${ty.label}`).toHaveAttribute('data-empty', 'true');
      await expect(cell.locator('dd')).toHaveText('0');
      await expect(cell).toBeVisible();
    }
  }
});

test('no card presents a total, which would read as a completeness claim', async ({ page }) => {
  for (const theme of topics.themes) {
    // Only meaningful where the total is distinguishable from the parts it sums;
    // if it collides with one of them the absence check cannot tell them apart.
    const parts = TYPES.map((t) => theme.counts[t.key]);
    if (parts.includes(theme.counts.total)) continue;

    const card = page.locator(`#topics .card[href$="?t=${theme.slug}"]`);
    const numbers = await card
      .locator('.cell dd')
      .evaluateAll((els) => els.map((e) => Number(e.textContent?.trim())));
    expect(numbers, `${theme.slug} renders its total`).not.toContain(theme.counts.total);
  }
});

test('the band stays out of the search index', async ({ page }) => {
  // Not a style rule. Indexed, the band puts all eight theme labels on the splash page
  // and Pagefind ranks it above the pages actually about those subjects: searching
  // "bioprocess" stopped returning /research-areas/bioprocess/ at all, failing
  // explorer.spec.ts's prose-indexing test and privacy.spec.ts's search-event test on
  // every run. Those two are the behavioural guard and they do catch it; this assertion
  // exists so the failure names its own cause instead of looking like a search bug.
  await expect(page.locator('#topics')).toHaveAttribute('data-pagefind-ignore', '');
});

test('the band is not offset by Starlight prose-flow margins', async ({ page }) => {
  // Starlight's `.sl-markdown-content` flow rule gives every non-first sibling a
  // `margin-top`, and its `+` selector excludes <a>. The cards are anchors so they
  // escape it the way SectionsGrid does — but the count cells inside each card are
  // <div>s, which is exactly the shape the rule does match. Assert the cause (no
  // computed margin) and the symptom (a row still shares one top edge).
  const cells = page.locator('#topics .card').first().locator('.cell');
  await expect(cells).toHaveCount(TYPES.length);
  for (let i = 0; i < TYPES.length; i++) {
    await expect(cells.nth(i)).toHaveCSS('margin-top', '0px');
  }

  // At 1600px the grid is four columns, so the first four cards share a row.
  const tops = await page
    .locator('#topics .card')
    .evaluateAll((els) => els.slice(0, 4).map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'cards in one row are vertically offset').toBe(1);
});
