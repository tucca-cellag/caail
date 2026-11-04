import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { cellRefCount, counts } from './data';
import { awaitHydrated } from './hydration';
import { RETIRED_BASES, SITE_BASE } from '../src/content/site-config';

test('homepage shows the sections grid with counts', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Explore the library' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(`${counts.papers} References`) }).first(),
  ).toBeVisible();
});

test('explorer cell click opens the reference side panel', async ({ page }) => {
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  const n = cellRefCount('Deep Learning', 'cell');
  await page
    .getByRole('button', { name: `Deep Learning × Cellular Engineering: ${n} papers` })
    .click();
  await expect(page.getByRole('heading', { name: 'Deep Learning × Cellular Engineering' })).toBeVisible();
  await expect(page.getByText(/Li, X\..*Li, M\. \(2020\)/)).toBeVisible();
  await expect(page.getByRole('link', { name: '10.1038/s41467-020-15851-3' })).toBeVisible();
  await expect(page.getByRole('link', { name: '⟨⟩ Code' }).first()).toBeVisible();
});

test('explorer matrix cells carry no prose margin, so each method row is as tall as its contents', async ({ page }) => {
  // Inside .sl-markdown-content, Starlight's prose rule gives an element that
  // follows a sibling a top margin, unless either one is an a, strong, em, del,
  // span, input, code or br. Inside the matrix grid it landed on every cell,
  // adding the margin to each row's height so the matrix pane showed only part
  // of the method rows. Asserted as the defect itself rather than as "every row
  // fits", which would fail for the wrong reason the day a method row is added.
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  const m = await page.locator('.px-mx').evaluate((mx) => {
    const grid = getComputedStyle(mx);
    const items = [...mx.children] as HTMLElement[];
    // The grid's own resolved columns and rows, not a count of its classes.
    const perRow = grid.gridTemplateColumns.split(' ').length;
    const tracks = grid.gridTemplateRows.split(' ').map(parseFloat);
    const rows: HTMLElement[][] = [];
    for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow));
    // Grid items stretch to fill their row, so their own boxes cannot show extra
    // space. Measure what sits inside them: a label's text button, and the cells,
    // which have a fixed height. Row 0 is the header, sized by its own min-height,
    // so it is covered by the margin check alone.
    const content = (el: HTMLElement) => (el.querySelector('button') ?? el).getBoundingClientRect().height;
    const excess = rows.slice(1).map((row, r) => tracks[r + 1] - Math.max(...row.map(content)));
    const margins = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      return [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft];
    };
    return {
      items: items.length,
      perRow,
      rows: rows.length,
      tracks: tracks.length,
      // The grid itself as well as its items. The pane's not-content covers both,
      // and checking the grid catches it gaining a margin, such as from something
      // placed above it while the exemption does not cover it. It does not catch
      // not-content moving down onto the grid by itself: the grid is the pane's
      // first child, so nothing gives it a margin until something precedes it.
      withMargin: [mx as HTMLElement, ...items].filter((el) => margins(el).some((v) => v !== '0px')).length,
      worstExcess: Math.max(...excess),
    };
  });
  // The grid holds exactly the rows the slicing assumes; a stray child fails here
  // rather than misaligning the comparison below.
  expect(m.items % m.perRow).toBe(0);
  expect(m.tracks).toBe(m.rows);
  expect(m.rows).toBeGreaterThan(2);
  expect(m.withMargin).toBe(0);
  expect(m.worstExcess).toBeLessThanOrEqual(1);
});

test('explorer axis label opens a definition popup with a link to the full Taxonomy entry', async ({ page }) => {
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  const label = page.getByRole('button', { name: 'Deep Learning', exact: true });
  await expect(label).toHaveAttribute('aria-expanded', 'false');
  await label.click();
  // Popup shows the definition prose + a link out to /taxonomy/.
  const link = page.getByRole('link', { name: /View full definition/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /\/taxonomy\/#deep-learning$/);
  await expect(label).toHaveAttribute('aria-expanded', 'true');
  // Escape dismisses it.
  await page.keyboard.press('Escape');
  await expect(link).toHaveCount(0);
});

test('explorer search filters the matrix and lists global matches', async ({ page }) => {
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  await expect(page.getByText('Select a cell to read its references.')).toBeVisible();
  await page.getByPlaceholder(/Search authors/).fill('Cosenza');
  // Side panel switches to a global results summary.
  await expect(page.getByText(/matching paper/)).toBeVisible();
  // Clearing the box restores the idle state.
  await page.getByPlaceholder(/Search authors/).fill('');
  await expect(page.getByText('Select a cell to read its references.')).toBeVisible();
});

test('explorer ranks method rows by frequency when an area is selected', async ({ page }) => {
  await page.goto('./papers/explorer/');
  await awaitHydrated(page, 'PapersExplorer');
  await page.locator('.px-select').selectOption({ label: 'Media Optimization' });
  // One column of cells, top-to-bottom; counts must be non-increasing (blanks = 0).
  //
  // The retry covers the re-rank tick after selectOption. It does NOT cover firing
  // selectOption before hydration — that loses the change event outright, so the state
  // never updates and re-reading it can never converge. awaitHydrated above is what
  // prevents that; this block only absorbs the render tick.
  await expect(async () => {
    const nums = (await page.locator('.px-c').allTextContents()).map((t) => parseInt(t, 10) || 0);
    expect(nums.length).toBeGreaterThan(1);
    expect(nums).toEqual([...nums].sort((a, b) => b - a));
  }).toPass({ timeout: 15_000 });
});

test('homepage has no serious/critical a11y violations', async ({ page }) => {
  await page.goto('./');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
});

test('the retired research-area route redirects to the method page, base included', async ({ page, baseURL }) => {
  // astro.config.mjs base-prefixes a redirect's KEY but emits its DESTINATION
  // verbatim, so omitting ${BASE} there builds cleanly, passes every unit test
  // and every other e2e spec, and ships a meta-refresh to a domain-root 404.
  // Nothing but a real navigation catches it. Seen failing on the un-prefixed
  // destination before this was trusted.
  await page.goto('./research-areas/aievaluation/');
  // Assert the URL rather than waiting for it: a missing base still navigates,
  // just to the wrong place, so toHaveURL reports the actual destination instead
  // of timing out with nothing to read.
  await expect(page).toHaveURL(new URL('methods/benchmarksevaluation/', baseURL).href);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Benchmarks & Evaluation Frameworks' }),
  ).toBeVisible();
});

test('research area prose page renders with its mapped title', async ({ page }) => {
  await page.goto('./research-areas/bioprocess/');
  await expect(page.getByRole('heading', { level: 1, name: 'Bioprocess & Scale-Up' })).toBeVisible();
});

test('internal prose link to a rendered page resolves to a site route; deferred falls back to GitHub', async ({ page }) => {
  await page.goto('./datasets/cow/');
  const main = page.locator('main');
  // a link to a rendered ResearchAreas/Datasets page is a root-relative site route (ends with /).
  // Scoped to the page's Markdown content: the site-wide beta notice in <main> carries a
  // root-relative link of its own, which would otherwise satisfy this with no rewrite at all.
  await expect(
    main.locator('.sl-markdown-content a[href^="/"]:not([href^="//"])[href$="/"]').first(),
  ).toBeVisible();
  // ...and none of them still carries a base the site has left, which the locator
  // above cannot tell apart from a current root-relative route.
  for (const b of RETIRED_BASES.filter((r) => r !== SITE_BASE)) {
    await expect(main.locator(`a[href="${b}"], a[href^="${b}/"], a[href^="${b}?"], a[href^="${b}#"]`)).toHaveCount(0);
  }
  // a deferred target (Software/Databases/Papers) falls back to a GitHub blob URL
  await expect(main.locator('a[href^="https://github.com/tucca-cellag/caail/blob/main/"]').first()).toBeVisible();
  // no raw relative .md links remain in the prose body
  await expect(main.locator('a[href$=".md"]')).toHaveCount(0);
});

test('pagefind indexes prose content', async ({ page }) => {
  await page.goto('./');
  // Open Starlight search. Prefer the visible search button; fall back to the "/" shortcut.
  // Anchor the name to the START of the accessible name so it targets the
  // "Search" button and not some nav dropdown that merely contains the
  // substring "search" (as "Research Areas" did before the two matrix axes were
  // merged into one "Matrix Axes" trigger).
  const searchButton = page.getByRole('button', { name: /^search/i });
  if (await searchButton.count()) { await searchButton.first().click(); } else { await page.keyboard.press('/'); }
  const input = page.getByPlaceholder(/search/i);
  await input.fill('bioprocess');
  // Pagefind renders result links inside the search dialog; expect a result
  // pointing at the bioprocess page. Scope to the dialog so this targets a
  // search result, not the (hidden) nav-dropdown link to the same page.
  await expect(page.locator('dialog a[href*="/research-areas/bioprocess"]').first()).toBeVisible({ timeout: 10000 });
});
