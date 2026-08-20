import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, join } from 'node:path';
import { test, expect } from '@playwright/test';

/**
 * GFM survives in the in-repo Starlight MDX pipeline.
 *
 * This is a regression oracle for a silent, upstream-caused content loss, not a
 * test of remark-gfm itself.
 *
 * Astro 6.4 moved the markdown defaults onto its new `unified()` processor and
 * left `markdown.gfm` undefined unless a project sets it. `@astrojs/mdx` 5.0.6,
 * which Starlight 0.39.2 pins, predates that redesign and gates the plugin on
 * `if (mdxOptions.gfm)` against the raw resolved config. The two together drop
 * remark-gfm from the MDX pipeline entirely, and every GFM construct in
 * src/content/docs/**.mdx degrades to plain text. Nothing throws, the build is
 * green, and the pages still render: a table just becomes a paragraph of pipe
 * characters. `markdown.gfm: true` in astro.config.mjs is the fix, and it looks
 * redundant enough to delete, which is why this test exists.
 *
 * The page set is DERIVED from the MDX sources rather than pinned to
 * privacy.mdx, so an MDX page that grows its first table is covered the day it
 * lands instead of the day someone remembers to extend this file.
 */
const DOCS = fileURLToPath(new URL('../src/content/docs/', import.meta.url));

/** Every .mdx under src/content/docs, recursively. */
function mdxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return mdxFiles(p);
    return e.isFile() && e.name.endsWith('.mdx') ? [p] : [];
  });
}

/**
 * Starlight routes a docs file by its path relative to src/content/docs, minus
 * the extension, with `index` collapsing to the base itself.
 */
function routeFor(absPath: string): string {
  const slug = relative(DOCS, absPath).replace(/\.mdx$/, '');
  return slug === 'index' ? './' : `./${slug}/`;
}

/**
 * A GFM table's delimiter row (`| --- | --- |`). Counting these counts tables,
 * and is the one GFM construct whose absence is unambiguous in the DOM: without
 * the plugin there is no <table> element at all.
 */
const DELIMITER_ROW = /^\s*\|(?:\s*:?-{2,}:?\s*\|)+\s*$/gm;

const pagesWithTables = mdxFiles(DOCS)
  .map((file) => ({
    file,
    route: routeFor(file),
    tables: (readFileSync(file, 'utf8').match(DELIMITER_ROW) ?? []).length,
  }))
  .filter((p) => p.tables > 0);

test('the MDX sources still contain at least one GFM table to check', () => {
  // Guards the derivation itself. If every table were refactored out of MDX the
  // loop below would silently become zero assertions, and this file would report
  // green while checking nothing.
  expect(pagesWithTables.length).toBeGreaterThan(0);
});

for (const { file, route, tables } of pagesWithTables) {
  const name = relative(DOCS, file);

  test(`${name} renders its GFM tables as real tables, not pipe text`, async ({ page }) => {
    await page.goto(route);

    // The count must match the source: one <table> short means one table
    // silently degraded, which a bare "at least one table" assertion would miss.
    await expect(page.locator('main table')).toHaveCount(tables);

    // A pipe-delimited row surviving as paragraph text is the exact shape of the
    // failure. Assert it directly so a regression names its own cause instead of
    // surfacing as an unrelated "cell not found" somewhere else in the suite.
    await expect(page.locator('main p').filter({ hasText: /\|\s*-{2,}\s*\|/ })).toHaveCount(0);
  });
}
