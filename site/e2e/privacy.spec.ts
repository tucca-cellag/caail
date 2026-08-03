import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Privacy page — reachable from every page, states the live collection
// ---------------------------------------------------------------------------

test('privacy page states what is measured and who to contact', async ({ page }) => {
  await page.goto('./privacy/');

  await expect(page.getByRole('heading', { name: 'What we measure' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Why there is no cookie banner' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Links to other sites' })).toBeVisible();

  // The Tufts institutional statement and privacy mailbox are the escalation
  // path; a broken link here is the one that actually matters.
  await expect(
    page.locator('main a[href="https://www.tufts.edu/about/privacy"]').first(),
  ).toBeVisible();
  await expect(page.locator('main a[href="mailto:dataprivacy@tufts.edu"]')).toBeVisible();

  // The three localStorage keys are named, so the table can't silently drift
  // from NavCollapse.astro / DataTableViews.astro.
  for (const key of ['caail-nav-collapsed', 'caail-toc-collapsed', 'caail-tableview']) {
    await expect(page.getByRole('cell', { name: key })).toBeVisible();
  }
});

test('every page reaches the privacy policy from the footer', async ({ page }) => {
  await page.goto('./');
  const link = page.locator('.caail-footer a[href="/caail/privacy/"]');
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/caail\/privacy\/$/);
});

test('privacy page has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./privacy/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Analytics wiring — must observe without ever interfering
// ---------------------------------------------------------------------------

/** Install a stand-in for GA4's gtag, absent until CAAIL joins Tufts' container. */
async function captureEvents(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    (window as unknown as { __ev: unknown[] }).__ev = [];
    (window as unknown as { gtag: unknown }).gtag = (...args: unknown[]) =>
      (window as unknown as { __ev: unknown[] }).__ev.push(args);
  });
}

const readEvents = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __ev: unknown[] }).__ev);

test('an outbound click emits one event and still opens the link', async ({ page, context }) => {
  await page.goto('./software/');
  await captureEvents(page);

  const link = page.locator('main a.cb-name-link[href^="https://github.com/"]').first();
  const href = await link.getAttribute('href');

  // Catalog links carry target="_blank", so the click opens a new tab and this
  // page survives. Asserting the popup opens proves we never preventDefault'd.
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
  expect(popup.url()).toBe(href);
  await popup.close();

  expect(await readEvents(page)).toEqual([
    ['event', 'outbound_click', { link_url: href, link_domain: 'github.com', resource_kind: 'repo' }],
  ]);
});

/** Open Starlight's search dialog, mirroring explorer.spec.ts's approach. */
async function openSearch(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: /^search/i });
  if (await button.count()) await button.first().click();
  else await page.keyboard.press('/');
  return page.getByPlaceholder(/search/i);
}

test('a search records its term and result count, once per term', async ({ page }) => {
  await page.goto('./');
  await captureEvents(page);

  const input = await openSearch(page);
  await input.fill('bioprocess');
  await expect(page.locator('dialog a[href*="/research-areas/bioprocess"]').first()).toBeVisible({
    timeout: 10000,
  });

  // The observer waits 1200ms of quiet before judging a result set final.
  await expect.poll(() => readEvents(page), { timeout: 10000 }).toHaveLength(1);
  const [[command, name, props]] = (await readEvents(page)) as [[string, string, Record<string, unknown>]];
  expect([command, name]).toEqual(['event', 'search']);
  expect(props.search_term).toBe('bioprocess');

  // The recorded count must be the true total from Pagefind's summary line, not
  // the rendered node count — the default UI paginates at 5, so "bioprocess"
  // renders 5 while genuinely matching ~36. Asserting only `> 0` let that
  // through once already.
  const summary = await page.locator('.pagefind-ui__message').textContent();
  const trueTotal = Number.parseInt(summary?.match(/\d+/)?.[0] ?? '0', 10);
  expect(trueTotal).toBeGreaterThan(5);
  expect(props.result_count).toBe(trueTotal);

  // Re-settling on the same term must not double-count.
  await page.waitForTimeout(1600);
  expect(await readEvents(page)).toHaveLength(1);
});

test('a search query holding an email address is never recorded', async ({ page }) => {
  await page.goto('./');
  await captureEvents(page);

  const input = await openSearch(page);
  await input.fill('someone@example.com');
  await page.waitForTimeout(2000);
  expect(await readEvents(page)).toEqual([]);
});

test('same-origin links emit nothing', async ({ page }) => {
  await page.goto('./privacy/');
  await captureEvents(page);

  // An in-page TOC anchor: same origin, and it does not navigate away, so the
  // capture buffer survives to be read. Starlight renders the TOC twice (mobile
  // widget + right rail); :visible picks whichever one this viewport shows.
  await page.locator('a[href="#what-we-measure"]:visible').first().click();
  await expect(page).toHaveURL(/#what-we-measure$/);
  expect(await readEvents(page)).toEqual([]);
});
