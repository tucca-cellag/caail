import { test, expect, type Page } from '@playwright/test';
import { BUILD_MISMATCH, CHAT_BUILT, CHAT_ISLAND } from './chat-build';
import { neverIdle } from './hydration';
import { IDLE_TIMEOUT_MS } from '../src/lib/idle-timeout';

/**
 * Ask CAAIL, built without a chat endpoint: the box is not offered
 * (tucca-cellag/caail-planning#763).
 *
 * Without PUBLIC_CAAIL_CHAT_API the footer mounts no widget (src/lib/chat-config.ts), so no
 * page carries its markup or loads its script, and the privacy statement says the feature is
 * not offered and that nothing is sent for it. These run when the e2e run's environment names
 * no endpoint (e2e/chat-build.ts); chat-widget.spec.ts and chat-widget-stacking.spec.ts cover
 * the other state.
 */

test.skip(CHAT_BUILT, 'built with a chat endpoint; chat-widget.spec.ts runs instead');

/** No widget, no island and no widget script on `route`. */
async function expectNoWidget(page: Page, route: string): Promise<void> {
  // Every request the page makes, so the privacy notice's "sends nothing" has a check behind
  // it: with no island, the widget's script is never fetched and no question can be sent.
  const widgetRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('CaailChatWidget')) widgetRequests.push(r.url());
  });
  await page.goto(route, { waitUntil: 'load' });
  // A `client:idle` island starts fetching its script in an idle callback it queues before
  // `load`, with the footer's timeout. One more queued now, with the same timeout, runs after it:
  // earlier when the page goes idle, and on a later deadline when it never does, so a page that
  // never goes idle cannot hang this wait. By then such a fetch has been asked for, though its
  // request event may still be in flight; the island count below is what proves there is none.
  await page.evaluate(
    (timeout) => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout })),
    IDLE_TIMEOUT_MS,
  );
  // The island is the load-bearing check (see CHAT_ISLAND); the button and wrapper checks
  // only confirm nothing else drew one.
  await expect(page.locator(CHAT_ISLAND), BUILD_MISMATCH).toHaveCount(0);
  await expect(page.locator('.chat-fab')).toHaveCount(0);
  await expect(page.locator('.chat-widget')).toHaveCount(0);
  expect(widgetRequests, 'the widget script was requested').toEqual([]);
}

for (const route of ['./', './software/', './papers/explorer/', './privacy/']) {
  test(`no widget, no widget island and no widget script on ${route}`, async ({ page }) => {
    await expectNoWidget(page, route);
  });
}

// A busy runner can keep a page from ever going idle, and the idle wait above then never
// returned: the privacy case timed out at 30 s in CI (tucca-cellag/caail-planning#604).
test('the no-widget checks finish on a page that never goes idle', async ({ page }) => {
  const stop = await neverIdle(page);
  await expectNoWidget(page, './privacy/');
  await stop();
});

test('the privacy statement says the feature is not offered at present', async ({ page }) => {
  await page.goto('./privacy/');
  await expect(page.locator('#ask-caail-not-offered')).toContainText(/not offered at present/i);
});
