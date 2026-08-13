import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Privacy page — reachable from every page, states the live collection
// ---------------------------------------------------------------------------

test('privacy page states what is measured and who to contact', async ({ page }) => {
  await page.goto('./privacy/');

  await expect(page.getByRole('heading', { name: 'Personal Data We Collect' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Our Use of Cookies and Tracking Technologies' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Links to Third-Party Sites' })).toBeVisible();

  // Every named recipient of Personal Data appears in the sharing table. A vendor
  // added to the stack without a row here is an undisclosed processor, which is
  // the one defect on this page that is a compliance problem rather than a typo.
  for (const recipient of ['GitHub, Inc.', 'Cloudflare, Inc.', 'Sevalla', 'Google LLC']) {
    await expect(page.getByRole('cell', { name: recipient, exact: true })).toBeVisible();
  }

  // The Tufts institutional statement and privacy mailbox are the escalation
  // path; a broken link here is the one that actually matters.
  await expect(
    page.locator('main a[href="https://www.tufts.edu/about/privacy"]').first(),
  ).toBeVisible();
  await expect(page.locator('main a[href="mailto:dataprivacy@tufts.edu"]')).toBeVisible();

  // Every browser-storage key is named, so the table can't silently drift from
  // NavCollapse.astro / DataTableViews.astro / CaailChatWidget.tsx. This table
  // is the reader-facing inventory and nothing else keeps it honest.
  for (const key of [
    'caail-nav-collapsed',
    'caail-toc-collapsed',
    'caail-tableview',
    'caail-chat-dismissed',
  ]) {
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
  // Stub github.com so the popup resolves without leaving the runner. What this
  // test proves is that the click was not preventDefault'd, which is settled by
  // the popup opening AT the right URL — reaching GitHub proves nothing extra.
  //
  // It used to navigate for real, which made a live request on every CI run and
  // failed whenever that request did: `popup.url()` reports the URL after
  // navigation SETTLES, so a blocked or throttled fetch left the assertion
  // comparing the href against `chrome-error://chromewebdata/`. Observed red on
  // a runner 2026-08-12 with the other 169 specs passing. Unlike the timing
  // races in this suite it would not pass on a re-run under lighter load, since
  // the cause is egress rather than contention.
  await context.route('https://github.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' }),
  );

  await page.goto('./software/');
  await captureEvents(page);

  const link = page.locator('main a.cb-name-link[href^="https://github.com/"]').first();
  const href = await link.getAttribute('href');

  // Catalog links carry target="_blank", so the click opens a new tab and this
  // page survives. Asserting the popup opens proves we never preventDefault'd.
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await popup.waitForURL(href!);
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

// ---------------------------------------------------------------------------
// The Cloudflare beacon fires on the deployed origin and nowhere else
// ---------------------------------------------------------------------------

const BEACON_HOST = 'https://static.cloudflareinsights.com';
const DEPLOYED = 'https://tucca-cellag.github.io/caail/';

/** Record every request the page makes to the beacon host. */
function watchBeacon(page: import('@playwright/test').Page) {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(BEACON_HOST)) hits.push(r.url());
  });
  return hits;
}

test('the beacon never loads off the deployed origin', async ({ page, context }) => {
  // This suite runs against `pnpm preview` on localhost — the same production
  // build the deploy serves. That is exactly the case a build-time guard cannot
  // catch, and with ~170 specs each loading pages it was also the largest source
  // of self-recorded page views.
  const hits = watchBeacon(page);

  // Abort rather than allow: should the guard ever regress, the assertion below
  // still catches it (the request event fires before the abort), but the hit
  // never leaves the runner. A test whose subject is "do not pollute the
  // analytics" should not itself be the thing that pollutes them on the run
  // that discovers the bug.
  await context.route(`${BEACON_HOST}/**`, (route) => route.abort());

  await page.goto('./');
  await page.waitForTimeout(500);

  expect(hits).toEqual([]);
  await expect(page.locator(`head script[src^="${BEACON_HOST}"]`)).toHaveCount(0);

  // ...and it stayed away because the guard held, not because someone deleted
  // analytics outright. Without this half, removing the beacon entirely would
  // make the assertion above pass.
  const guards = await page
    .locator('head script:not([src])')
    .evaluateAll((els) => els.filter((el) => el.textContent?.includes('cloudflareinsights')).length);
  expect(guards).toBe(1);
});

test('the beacon does load on the deployed origin', async ({ page, context }) => {
  // The guard keys on `location.hostname`, which only the URL can set, so serve
  // the locally built page under the deployed hostname. Nothing leaves the
  // runner: the document is the local preview's own HTML and the beacon script
  // is stubbed.
  //
  // The negative test above passes just as well if the hostname is mistyped, and
  // that failure is the costly one — analytics silently dead in production, with
  // the site unable to be tested at its real hostname before it deploys.
  // The marker is what keeps this test honest. Without it, an interception that
  // does not take hold loads the REAL deployed site instead, and since that site
  // is what we are changing, it answers with the old unconditional beacon and
  // the test passes green having measured production rather than this build.
  // That is not hypothetical: it happened while writing this test.
  const MARKER = 'caail-e2e-local-build';
  const html = (await (await page.request.get('./')).text()).replace(
    '</head>',
    `<meta name="${MARKER}" content="1"></head>`,
  );

  // Registered first so the specific routes below take precedence: nothing in
  // this test may leave the runner. If precedence ever changed, the document
  // would be aborted and `goto` would throw — loud, not silently green.
  await context.route('**/*', (route) =>
    route.request().url().startsWith('http://localhost') ? route.continue() : route.abort(),
  );
  await context.route('https://tucca-cellag.github.io/**', (route) =>
    route.request().url() === DEPLOYED
      ? route.fulfill({ status: 200, contentType: 'text/html', body: html })
      : // Subresources resolve against the faked host too; empty is fine, the
        // assertion is about the inline guard, not about rendering the page.
        route.fulfill({ status: 200, body: '' }),
  );
  await context.route(`${BEACON_HOST}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );

  const hits = watchBeacon(page);
  await page.goto(DEPLOYED);

  await expect(page.locator(`head meta[name="${MARKER}"]`)).toHaveCount(1);
  await expect.poll(() => hits.length).toBe(1);

  // The request reaching Cloudflare is not the whole guarantee: a beacon that
  // loads without its token reports to no site at all, and every assertion above
  // still passes. Drop the setAttribute line and this is the only thing that
  // notices — which is the same "silently dead in production" failure the test
  // exists for, one layer in.
  await expect(page.locator(`head script[src^="${BEACON_HOST}"]`)).toHaveAttribute(
    'data-cf-beacon',
    /"token":\s*"[0-9a-f]{32}"/,
  );
});

test('same-origin links emit nothing', async ({ page }) => {
  await page.goto('./privacy/');
  await captureEvents(page);

  // An in-page TOC anchor: same origin, and it does not navigate away, so the
  // capture buffer survives to be read. Starlight renders the TOC twice (mobile
  // widget + right rail); :visible picks whichever one this viewport shows.
  await page.locator('a[href="#personal-data-we-collect"]:visible').first().click();
  await expect(page).toHaveURL(/#personal-data-we-collect$/);
  expect(await readEvents(page)).toEqual([]);
});
