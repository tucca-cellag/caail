import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { metrics, stubSpeciesCount } from './data';

const seriousOnly = (results: { violations: { impact?: string | null }[] }) =>
  results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));

// ---------------------------------------------------------------------------
// M6 — By the Numbers (server-rendered dashboard)
// ---------------------------------------------------------------------------

test('by-the-numbers renders coverage, species bars, and momentum (no JS needed)', async ({ page }) => {
  await page.goto('./by-the-numbers/');
  await expect(page.getByRole('heading', { name: 'Research coverage' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /where help is wanted/i })).toBeVisible();
  // a dense species bar renders (scope to the dashboard's bar labels — "Fish"
  // also appears in the sidebar nav)
  await expect(page.locator('.md-label').filter({ hasText: 'Fish' })).toBeVisible();

  // One bar per species, and the stub marking matches metrics.json. Asserting a
  // stub row *exists* would be wrong: every species page now has deposits, so
  // there are legitimately zero stubs and the recruitment signal lists nothing.
  // `.md-row` is shared with the coverage sections, so scope to the species one.
  const speciesBars = page
    .locator('.md-sec')
    .filter({ has: page.getByRole('heading', { name: /Datasets by species/i }) })
    .locator('.md-bars');
  await expect(speciesBars.locator('.md-row')).toHaveCount(metrics.species.length);
  await expect(speciesBars.locator('.md-row.stub')).toHaveCount(stubSpeciesCount);
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
    // Fail with a clear message rather than a TypeError if a filter ever empties the set.
    if (!best) throw new Error('pickNode: no connected, on-screen node to click');
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

/**
 * The smallest connected node whose centre no other node covers. Small nodes are
 * the ones the fix is about, and cytoscape hands a tap to the topmost element, so
 * excluding covered ones keeps "the panel names the node I clicked" unambiguous.
 */
async function pickSmallNode(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.ng-canvas') as HTMLElement;
    const cy = (canvas as any).__cy;
    const { width, height } = canvas.getBoundingClientRect();
    const all = cy.nodes().map((el: any) => ({ el, p: el.renderedPosition(), r: el.renderedWidth() / 2 }));
    const cand = all
      .filter((c: any) => c.el.degree() > 0 && c.p.x > c.r && c.p.y > c.r && c.p.x < width - c.r && c.p.y < height - c.r)
      .filter((c: any) => !all.some((o: any) => o.el.id() !== c.el.id() && Math.hypot(o.p.x - c.p.x, o.p.y - c.p.y) < o.r))
      .sort((a: any, b: any) => a.r - b.r);
    if (!cand.length) throw new Error('pickSmallNode: no uncovered small node');
    const c = cand[0];
    return { label: c.el.data('label') as string, x: c.p.x as number, y: c.p.y as number, r: c.r as number };
  });
}

/**
 * A rendered edge midpoint that lies clear of every node body — a spot that sat
 * inside the edge's invisible hit band before the `events: no` fix.
 */
async function pickEdgeMidpoint(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.ng-canvas') as HTMLElement;
    const cy = (canvas as any).__cy;
    const { width, height } = canvas.getBoundingClientRect();
    const nodes = cy.nodes().map((n: any) => ({ p: n.renderedPosition(), r: n.renderedWidth() / 2 + 4 }));
    for (const e of cy.edges()) {
      const m = e.renderedMidpoint();
      if (!m || m.x < 5 || m.y < 5 || m.x > width - 5 || m.y > height - 5) continue;
      if (nodes.some((n: any) => Math.hypot(n.p.x - m.x, n.p.y - m.y) <= n.r)) continue;
      return { x: m.x as number, y: m.y as number };
    }
    throw new Error('pickEdgeMidpoint: no edge midpoint clear of nodes');
  });
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
// Edges are illustration only. They carry `events: no` so they leave cytoscape's
// hit-testing: a thin edge otherwise has a wide invisible tap band that both
// makes it selectable and swallows clicks aimed just off a small node (the node
// reads as unselectable). These guard both halves of that fix.
// ---------------------------------------------------------------------------

test('edges are inert — clicking a connection selects nothing and clears the panel', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });

  // Open a panel first, so the edge click has something to (not) leave behind.
  await clickNode(page);
  await expect(page.locator('.ng-panel')).toBeVisible();

  const e = await pickEdgeMidpoint(page);
  await page.locator('.ng-canvas').click({ position: { x: e.x, y: e.y } });

  // The tap falls through to the background: no edge selected, panel cleared.
  const selectedEdges = await page.evaluate(
    () => (document.querySelector('.ng-canvas') as any).__cy.$(':selected').edges().length,
  );
  expect(selectedEdges).toBe(0);
  await expect(page.locator('.ng-panel')).toHaveCount(0);
});

test('a small node selects when clicked at its centre', async ({ page }) => {
  await page.goto('./papers/network/');
  await page.waitForSelector('.ng-canvas canvas', { timeout: 20000 });
  await waitForGraphSettled(page);

  const t = await pickSmallNode(page);
  await page.locator('.ng-canvas').click({ position: { x: t.x, y: t.y } });
  await expect(page.locator('.ng-panel')).toBeVisible();
  await expect(page.locator('.ng-panel .ng-slug')).toHaveText(t.label);
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
