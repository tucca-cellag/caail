import { test, expect } from '@playwright/test';

/**
 * The chat button is position:fixed inside Starlight's `.main-pane`, which sets
 * `isolation: isolate` and so creates a stacking context. Rendered in place, the
 * widget's z-index was scoped to that context while `.right-sidebar` — fixed,
 * viewport-height, in a later sibling branch — painted above it and swallowed
 * the clicks. The button stayed *visible*, so a presence assertion passed while
 * the widget was unusable on every page with an "On this page" sidebar.
 *
 * These assert reachability, not presence. For fixed-position UI that is the
 * property that matters, and it is the one that was silently false.
 */

// Routes chosen for their sidebar: the first two have none (splash, and the
// explorer sets tableOfContents:false) and always worked; the rest all render a
// right sidebar and were all broken.
const ROUTES = [
  './',
  './papers/explorer/',
  './software/',
  './databases/',
  './datasets/cow/',
  './research-areas/bioprocess/',
  './contributing/',
];

for (const route of ROUTES) {
  test(`the chat button is reachable, not just visible, on ${route}`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });

    const fab = page.locator('.chat-fab');
    await expect(fab).toBeVisible({ timeout: 15_000 });

    // Hit test: whatever is painted at the button's centre must be the button.
    const blocker = await fab.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) as HTMLElement | null;
      if (!top) return 'nothing painted at the centre';
      if (top.closest('.chat-widget')) return null;
      return `${top.tagName.toLowerCase()}.${(top.className || '').toString().split(' ')[0]}`;
    });
    expect(blocker, `something is painted over the chat button on ${route}`).toBeNull();

    // And the real thing: clicking it opens the panel.
    await fab.click();
    await expect(page.getByRole('dialog', { name: 'Ask CAAIL' })).toBeVisible();
  });
}

test('the widget is portalled out of the isolated stacking context', async ({ page }) => {
  await page.goto('./software/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.chat-fab')).toBeVisible({ timeout: 15_000 });

  const placement = await page.locator('.chat-widget').evaluate((el) => ({
    parentIsBody: el.parentElement === document.body,
    insideMainPane: !!el.closest('.main-pane'),
  }));
  // Being a direct child of body is what keeps it out of `.main-pane`'s
  // `isolation: isolate`; if a future change re-parents it, this fails before
  // anyone notices the button has gone dead again.
  expect(placement.insideMainPane, 'widget is back inside the isolated main-pane').toBe(false);
  expect(placement.parentIsBody).toBe(true);
});
