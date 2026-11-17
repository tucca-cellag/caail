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
import { citedEntryIds } from './model.ts';

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

/**
 * An inventory row's document says what CAAIL holds about its data, as the row
 * does: a repository deposit (and where), a supplementary results table, or an
 * embargoed deposit. Rows are chosen from the API by their status, never by id,
 * so the checks follow the data.
 */
describe('an inventory row says where its data are', () => {
  const rows = api.datasets.inventory;
  const textOf = (id: string) => byId.get(id)?.text ?? '';
  const dataLines = (id: string) => textOf(id).split('\n').filter((line) => line.startsWith('Data: '));
  const first = (test: (row: (typeof rows)[number]) => boolean) => {
    const row = rows.find(test);
    if (!row) throw new Error('the API has no inventory row of this kind any more; point this test at another');
    return row;
  };

  it('gives every row exactly one Data line', () => {
    for (const row of rows) expect(dataLines(row.id), row.id).toHaveLength(1);
  });

  it('says a deposit with an accession is deposited, and names the accession', () => {
    const row = first((r) => r.dataStatus === 'deposit' && r.accession !== null);
    expect(dataLines(row.id)[0]).toMatch(/^Data: deposited in a repository/);
    expect(dataLines(row.id)[0]).toContain(row.accession as string);
  });

  it('names a deposit hosted under a DOI by that DOI', () => {
    const row = first((r) => r.dataStatus === 'deposit' && r.accession === null && r.dataDoi !== null);
    expect(dataLines(row.id)[0]).toMatch(/^Data: deposited in a repository/);
    expect(dataLines(row.id)[0]).toContain(row.dataDoi as string);
  });

  it('names a deposit with neither accession nor DOI by its URL', () => {
    const row = first((r) => r.dataStatus === 'deposit' && r.accession === null && r.dataDoi === null);
    expect(dataLines(row.id)[0]).toContain(row.dataUrl as string);
  });

  it('says a supplementary row has no repository deposit', () => {
    const row = first((r) => r.dataStatus === 'supplementary');
    expect(dataLines(row.id)[0]).toMatch(/supplementary files/);
    expect(textOf(row.id)).not.toMatch(/deposited in a repository/);
  });

  it('says an unavailable row is embargoed, never that its data are deposited, and keeps what lifts the embargo', () => {
    const row = first((r) => r.dataStatus === 'unavailable');
    expect(dataLines(row.id)[0]).toMatch(/embargoed/);
    expect(textOf(row.id)).not.toMatch(/deposited in a repository/);
    // The description is where the row says what lifts the embargo, so none of it is cut.
    const description = (row.columns.Description ?? '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
    expect(textOf(row.id)).toContain(description);
  });

  // A SuperSeries row's SubSeries are deposits of their own, named nowhere else
  // when they have no row; the row's document names each one.
  it('names every SubSeries accession in its SuperSeries row', () => {
    const superseries = rows.filter((row) => row.subseries.length > 0);
    expect(superseries.length).toBeGreaterThan(0);
    for (const row of superseries) {
      for (const member of row.subseries) expect(textOf(row.id), row.id).toContain(member.accession);
    }
  });

  // An empty cell is written as a lone dash, in every column. None reaches a
  // document: not as a host name in the Data line, nor as a description.
  it('leaves out a Data or Description cell that is only the empty-cell dash', () => {
    const [template] = rows;
    const empty = '\u2014';
    const row = {
      ...template,
      id: 'ds:empty-cells',
      columns: { ...template.columns, Data: empty, Description: empty },
      dataStatus: 'deposit',
      accession: null,
      dataDoi: null,
      dataUrl: 'https://zenodo.org/records/1',
      subseries: [],
    };
    const built = buildCorpus({ ...api, datasets: { ...api.datasets, inventory: [row] } });
    const text = built.find((entry) => entry.id === row.id)?.text ?? '';

    expect(text).not.toContain(empty);
    expect(text).toContain('Data: deposited in a repository, https://zenodo.org/records/1.');
    expect(text).not.toMatch(/^Description:/m);
  });

  it('calls no row a deposit for being in the inventory', () => {
    for (const row of rows) expect(textOf(row.id)).not.toMatch(/a deposit in the data inventory/);
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

  // A study on request is named by its DOI, and DOIs may carry parentheses and
  // semicolons, which would end a Markdown link early. Its item is
  // percent-encoded in the link, so the link stays whole and still names it.
  it('builds a link for a study whose DOI carries parentheses and a semicolon, and counts it as cited', () => {
    const doi = '10.1016/S0168-1605(24)00001-2;V2';
    const [first, ...rest] = api.datasets.onRequest;
    const built = buildCorpus({ ...api, datasets: { ...api.datasets, onRequest: [{ ...first, paperDoi: doi }, ...rest] } });
    const study = built.find((entry) => entry.id === `onrequest:${doi.toLowerCase()}`);

    expect(study).toBeDefined();
    const link = study?.link ?? '';
    expect(link).not.toMatch(/[();]/);
    expect(new URL(link).searchParams.get('item')).toBe(study?.id);
    expect(citedEntryIds(`Listed as [a study](${link}).`, built)).toEqual([study?.id]);
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
  it('finds a SuperSeries row by each of its SubSeries accessions', () => {
    for (const row of api.datasets.inventory) {
      for (const member of row.subseries) {
        expect(lookup.match(`Which dataset holds ${member.accession}?`), `${member.accession} under ${row.id}`).toContain(row.id);
      }
    }
  });

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
