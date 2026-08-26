import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { CAAIL_PAGES } from '../src/content/caail-pages.ts';
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
 * The page set is DERIVED from the canonical Markdown, so a page that gains or
 * loses a wide table is covered the day it changes rather than the day someone
 * remembers this file. Deriving it the way the loader does — walk the canonical
 * directories and the top-level sources, keep whatever `CAAIL_PAGES` registers —
 * also means a new prose page is picked up automatically.
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

/** Every canonical prose source the site renders, as `{ route, widestTable }`. */
function prosePagesWithTables(): Array<{ route: string; columns: number }> {
  const sources: string[] = [];
  for (const dir of ['ResearchAreas', 'Methods', 'Datasets']) {
    for (const name of readdirSync(`${REPO_ROOT}${dir}`).filter(isPublishedMarkdown)) {
      sources.push(`${dir}/${name}`);
    }
  }
  sources.push(...CAAIL_PAGES.topLevelSources());

  return sources.flatMap((source) => {
    const id = CAAIL_PAGES.idForSourcePath(source);
    if (!CAAIL_PAGES.byId(id)) return [];
    const counts = tableColumnCounts(readFileSync(`${REPO_ROOT}${source}`, 'utf8'));
    if (counts.length === 0) return [];
    return [{ route: `./${id}/`, columns: Math.max(...counts) }];
  });
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

const pages = prosePagesWithTables();
const narrow = pages.filter((p) => p.columns < MIN_DATA_TABLE_COLUMNS);
const wide = pages.filter((p) => p.columns >= MIN_DATA_TABLE_COLUMNS);

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
