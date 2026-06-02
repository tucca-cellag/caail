import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const seriousOnly = (results: { violations: { impact?: string | null }[] }) =>
  results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));

// ---------------------------------------------------------------------------
// M6 — By the Numbers (server-rendered dashboard)
// ---------------------------------------------------------------------------

test('by-the-numbers renders coverage, species bars, and momentum (no JS needed)', async ({ page }) => {
  await page.goto('./by-the-numbers/');
  await expect(page.getByRole('heading', { name: 'Research coverage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /where help is wanted/i })).toBeVisible();
  // a dense species bar and the recruitment signal both render (scope to the
  // dashboard's bar labels — "Fish" also appears in the sidebar nav)
  await expect(page.locator('.md-label').filter({ hasText: 'Fish' })).toBeVisible();
  await expect(page.locator('.md-row.stub .md-val').first()).toBeVisible();
});

test('by-the-numbers has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./by-the-numbers/');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = seriousOnly(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// M5 — Citation Network (Cytoscape island)
// ---------------------------------------------------------------------------

test('citation network hydrates and renders the graph canvas', async ({ page }) => {
  await page.goto('./papers/network/');
  // client:idle → cytoscape mounts <canvas> layers into .ng-canvas
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });
  expect(await page.locator('.ng-canvas canvas').count()).toBeGreaterThan(0);
  await expect(page.getByText(/shared-author links/)).toBeVisible();
});

test('citation network has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = seriousOnly(results);
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

// ---------------------------------------------------------------------------
// M7 — citation edge mode (toggle on the network island)
// ---------------------------------------------------------------------------

/** Click a deterministic grid over the canvas until a node panel opens. */
async function clickUntilPanel(page: import('@playwright/test').Page): Promise<boolean> {
  const canvas = page.locator('.ng-canvas');
  const box = await canvas.boundingBox();
  if (!box) return false;
  for (let gx = 0.25; gx <= 0.75; gx += 0.08) {
    for (let gy = 0.25; gy <= 0.75; gy += 0.08) {
      await canvas.click({ position: { x: box.width * gx, y: box.height * gy } });
      if (await page.locator('.ng-panel').count()) return true;
    }
  }
  return false;
}

test('edge-mode toggle switches shared-author ↔ citation', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });

  const author = page.getByRole('button', { name: 'Shared author' });
  const citation = page.getByRole('button', { name: 'Citation' });
  // Default is shared-author.
  await expect(author).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/shared-author links/)).toBeVisible();

  await citation.click();
  await expect(citation).toHaveAttribute('aria-pressed', 'true');
  await expect(author).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText(/citation links/)).toBeVisible();
  await expect(page.locator('.ng-canvas')).toHaveAttribute('aria-label', /Citation network/);

  // Toggling back restores shared-author.
  await author.click();
  await expect(page.getByText(/shared-author links/)).toBeVisible();
});

test('citation-mode node panel shows cites / cited-by counts', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });
  await page.getByRole('button', { name: 'Citation' }).click();
  await expect(page.getByText(/citation links/)).toBeVisible();

  expect(await clickUntilPanel(page)).toBe(true);
  await expect(page.locator('.ng-panel .ng-degree')).toContainText(/cites \d+ · cited by \d+/);
});
