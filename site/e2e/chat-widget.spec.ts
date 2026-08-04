import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Ask CAAIL widget.
 *
 * The widget ships on every page (mounted from Footer.astro) but had no test of
 * any kind: no spec referenced it, and `PUBLIC_CAAIL_CHAT_API` is **build-time
 * inlined**, so a build without it leaves `canSubmit` permanently false and the
 * submit path unreachable. The eleven axe-asserting specs therefore only ever
 * saw the *closed* floating button.
 *
 * These cover both builds honestly. The open/close/reset/a11y tests run always.
 * The submit tests need a configured endpoint, so they assert graceful
 * degradation when there isn't one instead of silently skipping — an
 * unconfigured build is a state worth testing, not a hole to paper over.
 *
 * To exercise the submit path locally:
 *   PUBLIC_CAAIL_CHAT_API=https://chat.invalid/caail/ask pnpm --dir site build
 *   pnpm --dir site test:e2e chat-widget
 * CI does exactly this (see .github/workflows/test.yml). No live service is ever
 * contacted: every request is stubbed with page.route(), and the `.invalid` TLD
 * is reserved by RFC 2606 so a missed stub fails loudly instead of escaping.
 */

const ENDPOINT = '**/caail/ask*';

/**
 * Open the panel from the floating button.
 *
 * The widget is mounted `client:idle`, so it hydrates during browser idle time
 * and the button is inert until then — a click that lands first is silently a
 * no-op. The retry absorbs that race instead of racing it with a fixed wait.
 * Re-clicking is safe: the assertion only fails when the panel did not open, so
 * a click never lands on an already-open panel and toggles it shut.
 */
async function openPanel(page: Page) {
  await expect(async () => {
    await page.locator('.chat-fab').click();
    await expect(page.getByRole('dialog', { name: 'Ask CAAIL' })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
}

/** Whether this build has an endpoint compiled in (canSubmit ends in `&& !!CHAT_API`). */
async function isConfigured(page: Page): Promise<boolean> {
  await page.locator('.chat-panel-input').fill('a question');
  return page.locator('.chat-panel-submit').isEnabled();
}

/** Stub the backend with a fixed status + payload. */
async function stub(page: Page, status: number, body: unknown) {
  await page.route(ENDPOINT, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

// ---------------------------------------------------------------------------
// Always available — no endpoint required
// ---------------------------------------------------------------------------

// One test per route rather than a loop inside one test: the button is on every
// page, but sharing a single 30s budget across three navigations meant a slow
// cold start on the heaviest route (the explorer mounts cytoscape) failed the
// whole case. `domcontentloaded` because the button is server-rendered, so the
// load event adds latency without adding coverage.
for (const route of ['./', './software/', './papers/explorer/']) {
  test(`the floating button is present and collapsed on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const fab = page.locator('.chat-fab');
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute('aria-expanded', 'false');
    await expect(fab).toHaveAccessibleName('Ask CAAIL a question');
    await expect(page.getByRole('dialog', { name: 'Ask CAAIL' })).toHaveCount(0);
  });
}

test('opening reveals the panel and flips aria-expanded', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  // Once open, "Close chat" names BOTH the panel's × and the floating button,
  // so target the fab by class rather than by accessible name.
  await expect(page.locator('.chat-fab')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.chat-panel-input')).toBeVisible();
});

test('aria-controls resolves to the real panel once open', async ({ page }) => {
  await page.goto('./');
  const target = await page.locator('.chat-fab').getAttribute('aria-controls');
  expect(target).toBeTruthy();
  await openPanel(page);
  // Attribute selector, not `#id` — Preact's useId() emits values like "P1-0",
  // and CSS.escape is a browser global unavailable in the Node test runner.
  await expect(page.locator(`[id="${target}"]`)).toBeVisible();
});

test('the blurb says answers come from AI', async ({ page }) => {
  // #126 revised this copy deliberately; pin it so it cannot be dropped silently.
  await page.goto('./');
  await openPanel(page);
  await expect(page.locator('.chat-panel-blurb')).toContainText(/\bAI\b/);
});

test('closing clears the typed question, via either control', async ({ page }) => {
  // The behaviour added by "Clear the state when the widget closes" (#119):
  // before it, reopening restored the previous question and answer. Both the
  // panel's × and the floating button route through closeAndReset, so both are
  // exercised here.
  await page.goto('./');
  for (const closer of ['.chat-panel-close', '.chat-fab'] as const) {
    await openPanel(page);
    await page.locator('.chat-panel-input').fill('a question that should not survive');
    await page.locator(closer).click();
    await expect(page.getByRole('dialog', { name: 'Ask CAAIL' })).toHaveCount(0);
    await openPanel(page);
    await expect(page.locator('.chat-panel-input')).toHaveValue('');
    await page.locator('.chat-fab').click();
  }
});

test('an over-length question cannot be submitted', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  await page.locator('.chat-panel-input').fill('word '.repeat(201));
  await expect(page.locator('.chat-panel-submit')).toBeDisabled();
});

test('an empty question cannot be submitted', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  await expect(page.locator('.chat-panel-submit')).toBeDisabled();
});

test('the open panel has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Submit path — needs an endpoint compiled in
// ---------------------------------------------------------------------------

test('an unconfigured build degrades gracefully instead of erroring', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(await isConfigured(page), 'endpoint is configured — submit path covered below');
  // No endpoint: the button stays disabled with valid input, and nothing throws.
  await expect(page.locator('.chat-panel-submit')).toBeDisabled();
  await expect(page.locator('.chat-panel-status--error')).toHaveCount(0);
});

test('a successful answer renders as formatted HTML', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  await stub(page, 200, { answer: '**Bold** and a [link](https://doi.org/10.1038/x).' });
  await page.locator('.chat-panel-submit').click();

  const answer = page.locator('.chat-panel-answer');
  await expect(answer).toBeVisible();
  await expect(answer.locator('strong')).toHaveText('Bold');
  await expect(answer.locator('a')).toHaveAttribute('href', 'https://doi.org/10.1038/x');
});

test('the request carries the typed question as JSON', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  let body: unknown = null;
  await page.route(ENDPOINT, (route) => {
    body = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"answer":"ok"}' });
  });
  await page.locator('.chat-panel-input').fill('how is media optimised');
  await page.locator('.chat-panel-submit').click();
  await expect(page.locator('.chat-panel-answer')).toBeVisible();
  expect(body).toEqual({ query: 'how is media optimised' });
});

test('a hostile answer cannot inject an executable link (#125 end-to-end)', async ({ page }) => {
  // markdown.test.ts pins renderMarkdown directly; this proves the sanitizer is
  // actually wired into the render path the user sees.
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  await stub(page, 200, {
    answer: '[click me](javascript:alert(1)) and <img src=x onerror=alert(1)>',
  });
  await page.locator('.chat-panel-submit').click();

  const answer = page.locator('.chat-panel-answer');
  await expect(answer).toBeVisible();
  await expect(answer).toContainText('click me');
  expect(await answer.locator('a[href^="javascript:"]').count()).toBe(0);
  expect(await answer.locator('img').count()).toBe(0);
  expect(await answer.innerHTML()).not.toContain('onerror');
});

test('a quota response shows the quota message, not the generic one', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  await stub(page, 429, { error: 'quota_exceeded' });
  await page.locator('.chat-panel-submit').click();
  await expect(page.locator('.chat-panel-status--error')).toContainText(/quota is exceeded/i);
});

test('a server error shows the generic message', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  await stub(page, 500, { error: 'boom' });
  await page.locator('.chat-panel-submit').click();
  await expect(page.locator('.chat-panel-status--error')).toContainText(/something went wrong/i);
});

test('a network failure is caught rather than surfacing as an unhandled rejection', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  await page.route(ENDPOINT, (route) => route.abort('failed'));
  await page.locator('.chat-panel-submit').click();
  await expect(page.locator('.chat-panel-status--error')).toContainText(/something went wrong/i);
});

test('the open panel with an answer rendered has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

  await stub(page, 200, { answer: '## Heading\n\n- one\n- two\n\n[link](https://example.org)' });
  await page.locator('.chat-panel-submit').click();
  await expect(page.locator('.chat-panel-answer')).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});
