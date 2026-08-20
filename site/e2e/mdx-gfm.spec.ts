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
 * The leading `---` fenced block, if present. Only the first one counts as
 * frontmatter, and only when it opens the file.
 */
function frontmatter(src: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
  return m ? m[1] : '';
}

/**
 * A GFM delimiter row: the `| --- | --- |` line under a table's header.
 *
 * Deliberately not a single regex. GFM accepts a single dash per cell (`| - |`)
 * and omitted outer pipes (`--- | ---`), and a naive `\|(?:\s*:?-{2,}:?\s*\|)+`
 * misses both — which would make the expected count too LOW and fail this spec
 * on a page that is rendering perfectly. Parsing the cells is the only form that
 * matches the grammar rather than one common spelling of it.
 */
function isDelimiterRow(line: string): boolean {
  const t = line.trim();
  // GFM requires at least one pipe; without this a thematic break (`---`) counts.
  if (!t.includes('|')) return false;
  let body = t;
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|')) body = body.slice(0, -1);
  const cells = body.split('|');
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));
}

/**
 * Count the tables a page will actually render.
 *
 * Two things stop the count over-expecting, which would fail the spec while
 * naming the wrong cause. A delimiter row inside a fenced code block is emitted
 * as `<pre>`, never a `<table>`; and a delimiter row with no header line above
 * it is not a table at all, it is a paragraph. Both are skipped.
 */
function countTables(src: string): number {
  const lines = src.slice(frontmatter(src).length).split('\n');
  let fence: string | null = null;
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (opener) {
      const marker = opener[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    // A delimiter row only forms a table when a header row sits directly above.
    const prev = i > 0 ? lines[i - 1].trim() : '';
    if (isDelimiterRow(line) && prev !== '' && prev.includes('|')) count++;
  }
  return count;
}

/**
 * Starlight routes a docs file by its path relative to src/content/docs, minus
 * the extension, with `index` collapsing to the base itself — unless the page
 * overrides it with a `slug:`. Reading the frontmatter rather than assuming the
 * default keeps a future `slug:` page from 404ing here and reporting it as a
 * GFM regression. The `response.ok()` assertion in the test is the backstop for
 * whatever this derivation still gets wrong.
 */
function routeFor(absPath: string, src: string): string {
  const slugLine = /^slug:\s*(.+?)\s*$/m.exec(frontmatter(src));
  const slug = slugLine
    ? slugLine[1].replace(/^['"]|['"]$/g, '')
    : relative(DOCS, absPath).replace(/\.mdx$/, '');
  const clean = slug.replace(/^\/+|\/+$/g, '');
  return clean === '' || clean === 'index' ? './' : `./${clean}/`;
}

const pagesWithTables = mdxFiles(DOCS)
  .map((file) => {
    const src = readFileSync(file, 'utf8');
    return { file, src, route: routeFor(file, src), tables: countTables(src) };
  })
  // A draft page is not built, so navigating to it would 404 and read as a GFM
  // regression rather than as a page that deliberately does not exist.
  .filter((p) => p.tables > 0 && !/^draft:\s*true\s*$/m.test(frontmatter(p.src)));

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
    await expect(page.locator('main table')).toHaveCount(tables);

    // A pipe-delimited row surviving as paragraph text is the exact shape of the
    // failure. Assert it directly so a regression names its own cause instead of
    // surfacing as an unrelated "cell not found" somewhere else in the suite.
    await expect(page.locator('main p').filter({ hasText: /\|\s*-+\s*\|/ })).toHaveCount(0);
  });
}
