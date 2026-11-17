/**
 * The corpus against the committed API it is built from, and each link against
 * the rule the site itself renders that page's ids by.
 *
 * Counts here are read from the API files, never typed: the corpus is held to
 * "one document per item the API serves", whatever that number is today.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_URL } from '../../../site/src/content/site-config.ts';
import { CAAIL_PAGES } from '../../../site/src/content/caail-pages.ts';
import { ghSlug } from '../../../site/src/lib/axis-links.ts';
import { editionAnchor as siteEditionAnchor } from '../../../site/src/lib/report-groups.ts';
import { siteSlug } from '../../../site/src/lib/heading-slug.ts';
import { ON_REQUEST_HEADING } from '../../../site/scripts/parser/datasets.ts';
import { INVENTORY_ANCHOR, ON_REQUEST_ANCHOR, buildCorpus, clip, corpusDateOf, editionAnchor, type ApiFiles } from './corpus.ts';
import { taxonomySlug } from './ids.ts';
import { buildLookup } from './lookup.ts';

const apiFile = (name: string) => JSON.parse(readFileSync(new URL(`../../../site/public/api/${name}`, import.meta.url), 'utf8'));
const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

const api: ApiFiles = {
  index: apiFile('index.json'),
  catalog: apiFile('catalog.json'),
  papers: apiFile('papers.json'),
  datasets: apiFile('datasets.json'),
  taxonomy: apiFile('taxonomy.json'),
  reports: apiFile('reports.json'),
};
const corpus = buildCorpus(api);
const byId = new Map(corpus.map((entry) => [entry.id, entry]));
const ofKind = (kind: string) => corpus.filter((entry) => entry.kind === kind);

describe('one document per item the API serves', () => {
  const SERVED: [kind: string, served: () => number][] = [
    ['software', () => api.catalog.software.length],
    ['database', () => api.catalog.databases.length],
    ['paper', () => api.papers.references.length],
    ['dataset', () => api.datasets.entries.length + api.datasets.inventory.length],
    ['study', () => api.datasets.onRequest.length],
    ['term', () => Object.keys(api.taxonomy.definitions).length],
    ['report', () => api.reports.reports.length],
  ];

  it.each(SERVED)('%s', (kind, served) => {
    expect(ofKind(kind)).toHaveLength(served());
  });

  it('builds no kind the counts above do not check', () => {
    expect(new Set(corpus.map((entry) => entry.kind))).toEqual(new Set(SERVED.map(([kind]) => kind)));
  });

  it('uses the served ids where the API serves one', () => {
    for (const item of [...api.catalog.software, ...api.catalog.databases]) expect(byId.has(item.itemId)).toBe(true);
    for (const item of [...api.datasets.entries, ...api.datasets.inventory]) expect(byId.has(item.id)).toBe(true);
    for (const report of api.reports.reports) expect(byId.has(report.id)).toBe(true);
  });

  // Nothing rebuilds a catalog id from its slug: a served id of any form is kept.
  it('keeps a catalog entry\'s served itemId', () => {
    const [first, ...rest] = api.catalog.software;
    const served = buildCorpus({ ...api, catalog: { ...api.catalog, software: [{ ...first, itemId: 'sw:served-id' }, ...rest] } });
    expect(served.find((entry) => entry.id === 'sw:served-id')?.link).toBe(`${SITE_URL}software/#${first.slug}`);
    expect(served.some((entry) => entry.id === first.itemId)).toBe(false);
  });

  it('names every document and starts its text with the name', () => {
    for (const entry of corpus) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.text.startsWith(entry.name)).toBe(true);
    }
  });

  it('records the corpus date every file shares', () => {
    expect(corpusDateOf(api)).toBe(api.index.corpusDate);
  });

  it('refuses files from two different parses', () => {
    expect(() => corpusDateOf({ ...api, reports: { ...api.reports, corpusDate: '1999-01-01' } })).toThrow(/reports is dated 1999-01-01/);
  });

  it('refuses a duplicate id', () => {
    const twice = { ...api, reports: { ...api.reports, reports: [api.reports.reports[0], api.reports.reports[0]] } };
    expect(() => buildCorpus(twice)).toThrow(/two items share the id/);
  });
});

describe('every link is a site page that names its entry', () => {
  const docsPage = (route: string) => existsSync(new URL(`../../../site/src/content/docs/${route}.mdx`, import.meta.url));
  const routeOf = (link: string) => new URL(link).pathname.replace(/^\/|\/$/g, '');

  it('is absolute, on the site, and unique to its entry', () => {
    for (const entry of corpus) expect(entry.link.startsWith(SITE_URL)).toBe(true);
    expect(new Set(corpus.map((entry) => entry.link)).size).toBe(corpus.length);
  });

  it('points at a page the site renders', () => {
    for (const entry of corpus) {
      const route = routeOf(entry.link);
      expect(docsPage(route) || CAAIL_PAGES.byId(route) !== undefined, `${entry.id}: /${route}/`).toBe(true);
    }
  });

  it('puts a catalog entry at its card, whose id is its slug', () => {
    for (const item of api.catalog.software) expect(byId.get(item.itemId)?.link).toBe(`${SITE_URL}software/#${item.slug}`);
    for (const item of api.catalog.databases) expect(byId.get(item.itemId)?.link).toBe(`${SITE_URL}databases/#${item.slug}`);
  });

  it('puts a dataset entry at its card, on the page the site routes it to', () => {
    for (const entry of api.datasets.entries) {
      const route = CAAIL_PAGES.idForSourcePath(`Datasets/${entry.page}`);
      expect(byId.get(entry.id)?.link).toBe(`${SITE_URL}${route}/#${entry.anchor}`);
    }
  });

  it('puts an inventory row and a study on request at their sections, the ids their headings render', () => {
    expect(siteSlug('Complete data inventory')).toBe(INVENTORY_ANCHOR);
    expect(siteSlug(ON_REQUEST_HEADING)).toBe(ON_REQUEST_ANCHOR);
    for (const page of new Set(api.datasets.inventory.map((row) => row.page))) {
      expect(repoFile(`Datasets/${page}.md`)).toMatch(/^## Complete data inventory$/m);
    }
    for (const page of new Set(api.datasets.onRequest.map((study) => study.page))) {
      expect(repoFile(`Datasets/${page}.md`)).toMatch(new RegExp(`^## ${ON_REQUEST_HEADING}$`, 'm'));
    }
    for (const row of api.datasets.inventory) {
      const route = CAAIL_PAGES.idForSourcePath(`Datasets/${row.page}`);
      expect(byId.get(row.id)?.link).toBe(`${SITE_URL}${route}/?item=${row.id}#${INVENTORY_ANCHOR}`);
    }
  });

  it('anchors a taxonomy term as the site anchors it', () => {
    for (const label of Object.keys(api.taxonomy.definitions)) {
      expect(taxonomySlug(label)).toBe(ghSlug(label));
    }
    for (const entry of ofKind('term')) expect(entry.link).toMatch(new RegExp(`^${SITE_URL}taxonomy/#`));
  });

  it('anchors a field report edition as its card does', () => {
    for (const report of api.reports.reports) {
      expect(editionAnchor(report.id)).toBe(siteEditionAnchor(report.id));
      expect(byId.get(report.id)?.link).toBe(`${SITE_URL}field-reports/#${siteEditionAnchor(report.id)}`);
    }
  });

  it('sends a paper to the explorer or the reviews shelf by whether it is in the matrix', () => {
    for (const ref of api.papers.references) {
      const page = ref.isPrimary ? 'papers/explorer' : 'papers/reviews';
      expect(byId.get(`paper:${ref.id}`)?.link).toBe(`${SITE_URL}${page}/?item=paper:${ref.id}`);
    }
  });
});

describe('the lookup and the corpus agree', () => {
  const lookup = buildLookup({
    catalog: api.catalog,
    papersIndex: apiFile('papers-index.json'),
    datasets: api.datasets,
    reports: api.reports,
  });

  // A lookup id the corpus does not hold would fetch nothing from the index, and
  // a corpus entry the lookup cannot name could never be boosted.
  it('names each entry but the taxonomy terms by its own name, and nothing the corpus lacks', () => {
    for (const entry of corpus) {
      const found = lookup.match(`Tell me about ${entry.name}.`);
      for (const id of found) expect(byId.has(id), `${id} is not in the corpus`).toBe(true);
      if (entry.kind === 'term') continue;
      expect(found, entry.id).toContain(entry.id);
    }
  });
});

describe('clip', () => {
  it('keeps short text whole and cuts long text at a sentence end', () => {
    expect(clip('One. Two.', 50)).toBe('One. Two.');
    expect(clip(`${'a'.repeat(30)}. ${'b'.repeat(40)}.`, 50)).toBe(`${'a'.repeat(30)}.`);
    expect(clip('word '.repeat(30), 20)).toMatch(/^(word ){3}word…$/);
  });
});
