import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { CAAIL_PAGES } from '../src/content/caail-pages.ts';
import { CANONICAL_SOURCES } from '../src/content/canonical-sources.ts';
import { isPublishedMarkdown } from '../src/lib/canonical-files.ts';
import { MIN_DATA_TABLE_COLUMNS } from '../src/lib/table-layout.ts';

/**
 * A page widens to the full content panel only when it holds a DATA table.
 *
 * The rule under test is the `.sl-container:has(…)` pair in
 * starlight-overrides.css, which drops Starlight's ~45rem cap so a per-species
 * inventory can render all nine of its columns. It used to fire on the presence
 * of any `table` at all, so `/community/` and `/datasets/readme/` — two-column
 * "label → target" tables, well inside the reading measure, and below the floor
 * `DataTableViews` uses before it will even offer a Cards view — were switched
 * to the same full-width layout.
 *
 * `table-layout.test.ts` checks the selector says what the constant says. This
 * checks the browser agrees, which is the part a selector test cannot reach:
 * `:has()` is resolved at match time against the real DOM, and whether a
 * two-column Markdown table produces a third `th` is a fact about the rendered
 * page rather than about the stylesheet.
 *
 * The page set is DERIVED from the canonical Markdown, so a canonical page that
 * gains or loses a wide table is covered the day it changes rather than the day
 * someone remembers this file. It walks the same two enumerations the loader
 * does, taking `dirs` and `topLevelSources()` from `CANONICAL_SOURCES` rather
 * than restating either, so a new prose page or a fourth canonical directory is
 * picked up automatically.
 *
 * WHAT THAT DERIVATION DOES NOT REACH, said plainly because the sentence above
 * used to claim the whole site. The CSS rule fires on any page with a
 * `.sl-markdown-content` table, and `src/content/docs/*.mdx` is outside these
 * two enumerations entirely. Two of those pages carry tables today: `/privacy/`
 * (3 and 4 columns) and `/curation/`, which qualifies ONLY through the single
 * 3-column table at `curation.mdx:16` since its other two are 2-column.
 *
 * SNAPSHOT 2026-09-01, and it is a snapshot rather than a fact: those are the
 * only two MDX pages carrying a Markdown table at all. `grep -c '^|'
 * src/content/docs/*.mdx` prints the live answer, and a page going from 0 to
 * non-zero is a page this file does not cover. Both were correct under the
 * current selector when measured; neither is covered here, so reduce that one
 * table to two columns and `/curation/` silently drops out of the full-width
 * layout with nothing failing.
 *
 * That gap is not closed by adding the MDX directory to the walk, which is why
 * it is documented rather than patched. An MDX page's tables can be rendered by
 * a component at runtime rather than written in the source, as
 * `/by-the-numbers/` renders two 6-column ones from `MetricsDashboard`, so a
 * static scan of MDX source is incomplete by construction and would report
 * coverage it does not have. Extending this to those pages means enumerating
 * routes and reading the BUILT html, which is a different spec.
 */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Header-cell count of every GFM table in a Markdown source. */
function tableColumnCounts(markdown: string): number[] {
  const lines = markdown.split('\n');
  const counts: number[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    // Fenced code can contain anything, including a row of pipes. Track the
    // fence rather than trusting the shape of the line.
    if (/^\s*(```|~~~)/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    if (!/^\s*\|/.test(lines[i])) continue;
    // A GFM table is a header row followed by a delimiter row; anything else
    // starting with a pipe is not one.
    if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? '')) continue;
    counts.push(
      lines[i]
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|').length,
    );
  }
  return counts;
}

/**
 * Does this source hold a GFM table AT ALL, however it is written?
 *
 * The counter above requires a leading `|`, which GFM does not: `Name | URL`
 * over `---|---` is a valid table. A page written that way returned no counts
 * and was dropped from BOTH lists, so it got no assertion and nothing failed.
 * That is a silent hole in a file whose stated value is that its coverage is
 * derived rather than remembered, and the both-sides guard cannot see it
 * because each list stays non-empty.
 *
 * This looks only for the DELIMITER row, which is the unambiguous half of the
 * construct, and needs at least one pipe so a `---` horizontal rule does not
 * match. Anything it finds that the counter missed is reported rather than
 * parsed: the fix for an unreadable table is to look at it, not to widen a
 * regex until it swallows prose. Snapshot 2026-09-01: zero canonical pages
 * take this path, so it is a latent hole rather than a live one.
 */
function hasDelimiterRow(markdown: string): boolean {
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line)) return true;
  }
  return false;
}

/** Every canonical prose source the site renders, as `{ route, widestTable }`. */
function prosePagesWithTables(): {
  pages: Array<{ route: string; columns: number }>;
  unparsed: string[];
} {
  const sources: string[] = [];
  for (const dir of CANONICAL_SOURCES.dirs) {
    for (const name of readdirSync(`${REPO_ROOT}${dir}`).filter(isPublishedMarkdown)) {
      sources.push(`${dir}/${name}`);
    }
  }
  sources.push(...CANONICAL_SOURCES.files);

  const pages: Array<{ route: string; columns: number }> = [];
  const unparsed: string[] = [];
  for (const source of sources) {
    const id = CAAIL_PAGES.idForSourcePath(source);
    if (!CAAIL_PAGES.byId(id)) continue;
    const markdown = readFileSync(`${REPO_ROOT}${source}`, 'utf8');
    const counts = tableColumnCounts(markdown);
    if (counts.length === 0) {
      // Holds a table this file cannot read, rather than holding none.
      if (hasDelimiterRow(markdown)) unparsed.push(source);
      continue;
    }
    pages.push({ route: `./${id}/`, columns: Math.max(...counts) });
  }
  return { pages, unparsed };
}

/**
 * The computed `max-width` of the `.sl-container` the rule actually targets.
 *
 * Walked up from the table rather than taken as the first `.sl-container` on
 * the page: Starlight renders three of them (the page-title panel and two
 * content panels), only one of which wraps the `.sl-markdown-content` holding
 * the table, and `.first()` is not it.
 */
const CONTAINER_MAX_WIDTH = (table: Element): string => {
  const container = table.closest('.sl-container');
  if (!container) throw new Error('table is not inside an .sl-container');
  return getComputedStyle(container).maxWidth;
};

// CAPTURED, NOT THROWN, and this file is the reason the rest of the branch
// bothers. `CANONICAL_SOURCES.files` is a getter that throws on a `group: 'top'`
// page with no `source`, and `readdirSync` throws on a renamed canonical
// directory. At module scope either aborts LOADING of this spec, so Playwright
// reports a file that failed to collect instead of a named assertion, and every
// test below is gone rather than red. Smaller blast radius than the same shape
// in the vitest guard, since Playwright does surface it, but it is the pattern
// this branch argues against and it does not get an exception for being ours.
let pages: Array<{ route: string; columns: number }> = [];
let unparsed: string[] = [];
let derivationError: unknown;
try {
  ({ pages, unparsed } = prosePagesWithTables());
} catch (e) {
  derivationError = e;
}
const narrow = pages.filter((p) => p.columns < MIN_DATA_TABLE_COLUMNS);
const wide = pages.filter((p) => p.columns >= MIN_DATA_TABLE_COLUMNS);

test('the page derivation ran', () => {
  expect(
    derivationError,
    'deriving the page set threw, so every assertion below was skipped rather '
      + 'than run. A canonical directory was probably renamed, or a top-level '
      + 'page lost its `source` field',
  ).toBeUndefined();
});

test('every canonical page holding a table was parsed', () => {
  expect(
    unparsed,
    'these pages hold a GFM delimiter row but yielded no column count, so they '
      + 'are in neither the narrow nor the wide list and nothing asserts '
      + 'anything about them. Most likely a table written without leading '
      + 'pipes, which `tableColumnCounts` does not read',
  ).toEqual([]);
});

test('the derivation found pages on both sides of the threshold', () => {
  // Guards the derivation. Either list going empty would turn its loop below
  // into zero assertions, and this file would report green while checking one
  // half of a rule whose whole point is the difference between the two.
  expect(narrow.length, 'no narrow-table prose page found to check').toBeGreaterThan(0);
  expect(wide.length, 'no wide-table prose page found to check').toBeGreaterThan(0);
});

for (const { route, columns } of narrow) {
  test(`${route} keeps the reading measure (widest table ${columns} columns)`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} did not resolve to a page`).toBe(true);
    const table = page.locator('.sl-markdown-content table').first();
    await expect(table).toBeVisible();

    // `max-width: none` is the widening. Anything else means the container is
    // still capped, which is what a page of prose with a small table should be.
    const maxWidth = await table.evaluate(CONTAINER_MAX_WIDTH);
    expect(maxWidth, `${route} was widened by a ${columns}-column table`).not.toBe('none');
  });
}

for (const { route, columns } of wide) {
  test(`${route} widens for its data table (widest ${columns} columns)`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok(), `${route} did not resolve to a page`).toBe(true);
    const table = page.locator('.sl-markdown-content table').first();
    await expect(table).toBeVisible();

    const maxWidth = await table.evaluate(CONTAINER_MAX_WIDTH);
    expect(maxWidth, `${route} stayed capped despite a ${columns}-column table`).toBe('none');
  });
}
