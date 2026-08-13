import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { awaitHydrated } from './hydration';

/**
 * The entry-anchored correction route (/report/ plus the per-card links that feed it).
 *
 * Two things are worth testing here that unit tests cannot reach. The first is that the
 * frozen item id survives the whole trip — card → page → prefilled GitHub form — since
 * every hop is a different rendering path (Preact island, raw-HTML remark twin, a
 * client-side script) and the id is the only reason the feature exists. The second is
 * that a hostile `?item=` is inert on a real page: the page reads a query string on a
 * static host, so this is the one place a stranger controls input.
 */

const GITHUB_LINK = '#caail-report-github';
const EMAIL_LINK = '#caail-report-email';

test('with no ?item= the page is still usable and says no entry is identified', async ({ page }) => {
  await page.goto('./report/');
  await expect(page.locator('#caail-report-none')).toBeVisible();
  await expect(page.locator('#caail-report-id')).toBeHidden();
  // Unanchored, but not broken: the bare template still opens.
  const href = await page.locator(GITHUB_LINK).getAttribute('href');
  expect(href).toContain('template=entry-correction.yml');
  expect(href).not.toContain('item=');
});

test('a valid ?item= is shown and threaded into the GitHub and email routes', async ({ page }) => {
  await page.goto('./report/?item=paper:214');
  await expect(page.locator('#caail-report-id')).toBeVisible();
  await expect(page.locator('#caail-report-id-value')).toHaveText('paper:214');
  await expect(page.locator('#caail-report-none')).toBeHidden();

  const gh = new URL((await page.locator(GITHUB_LINK).getAttribute('href'))!);
  expect(gh.host).toBe('github.com');
  expect(gh.pathname).toBe('/tucca-cellag/caail/issues/new');
  expect(gh.searchParams.get('template')).toBe('entry-correction.yml');
  expect(gh.searchParams.get('item')).toBe('paper:214');
  expect(gh.searchParams.get('title')).toBe('Correction: paper:214');

  const mail = await page.locator(EMAIL_LINK).getAttribute('href');
  expect(mail).toContain('mailto:');
  expect(decodeURIComponent(mail!)).toContain('CAAIL correction: paper:214');
});

test('a hostile ?item= reaches neither the DOM nor a link', async ({ page }) => {
  // Percent-encoded so the whole payload survives as one query value.
  const hostile = '%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E';
  await page.goto(`./report/?item=${hostile}`);
  // Rejected outright: the banner never appears, so nothing is rendered from it.
  await expect(page.locator('#caail-report-id')).toBeHidden();
  await expect(page.locator('#caail-report-none')).toBeVisible();
  await expect(page.locator('.rp img')).toHaveCount(0);
  const href = await page.locator(GITHUB_LINK).getAttribute('href');
  expect(href).not.toContain('item=');
  expect(href).not.toContain('onerror');
});

test('a well-formed id for an entry that does not exist is still passed through', async ({ page }) => {
  // The page cannot know the catalogue, and refusing a syntactically valid id would drop
  // a real report over a typo. Curator triage is the right place to catch this.
  await page.goto('./report/?item=sw:not-a-real-entry');
  await expect(page.locator('#caail-report-id-value')).toHaveText('sw:not-a-real-entry');
});

test('the report page has no axe violations, with and without an entry', async ({ page }) => {
  for (const url of ['./report/', './report/?item=db:string']) {
    await page.goto(url);
    await expect(page.locator('.rp-routes')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  }
});

test('a software card links to the report page carrying its frozen sw: id', async ({ page }) => {
  await page.goto('./software/');
  await awaitHydrated(page, 'CatalogBrowser');
  const link = page.locator('.cb-card .report-link').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=sw%3A[a-z0-9-]+$/);
  // The accessible name names the entry, so a screen-reader user hearing the tenth
  // "Report an issue" on the page can still tell which entry it belongs to.
  const label = await link.getAttribute('aria-label');
  expect(label).toMatch(/^Report an issue with .+/);
});

test('a database card links with a db: id, not the software namespace', async ({ page }) => {
  await page.goto('./databases/');
  await awaitHydrated(page, 'CatalogBrowser');
  const href = await page.locator('.cb-card .report-link').first().getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=db%3A[a-z0-9-]+$/);
});

test('a reviews card links with its paper: id', async ({ page }) => {
  await page.goto('./papers/reviews/');
  await awaitHydrated(page, 'ReferenceShelf');
  const href = await page.locator('.px-ref .report-link').first().getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=paper%3A\d+$/);
});

test('an Explorer reference links with its paper: id, from the cell panel', async ({ page }) => {
  // The Explorer renders references only into the side panel, so unlike every other card
  // surface here this link is absent from the served HTML and exists purely at runtime.
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  await page.getByRole('button', { name: /Deep Learning × Cellular Engineering: \d+ papers/ }).click();
  const href = await page.locator('.px-panel .px-ref .report-link').first().getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=paper%3A\d+$/);
});

test('a curated dataset card links with its ds: id', async ({ page }) => {
  await page.goto('./datasets/chicken/');
  const link = page.locator('.ds-card .report-link').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/\/report\/\?item=ds%3A[a-z0-9-]+$/);
});

test('following a card link lands on the report page with that entry resolved', async ({ page }) => {
  await page.goto('./software/');
  await awaitHydrated(page, 'CatalogBrowser');
  const link = page.locator('.cb-card .report-link').first();
  const expected = decodeURIComponent(new URL(await link.getAttribute('href')!, page.url()).search)
    .replace('?item=', '');
  await link.click();
  await expect(page).toHaveURL(/\/report\/\?item=/);
  await expect(page.locator('#caail-report-id-value')).toHaveText(expected);
});

test('the report link does not stretch the badges it sits beside', async ({ page }) => {
  // The link carries a 24px minimum for its tap target, and `.px-badges` used to default
  // to align-items: stretch, so adding it made every DOI/Code/citation pill on the row
  // 24px tall with its text top-aligned. Asserted on the pills, not on the link.
  await page.goto('./papers/reviews/');
  await awaitHydrated(page, 'ReferenceShelf');
  const pill = page.locator('.px-ref .px-bdg.doi').first();
  await expect(pill).toBeVisible();
  const height = await pill.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(24);
});

test('the report link trails its meta row whether or not a citation badge precedes it', async ({ page }) => {
  // `space-between` separates two or more children and does nothing for one, so on the
  // cards with no citation badge the link would sit flush left and its position would
  // alternate down the grid. Both cases are checked because only one of them regressed.
  await page.goto('./software/');
  await awaitHydrated(page, 'CatalogBrowser');
  const offsets = await page.locator('.cb-card .cb-meta').evaluateAll((rows) =>
    rows.map((row) => {
      const link = row.querySelector('.report-link');
      if (!link) return null;
      return {
        withBadge: row.querySelector('.cite-badge') !== null,
        gap: row.getBoundingClientRect().right - link.getBoundingClientRect().right,
      };
    }).filter((o): o is { withBadge: boolean; gap: number } => o !== null),
  );
  expect(offsets.some((o) => o.withBadge)).toBe(true);
  expect(offsets.some((o) => !o.withBadge)).toBe(true);
  // Every link ends flush with the row's right edge, in both populations.
  for (const o of offsets) expect(Math.abs(o.gap)).toBeLessThan(1);
});

test("the homepage topics band's correction CTA points at the report page", async ({ page }) => {
  await page.goto('./');
  // Previously a Slack invite, which is not a report path: a reader who noticed a theme
  // looked wrong had nowhere entry-anchored to say so.
  const cta = page.locator('#topics a', { hasText: 'telling us' });
  await expect(cta).toHaveAttribute('href', /\/report\/$/);
});
