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

/**
 * The `cose` layout animates nodes into place (`animate: 'end'`), so a position
 * read mid-animation is stale by the time the click lands. It also holds nodes
 * still while it computes, so a single pair of matching frames is not enough —
 * require no running element animation plus sustained stillness.
 */
async function waitForGraphSettled(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    delete (window as any).__ngSnap;
    delete (window as any).__ngStable;
  });
  await page.waitForFunction(
    () => {
      const w = window as any;
      const cy = (document.querySelector('.ng-canvas') as any).__cy;
      if (!cy || cy.nodes().length === 0) return false;
      if (cy.elements().animated()) {
        w.__ngStable = 0;
        return false;
      }
      const snapshot = JSON.stringify(cy.nodes().map((n: any) => n.renderedPosition()));
      w.__ngStable = w.__ngSnap === snapshot ? (w.__ngStable ?? 0) + 1 : 0;
      w.__ngSnap = snapshot;
      return w.__ngStable >= 3; // ~300ms of stillness at the polling interval
    },
    null,
    { timeout: 20000, polling: 100 },
  );
}

/**
 * Pick the connected, on-screen node that sits furthest from any neighbour, and
 * return its label plus its position rendered relative to the canvas — i.e.
 * exactly where a user sees it and would click. Nodes overlap after `cose`, and
 * cytoscape hands a tap to the topmost one, so an arbitrary node would make the
 * "panel names the node I clicked" assertion ambiguous.
 */
async function pickNode(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.ng-canvas') as HTMLElement;
    const cy = (canvas as any).__cy;
    const { width, height } = canvas.getBoundingClientRect();

    const pts = cy
      .nodes()
      .filter((el: any) => el.degree() > 0)
      .map((el: any) => ({ el, p: el.renderedPosition(), r: el.renderedWidth() / 2 }))
      .filter((c: any) => c.p.x > c.r && c.p.y > c.r && c.p.x < width - c.r && c.p.y < height - c.r);

    let best: any = null;
    for (const c of pts) {
      let nearest = Infinity;
      for (const o of pts) {
        if (o.el.id() === c.el.id()) continue;
        nearest = Math.min(nearest, Math.hypot(o.p.x - c.p.x, o.p.y - c.p.y));
      }
      if (!best || nearest > best.nearest) best = { ...c, nearest };
    }
    return { label: best.el.data('label') as string, x: best.p.x as number, y: best.p.y as number };
  });
}

/** Click a node at its own rendered position; the panel must name that node. */
async function clickNode(page: import('@playwright/test').Page) {
  await waitForGraphSettled(page);
  const t = await pickNode(page);
  await page.locator('.ng-canvas').click({ position: { x: t.x, y: t.y } });
  await expect(page.locator('.ng-panel')).toBeVisible();
  await expect(page.locator('.ng-panel .ng-slug')).toHaveText(t.label);
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

  await clickNode(page);
  await expect(page.locator('.ng-panel .ng-degree')).toContainText(/cites \d+ · cited by \d+/);
});

// ---------------------------------------------------------------------------
// Tap-offset regression guard.
//
// Cytoscape caches the container's viewport position (`containerBB`, from
// getBoundingClientRect) with no TTL, and only invalidates it on cy.resize(), a
// pixel-ratio change, or scroll/transitionend/animationend on the container or
// an ancestor. So a *pure positional* shift — the container moves while its
// width and height stay the same — leaves the cache stale and offsets every tap
// by that delta. A ResizeObserver cannot see it (the box never changes), and
// cytoscape already ships one anyway.
//
// Growing the controls above the graph reproduces exactly that: `.ng-canvas` is
// `width:100%; height:min(72vh,640px)`, so only its `top` moves. In production
// the same shift comes from the async webfont swap reflowing the prose above.
// ---------------------------------------------------------------------------

test('node taps stay aligned after the container moves without resizing', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });

  const before = await page.locator('.ng-canvas').boundingBox();

  await page.evaluate(() => {
    (document.querySelector('.ng-controls') as HTMLElement).style.paddingBottom = '120px';
  });

  const after = await page.locator('.ng-canvas').boundingBox();
  // The container moved down but kept its size — the case nothing observes.
  expect(after!.y).toBeGreaterThan(before!.y + 100);
  expect(after!.width).toBeCloseTo(before!.width, 0);
  expect(after!.height).toBeCloseTo(before!.height, 0);

  await clickNode(page);
});
