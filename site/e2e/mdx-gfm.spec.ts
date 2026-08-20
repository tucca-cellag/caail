import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { relative, join } from 'node:path';
import { test, expect } from '@playwright/test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';

/**
 * GFM survives in the in-repo Starlight MDX pipeline.
 *
 * This is a regression oracle for a silent, upstream-caused content loss, not a
 * test of remark-gfm itself.
 *
 * Astro 6.4 moved the markdown defaults onto its new `unified()` processor and
 * left `markdown.gfm` undefined unless a project sets it. The `@astrojs/mdx` the
 * lockfile resolves (5.0.6) predates that redesign and gates the plugin on
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
 * The leading `---` block, split into the fields and where the block ends.
 *
 * Both are returned together because they are different lengths and using one
 * for the other is a live bug rather than a hypothetical: slicing the source by
 * the length of the FIELDS leaves a ragged tail of the frontmatter behind, which
 * is then parsed as page content.
 */
function frontmatter(src: string): { fields: string; end: number } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  return m ? { fields: m[1], end: m[0].length } : { fields: '', end: 0 };
}

/**
 * Count the GFM tables a page will render, by parsing it.
 *
 * This deliberately asks remark rather than pattern-matching the source. Two
 * earlier hand-rolled versions of this function were wrong in opposite
 * directions and both would have failed the spec on a page that renders fine:
 * a regex that missed single-dash and outer-pipe-less delimiter rows undercounted,
 * and a hand-tracked code fence that closes on the first matching marker
 * character regardless of fence length mis-pairs nested fences, so a table below
 * a ```-inside-```` block was skipped. remark-gfm is the same extension Astro
 * feeds its own pipeline, it is already a direct dependency here, and it settles
 * fences, delimiter grammar and indentation exactly rather than approximately.
 */
function countTables(src: string): number {
  const tree = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(src.slice(frontmatter(src).end));
  let n = 0;
  visit(tree, 'table', () => {
    n++;
  });
  return n;
}

/**
 * Starlight routes a docs file by its path relative to src/content/docs, minus
 * the extension, with an `index` segment collapsing away — unless the page
 * overrides it with a `slug:`.
 *
 * Astro slugifies each path segment, which lowercases it, so a capitalised
 * filename does NOT route at its literal path. Deriving the route verbatim sent
 * this spec to a 404 and reported it as a GFM regression. Lowercasing covers the
 * filenames this repo actually uses; `response.ok()` in the test is the backstop
 * for whatever else Astro's slugger does that this does not, and it fails with a
 * message naming the route rather than blaming GFM.
 */
function routeFor(absPath: string, src: string): string {
  const slugLine = /^slug:\s*(.+?)\s*$/m.exec(frontmatter(src).fields);
  const raw = slugLine
    ? slugLine[1].replace(/^['"]|['"]$/g, '')
    : relative(DOCS, absPath).replace(/\.mdx$/, '');
  const clean = raw
    .split('/')
    .map((seg) => seg.toLowerCase())
    .join('/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/(^|\/)index$/, '');
  return clean === '' ? './' : `./${clean}/`;
}

const pagesWithTables = mdxFiles(DOCS)
  .map((file) => {
    const src = readFileSync(file, 'utf8');
    return { file, src, route: routeFor(file, src), tables: countTables(src) };
  })
  // A draft page is not built, so navigating to it would 404 and read as a GFM
  // regression rather than as a page that deliberately does not exist.
  .filter((p) => p.tables > 0 && !/^draft:\s*true\s*$/m.test(frontmatter(p.src).fields));

test('the MDX sources still contain at least one GFM table to check', () => {
  // Guards the derivation itself. If every table were refactored out of MDX the
  // loop below would silently become zero assertions, and this file would report
  // green while checking nothing.
  expect(pagesWithTables.length).toBeGreaterThan(0);
});

for (const { file, route, tables } of pagesWithTables) {
  const name = relative(DOCS, file);

  test(`${name} renders its GFM tables as real tables, not pipe text`, async ({ page }) => {
    const response = await page.goto(route);

    // Separates "the route derivation is wrong" from "GFM regressed". Without
    // it a bad route lands on the 404 page, counts zero tables, and reports the
    // regression this spec exists to name.
    expect(response?.ok(), `${name} did not resolve to a page at ${route}`).toBe(true);

    // The count must match the source: one <table> short means one table
    // silently degraded, which a bare "at least one table" assertion would miss.
    //
    // `:not(.not-content)` excludes tables a component rendered rather than
    // Markdown. Starlight marks non-prose output with `.not-content`, and
    // MetricsDashboard.astro already emits two `table.md-grid.not-content`
    // inside <main> on /by-the-numbers/ — inside `.sl-markdown-content` too, so
    // that wrapper does not discriminate. by-the-numbers.mdx has no GFM table
    // today and so is not in this set, but the whole point of deriving the set
    // is that it covers a page the day one is added, and on that day a bare
    // `main table` would expect 1, find 3, and blame a GFM regression.
    await expect(page.locator('main table:not(.not-content)')).toHaveCount(tables);

    // A pipe-delimited row surviving as paragraph text is the exact shape of the
    // failure. Assert it directly so a regression names its own cause instead of
    // surfacing as an unrelated "cell not found" somewhere else in the suite.
    // `:?` on both sides so an ALIGNMENT row (`|:---|`, `|---:|`, `|:--:|`) still
    // matches. Without it this assertion goes vacuous the first time an MDX table
    // uses column alignment, and a real regression would surface only as the count
    // mismatch above, losing the diagnostic this line exists to provide.
    await expect(page.locator('main p').filter({ hasText: /\|\s*:?-+:?\s*\|/ })).toHaveCount(0);
  });
}
