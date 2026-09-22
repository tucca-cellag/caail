import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rewriteCaailLinks } from './rewrite-caail-links.ts';
import { DEDICATED_ROUTES } from '../../src/content/dedicated-routes.ts';
import { CAAIL_PAGES } from '../../src/content/caail-pages.ts';
import type { Root } from 'mdast';

function urls(md: string, sourcePath: string): string[] {
  const tree = unified().use(remarkParse).parse(md) as Root;
  rewriteCaailLinks({ base: '/caail', sourcePath })(tree);
  const out: string[] = [];
  visit(tree, 'link', (n: any) => out.push(n.url));
  return out;
}

describe('rewriteCaailLinks', () => {
  it('rewrites a link to a rendered page to its site route', () => {
    expect(urls('[Pig](./Pig.md)', 'Datasets/Cow.md')).toEqual(['/caail/datasets/pig/']);
  });
  it('rewrites a ResearchAreas cross-link from a Datasets page', () => {
    expect(urls('[Bioprocess](../ResearchAreas/Bioprocess.md)', 'Datasets/Cow.md')).toEqual(['/caail/research-areas/bioprocess/']);
  });
  it('falls back to GitHub for a deferred target (Software.md) with anchor', () => {
    expect(urls('[x](../Software.md#causalbench)', 'Datasets/Cow.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/Software.md#causalbench']);
  });
  it('falls back to GitHub for a Papers.md reference anchor', () => {
    expect(urls('[ref](../Papers.md#50)', 'ResearchAreas/Bioprocess.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/Papers.md#50']);
  });
  it('falls back to GitHub for a missing file', () => {
    expect(urls('[x](./ResearchAreas/ProteinDesign.md)', 'CONTRIBUTING.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/ResearchAreas/ProteinDesign.md']);
  });
  it('leaves external links untouched', () => {
    expect(urls('[x](https://example.com/a)', 'Datasets/Cow.md')).toEqual(['https://example.com/a']);
  });
  it('leaves intra-page anchors untouched', () => {
    expect(urls('[x](#section)', 'Datasets/Cow.md')).toEqual(['#section']);
  });

  // ── Extra cases ────────────────────────────────────────────────────────────
  it('leaves mailto: links untouched', () => {
    expect(urls('[mail](mailto:hello@example.com)', 'Datasets/Cow.md'))
      .toEqual(['mailto:hello@example.com']);
  });
  it('leaves protocol-relative links untouched', () => {
    expect(urls('[x](//cdn.example.com/a.js)', 'Datasets/Cow.md'))
      .toEqual(['//cdn.example.com/a.js']);
  });
  it('rewrites a ./README.md link from inside Datasets/ to the mapped index page', () => {
    expect(urls('[Index](./README.md)', 'Datasets/Cow.md'))
      .toEqual(['/caail/datasets/readme/']);
  });
  it('rewrites a directory link (trailing slash) to its README index page', () => {
    // `./Datasets/` from a repo-root file → the Datasets index, not a 404.
    expect(urls('[Datasets](./Datasets/)', 'Software.md'))
      .toEqual(['/caail/datasets/readme/']);
  });
  it('drops a cross-file anchor when the target is a rendered page', () => {
    expect(urls('[Pig atlases](./Pig.md#featured-atlases)', 'Datasets/Cow.md'))
      .toEqual(['/caail/datasets/pig/']);
  });

  // ── Dedicated (card / island) routes, CAAIL-374 ───────────────────────────
  it('rewrites a bare link to a card page to its dedicated route', () => {
    expect(urls('[Field reports](./FieldReports.md)', 'OtherResources.md'))
      .toEqual(['/caail/field-reports/']);
    expect(urls('[Awesome lists](./AwesomeLists.md)', 'OtherResources.md'))
      .toEqual(['/caail/awesome-lists/']);
  });
  it('resolves a dedicated route from a subdirectory source', () => {
    expect(urls('[Talks](../Talks.md)', 'ResearchAreas/Bioprocess.md'))
      .toEqual(['/caail/talks/']);
  });
  it('keeps the GitHub blob for an ANCHORED link to a dedicated route', () => {
    // The card page mints its own anchors, so the on-site route would drop the
    // reader at the top of the page; the blob still deep-links.
    expect(urls('[GFI](./FieldReports.md#gfi)', 'OtherResources.md'))
      .toEqual(['https://github.com/tucca-cellag/caail/blob/main/FieldReports.md#gfi']);
  });
});

describe('DEDICATED_ROUTES', () => {
  const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
  const DOCS = fileURLToPath(new URL('../../src/content/docs/', import.meta.url));

  it('names only canonical files that exist', () => {
    for (const file of Object.keys(DEDICATED_ROUTES)) {
      expect(existsSync(join(REPO_ROOT, file)), file).toBe(true);
    }
  });
  it('points every entry at a route that has a page', () => {
    for (const route of Object.values(DEDICATED_ROUTES)) {
      const page = route === '/' ? 'index' : route.replace(/^\/|\/$/g, '');
      expect(existsSync(join(DOCS, `${page}.mdx`)), route).toBe(true);
    }
  });
  it('is disjoint from CAAIL_PAGES, which would render a second page at the route', () => {
    for (const file of Object.keys(DEDICATED_ROUTES)) {
      expect(CAAIL_PAGES.byId(CAAIL_PAGES.idForSourcePath(file)), file).toBeUndefined();
    }
  });
});
