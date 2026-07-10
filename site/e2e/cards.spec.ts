import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// DataTableViews cards grid (.caail-cards) — layout regression guard.
//
// Starlight's prose flow rule (`@layer starlight.content`, markdown.css) gives
// every non-first sibling inside `.sl-markdown-content` a `margin-top` of
// `var(--sl-content-gap-y)`. The cards are built inside prose, so `.caail-card
// + .caail-card` matches it and every card after the first sinks inside its
// grid row track. Assert both the cause (the computed margin) and the symptom
// (cards in a row no longer share a top edge).
// ---------------------------------------------------------------------------

test.use({ viewport: { width: 1600, height: 900 } });

test('cards in the grid are not offset by Starlight prose flow margins', async ({ page }) => {
  await page.goto('./datasets/chicken/');

  const view = page.locator('.caail-tableview[data-ready]').first();
  await view.waitFor();
  await view.getByRole('button', { name: 'Cards' }).click();

  const cards = view.locator('.caail-card');
  expect(await cards.count()).toBeGreaterThan(2);

  // Cause: Starlight's flow margin must not reach the cards or their fields.
  await expect(cards.nth(0)).toBeVisible();
  await expect(cards.nth(1)).toHaveCSS('margin-top', '0px');
  await expect(cards.nth(1).locator('.caail-card-field').nth(1)).toHaveCSS('margin-top', '0px');

  // Symptom: at this width the grid is multi-column, so the first two cards
  // share a row and must share a top edge.
  const first = await cards.nth(0).boundingBox();
  const second = await cards.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(second!.x).toBeGreaterThan(first!.x); // same row, next column
  expect(Math.abs(second!.y - first!.y)).toBeLessThan(1);
});
