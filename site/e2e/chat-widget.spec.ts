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
 * The button is portalled into document.body on hydration and does not exist
 * before that, so waiting for it to appear is sufficient — there is no window in
 * which it is present but inert. This previously needed a click-retry loop,
 * because the button was server-rendered and therefore clickable-looking while
 * still dead; the portal removed that race along with the stacking bug.
 */
async function openPanel(page: Page) {
  const fab = page.locator('.chat-fab');
  await expect(fab).toBeVisible({ timeout: 15_000 });
  await fab.click();
  await expect(page.getByRole('dialog', { name: 'Ask CAAIL' })).toBeVisible();
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
// whole case. `domcontentloaded` keeps navigation off the load event; the button
// arrives on hydration afterwards, which the visibility wait covers.
for (const route of ['./', './software/', './papers/explorer/']) {
  test(`the floating button is present and collapsed on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    const fab = page.locator('.chat-fab');
    await expect(fab).toBeVisible({ timeout: 15_000 });
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

/**
 * The disclosure (CAAIL-167).
 *
 * Split into two assertions on purpose. The first — that the question goes
 * somewhere — is the fact a reader cannot otherwise discover, since the POST is
 * invisible and the endpoint is a host with no relationship to CAAIL's own
 * domain. The second is the clause that actually changes behaviour, and it is
 * the one under standing pressure: it is the longest part of the sentence, it
 * makes the feature sound riskier, and whoever trims it will be optimising a
 * cramped panel rather than weighing the disclosure. Its cost falls on a reader
 * who pastes something unpublished into the box, so it gets its own test rather
 * than riding along inside a single copy assertion.
 */
test('the notice says the question leaves the browser and warns off confidential input', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  const notice = page.locator('.chat-panel-notice');
  await expect(notice).toBeVisible();
  await expect(notice, 'the reader is not told the question is sent anywhere').toContainText(
    /sent to an external service/i,
  );
  await expect(notice, 'the reader is not told the question is retained').toContainText(/stored/i);
  await expect(notice, 'the confidential-information warning has been trimmed').toContainText(
    /don't include\s+confidential information/i,
  );
});

test('the notice links to the privacy statement', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  const link = page.locator('.chat-panel-notice a');
  // Ends-with rather than equals: the site is served under a base path, and
  // hardcoding "/caail/privacy/" would break a fork served from the root.
  await expect(link).toHaveAttribute('href', /\/privacy\/$/);
  // The disclosure is worthless if the page it points at 404s, so follow it.
  await link.click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  // level 1: the page also carries an h2 "Changes to This Privacy Statement",
  // which makes an unqualified name match ambiguous under strict mode.
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Statement' })).toBeVisible();
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

// ---------------------------------------------------------------------------
// Dismissal (#128)
//
// The button rests bottom-right and can land on top of page content at narrow
// widths. The × badge takes it off the page for the rest of the session. It is
// deliberately sticky and has no in-page restore: someone who hid it wanted it
// gone, and a restore affordance would be one more thing occupying that corner.
// ---------------------------------------------------------------------------

test('the dismiss badge removes the widget', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.chat-fab')).toBeVisible({ timeout: 15_000 });
  await page.locator('.chat-dismiss').click();
  await expect(page.locator('.chat-fab')).toHaveCount(0);
  await expect(page.locator('.chat-panel')).toHaveCount(0);
});

test('dismissing from an open panel closes it too', async ({ page }) => {
  await page.goto('./');
  await openPanel(page);
  await page.locator('.chat-panel-input').fill('a question');
  await page.locator('.chat-dismiss').click();
  await expect(page.getByRole('dialog', { name: 'Ask CAAIL' })).toHaveCount(0);
  await expect(page.locator('.chat-fab')).toHaveCount(0);
});

test('dismissal persists across navigation', async ({ page }) => {
  await page.goto('./software/');
  await expect(page.locator('.chat-fab')).toBeVisible({ timeout: 15_000 });
  await page.locator('.chat-dismiss').click();
  await expect(page.locator('.chat-fab')).toHaveCount(0);

  // The whole point: it must not come back on the next page.
  for (const route of ['./', './databases/']) {
    await page.goto(route);
    await expect(page.locator('.chat-fab')).toHaveCount(0);
  }
});

test('dismissal does not outlive the browsing session', async ({ page, context }) => {
  await page.goto('./');
  await expect(page.locator('.chat-fab')).toBeVisible({ timeout: 15_000 });
  await page.locator('.chat-dismiss').click();
  await expect(page.locator('.chat-fab')).toHaveCount(0);

  // sessionStorage is per-tab, so a new tab is a new session and starts fresh.
  // This is what makes the key session- rather than local-storage: hiding the
  // widget is not a permanent preference.
  const fresh = await context.newPage();
  // Relative, so it follows `use.baseURL` like every other goto here. A hardcoded
  // localhost:4321 silently tested whatever else was on that port once the preview
  // port became configurable (CAAIL_E2E_PORT).
  await fresh.goto('./');
  await expect(fresh.locator('.chat-fab')).toBeVisible({ timeout: 15_000 });
  await fresh.close();
});

test('the dismiss badge meets the minimum touch target size', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.chat-dismiss')).toBeVisible({ timeout: 15_000 });
  // WCAG 2.2 AA (2.5.8) asks for 24x24 CSS px. The badge is drawn smaller so it
  // does not swamp the button it sits on, and pads its hit area out via ::before.
  const box = (await page.locator('.chat-dismiss').boundingBox())!;
  const hit = await page.locator('.chat-dismiss').evaluate((el) => {
    const s = getComputedStyle(el, '::before');
    return { w: parseFloat(s.width), h: parseFloat(s.height) };
  });
  expect(box.width).toBeLessThan(24); // drawn small on purpose
  expect(hit.w).toBeGreaterThanOrEqual(24);
  expect(hit.h).toBeGreaterThanOrEqual(24);
});

test('the widget with its dismiss badge is axe-clean', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.chat-dismiss')).toBeVisible({ timeout: 15_000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// Viewports
//
// The widget is position:fixed bottom-right, so it is the class of UI most
// likely to behave differently by screen size — and every other spec runs only
// at Playwright's 1280x720 default. 390x844 is an iPhone 12/13/14-class device;
// 320x568 is the narrowest viewport still worth supporting.
// ---------------------------------------------------------------------------

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow mobile', width: 320, height: 568 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`at ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('the panel opens and fits inside the viewport', async ({ page }) => {
      await page.goto('./');
      await openPanel(page);
      const box = (await page.locator('.chat-panel').boundingBox())!;
      expect(box.x, 'panel is cut off on the left').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'panel overflows the right edge').toBeLessThanOrEqual(vp.width);
      expect(box.y, 'panel is cut off at the top').toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, 'panel overflows the bottom edge').toBeLessThanOrEqual(vp.height);
    });

    test('a long answer scrolls the panel instead of overflowing it', async ({ page }) => {
      await page.goto('./');
      await openPanel(page);
      test.skip(!(await isConfigured(page)), 'no endpoint compiled in — see the header comment');

      await stub(page, 200, {
        answer:
          '## Heading\n\n' +
          Array.from({ length: 12 }, (_, i) => `- item ${i}, long enough to wrap on a narrow screen`).join('\n') +
          '\n\nAnd an unbroken token: ' + 'A'.repeat(60),
      });
      await page.locator('.chat-panel-submit').click();
      await expect(page.locator('.chat-panel-answer')).toBeVisible();

      const m = await page.locator('.chat-panel').evaluate((el) => ({
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
      }));
      // An unbroken token must not force sideways scrolling, and the overflow
      // has to go vertical so the whole answer stays reachable.
      expect(m.scrollW, 'answer forces horizontal scrolling').toBeLessThanOrEqual(m.clientW + 1);
      expect(m.scrollH, 'panel did not become scrollable for a long answer').toBeGreaterThan(m.clientH);

      const box = (await page.locator('.chat-panel').boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    });

    test('the open panel is axe-clean', async ({ page }) => {
      await page.goto('./');
      await openPanel(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });

    // The button rests bottom-right and overlaps page content at narrow widths.
    // That is measured, accepted, and mitigated by the dismiss control rather
    // than by moving the button — every candidate position was swept and none
    // reached zero (best was 51 blocked to 38); only hiding it below 1024px did,
    // at the cost of the feature on touch devices. See #128.
    //
    // So there is no "zero overlap" assertion to make at mobile widths. What is
    // still worth guarding is the *severity* line: on desktop the button may
    // clip a link's edge, but it must never cover a link's centre, because that
    // is what makes one unclickable. That distinction is the whole finding, and
    // an earlier version of this test missed it by checking only three routes —
    // `/databases/`, the one route that collides on desktop, was not among them.
    if (vp.name === 'desktop') {
      test('the button never covers an interactive element’s centre (#128)', async ({ page }) => {
        const blocked: string[] = [];
        for (const route of ['./', './software/', './databases/', './papers/explorer/', './datasets/cow/', './contributing/']) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await expect(page.locator('.chat-fab')).toBeVisible({ timeout: 15_000 });
          const hits = await page.evaluate(() => {
            const fab = document.querySelector('.chat-fab');
            if (!fab) return [];
            const f = fab.getBoundingClientRect();
            const out: string[] = [];
            document
              .querySelectorAll<HTMLElement>('a,button,input,textarea,select,[role="button"]')
              .forEach((el) => {
                if (el.closest('.chat-widget')) return;
                const r = el.getBoundingClientRect();
                if (!r.width || !r.height) return;
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
                const ox = Math.min(f.right, r.right) - Math.max(f.left, r.left);
                const oy = Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top);
                if (ox <= 0 || oy <= 0) return;
                // Clipping is tolerated; covering the centre is not.
                const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                if (!top || el === top || el.contains(top)) return;
                out.push(`${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 30)}" (${Math.round(ox * oy)}px²)`);
              });
            return out;
          });
          blocked.push(...hits.map((h) => `${route} — ${h}`));
        }
        expect(blocked, 'the button made these unclickable on desktop').toEqual([]);
      });
    }
  });
}
