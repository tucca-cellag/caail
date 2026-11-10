import { test, expect } from '@playwright/test';
import { CHAT_BUILT, CHAT_ISLAND } from './chat-build';

/**
 * Ask CAAIL, built without a chat endpoint: the box is not offered
 * (tucca-cellag/caail-planning#763).
 *
 * Without PUBLIC_CAAIL_CHAT_API the footer mounts no widget (src/lib/chat-config.ts), so no
 * page carries its markup or loads its script, and the privacy statement says the feature is
 * not offered. These run when e2e/chat-build.ts reads no endpoint from where the build read
 * it; chat-widget.spec.ts and chat-widget-stacking.spec.ts cover the other state.
 */

test.skip(CHAT_BUILT, 'built with a chat endpoint; chat-widget.spec.ts runs instead');

for (const route of ['./', './software/', './papers/explorer/', './privacy/']) {
  test(`no widget and no widget island on ${route}`, async ({ page }) => {
    await page.goto(route);
    // The island is the load-bearing check (see CHAT_ISLAND); the button and wrapper checks
    // below only confirm nothing else drew one.
    await expect(page.locator(CHAT_ISLAND)).toHaveCount(0);
    await expect(page.locator('.chat-fab')).toHaveCount(0);
    await expect(page.locator('.chat-widget')).toHaveCount(0);
  });
}

test('the privacy statement says the feature is not offered at present', async ({ page }) => {
  await page.goto('./privacy/');
  await expect(page.locator('#ask-caail-not-offered')).toContainText(/not offered at present/i);
});
