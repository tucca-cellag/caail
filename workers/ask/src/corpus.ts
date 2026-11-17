/**
 * The documents the index is built from: one short document per item in the
 * published API (site/public/api/), each carrying the site page an answer cites.
 *
 * Read by the index build, which embeds each document's `text` and stores the
 * whole entry as the vector's metadata. The Worker never rebuilds documents; it
 * answers from the metadata the index holds, so an answer is built from exactly
 * the text that was embedded.
 *
 * The input types are structural and name only the fields read here. The API's
 * own schema is site/public/api/openapi.json.
 */
import { SITE_URL } from '../../../site/src/content/site-config.ts';
import { onRequestItemId, paperItemId, taxonomySlug, termItemId } from './ids.ts';

interface TopicRef {
  label: string;
}

interface CatalogItem {
  slug: string;
  itemId: string;
  name: string;
  group: string;
  summary: string;
  topics: TopicRef[];
  doi: string | null;
}

interface PaperRef {
  id: number;
  section: string;
  isPrimary: boolean;
  title: string | null;
  year: number | null;
  authors: string[] | null;
  journal: string | null;
  doi: string | null;
  topics: TopicRef[];
}

interface DatasetEntry {
  id: string;
  name: string;
  page: string;
  section: string;
  kind: string;
  anchor: string;
  topics: TopicRef[];
  doi: string | null;
  accessions: string[];
}

interface InventoryRow {
  id: string;
  page: string;
  name: string;
  columns: Record<string, string>;
  dataStatus: string | null;
  accession: string | null;
  dataDoi: string | null;
  dataUrl: string | null;
  paperDoi: string | null;
  topics: TopicRef[];
}

interface OnRequestStudy {
  page: string;
  study: string;
  paperDoi: string | null;
  statement: string;
}

interface Report {
  id: string;
  title: string;
  editionLabel: string;
  current: boolean;
  topics: TopicRef[];
}

/** The published API files the corpus is built from. */
export interface ApiFiles {
  index: { corpusDate: string };
  catalog: { corpusDate: string; software: CatalogItem[]; databases: CatalogItem[] };
  papers: {
    corpusDate: string;
    areas: { key: string; label: string }[];
    cells: { method: string; area: string; refIds: number[] }[];
    references: PaperRef[];
  };
  datasets: { corpusDate: string; entries: DatasetEntry[]; inventory: InventoryRow[]; onRequest: OnRequestStudy[] };
  taxonomy: {
    corpusDate: string;
    definitions: Record<string, string>;
    axes: { area: Record<string, string>; method: Record<string, string> };
  };
  reports: { corpusDate: string; reports: Report[] };
}

/** One indexed item, as embedded and as stored in its vector's metadata. */
export interface CorpusEntry {
  /** The entry id (see ids.ts). */
  id: string;
  kind: 'software' | 'database' | 'paper' | 'dataset' | 'study' | 'term' | 'report';
  name: string;
  /** The absolute site URL an answer cites for this entry. */
  link: string;
  /** What is embedded, and what the model reads. */
  text: string;
}

/** The longest a summary, description or definition runs in a document. */
const SUMMARY_CHARS = 500;
const DEFINITION_CHARS = 700;
/**
 * An inventory row's description is kept longer: it is where an embargoed row
 * says what lifts the embargo, and where secondary deposits are named.
 */
const DESCRIPTION_CHARS = 1_000;

/**
 * The ids the dataset pages give their two non-entry sections: GitHub's slug of
 * the `## Complete data inventory` and `## Data on request` headings, which
 * corpus.test.ts checks against the headings in the canonical pages.
 */
export const INVENTORY_ANCHOR = 'complete-data-inventory';
export const ON_REQUEST_ANCHOR = 'data-on-request';

/**
 * A field report edition's card id on /field-reports/. A copy of `editionAnchor`
 * in site/src/lib/report-groups.ts, which imports generated data and so cannot
 * load here; corpus.test.ts runs both over every report id.
 */
export function editionAnchor(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, '-');
}

/**
 * Characters a link may use. Every link is written into a Markdown link by the
 * model and found again in its answer, so it must survive both untouched: no
 * spaces, parentheses or brackets, which would end a Markdown link early.
 */
const LINK_SAFE = /^https:\/\/[A-Za-z0-9.:/?#=_~%-]+$/;

/**
 * An absolute URL for a path on the site. The path is resolved against SITE_URL
 * rather than its origin, so a site served under a base path keeps the base.
 */
function sitePage(path: string): string {
  const link = new URL(path, SITE_URL).href;
  if (!LINK_SAFE.test(link)) throw new Error(`corpus: ${link} has a character an answer's link cannot carry`);
  return link;
}

/**
 * The link for an entry whose page renders no anchor of its own (the papers
 * explorer and reviews shelf, an inventory row, a study on request). The query
 * names the entry, which is what lets a question record say which entry an
 * answer cited; the page ignores it and opens at `fragment`, if one is given.
 */
function itemOnPage(path: string, itemId: string, fragment = ''): string {
  return sitePage(`${path}?item=${itemId}${fragment ? `#${fragment}` : ''}`);
}

function datasetsPage(page: string): string {
  return `datasets/${page.toLowerCase()}/`;
}

/** Plain text from a short Markdown fragment: link text kept, link and code markers dropped. */
function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cut text to `max` characters, at a sentence end where one falls in its second half. */
export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const sentenceEnd = cut.lastIndexOf('. ');
  if (sentenceEnd >= max / 2) return cut.slice(0, sentenceEnd + 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : max)}…`;
}

function lines(...parts: (string | false | null | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part.length > 0).join('\n');
}

function topicsLine(topics: TopicRef[]): string | null {
  const labels = [...new Set(topics.map((topic) => topic.label))];
  return labels.length ? `Topics: ${labels.join('; ')}.` : null;
}

function catalogEntries(items: CatalogItem[], kind: 'software' | 'database'): CorpusEntry[] {
  const route = kind === 'software' ? 'software/' : 'databases/';
  return items.map((item) => ({
    id: item.itemId,
    kind,
    name: item.name,
    link: sitePage(`${route}#${item.slug}`),
    text: lines(
      item.name,
      `${kind === 'software' ? 'Software' : 'Database'} listed under "${item.group}".`,
      clip(plain(item.summary), SUMMARY_CHARS),
      topicsLine(item.topics),
      item.doi && `DOI: ${item.doi}`,
    ),
  }));
}

function paperEntries(papers: ApiFiles['papers']): CorpusEntry[] {
  const areaLabel = new Map(papers.areas.map((area) => [area.key, area.label]));
  const cellsOf = new Map<number, string[]>();
  for (const cell of papers.cells) {
    for (const ref of cell.refIds) {
      const label = `${cell.method} × ${areaLabel.get(cell.area) ?? cell.area}`;
      cellsOf.set(ref, [...(cellsOf.get(ref) ?? []), label]);
    }
  }
  return papers.references.map((ref) => {
    const id = paperItemId(ref.id);
    const title = ref.title ?? `Reference ${ref.id}`;
    const authors = ref.authors?.length ? `${ref.authors[0]}${ref.authors.length > 1 ? ' et al.' : ''}` : null;
    const byline = [authors, ref.year, ref.journal].filter((part) => part !== null && part !== '').join(', ');
    const cells = cellsOf.get(ref.id) ?? [];
    return {
      id,
      kind: 'paper' as const,
      name: title,
      link: itemOnPage(ref.isPrimary ? 'papers/explorer/' : 'papers/reviews/', id),
      text: lines(
        title,
        `Paper (${ref.isPrimary ? 'primary research' : ref.section})${byline ? `: ${byline}` : ''}.`,
        cells.length > 0 && `Matrix cells: ${cells.join('; ')}.`,
        topicsLine(ref.topics),
        ref.doi && `DOI: ${ref.doi}`,
      ),
    };
  });
}

/**
 * What an inventory row holds about its data and where they are, in the terms
 * of the dataset pages' own Data column (Datasets/CLAUDE.md): a repository
 * deposit, named by its accession, its DOI or its URL; a results table in the
 * paper's supplementary files; or a deposit that exists and is embargoed. A
 * status this does not know fails the build rather than being described as
 * something it is not.
 */
function dataLine(row: InventoryRow): string {
  switch (row.dataStatus) {
    case 'deposit': {
      const host = row.columns.Data ? plain(row.columns.Data) : '';
      const at = row.accession
        ? `accession ${row.accession}`
        : row.dataDoi
          ? `${host ? `${host}, ` : ''}DOI ${row.dataDoi}`
          : row.dataUrl
            ? `${host ? `${host}, ` : ''}${row.dataUrl}`
            : null;
      return `Data: deposited in a repository${at ? `, ${at}` : ''}.`;
    }
    case 'supplementary':
      return "Data: a results table in the paper's supplementary files, not a repository deposit.";
    case 'unavailable':
      return 'Data: a repository deposit exists but is embargoed and not yet public; the description says what lifts the embargo.';
    case null:
      return 'Data: where the data are is not recorded.';
    default:
      throw new Error(`corpus: ${row.id} has data status "${row.dataStatus}", which the corpus cannot describe`);
  }
}

const ENTRY_KIND_LABEL: Record<string, string> = {
  atlas: 'atlas',
  gem: 'genome-scale metabolic model',
  other: 'curated entry',
};

function datasetEntries(datasets: ApiFiles['datasets']): CorpusEntry[] {
  const entries = datasets.entries.map((entry) => ({
    id: entry.id,
    kind: 'dataset' as const,
    name: entry.name,
    link: sitePage(`${datasetsPage(entry.page)}#${entry.anchor}`),
    text: lines(
      entry.name,
      `Dataset (${ENTRY_KIND_LABEL[entry.kind] ?? entry.kind}) on the ${entry.page} datasets page${entry.section ? `, under "${entry.section}"` : ''}.`,
      topicsLine(entry.topics),
      entry.accessions.length > 0 && `Accessions: ${entry.accessions.join(', ')}.`,
      entry.doi && `DOI: ${entry.doi}`,
    ),
  }));

  // Study, Paper and Data are the row's name, paper link and data, carried below
  // by name, paperDoi and the Data line; Description has a line of its own.
  // An empty cell is written as a lone dash (U+2014) and is left out.
  const named = new Set(['Study', 'Paper', 'Data', 'Description']);
  const EMPTY_CELL = '\u2014';
  const inventory = datasets.inventory.map((row) => {
    const facts = Object.entries(row.columns)
      .filter(([label, value]) => !named.has(label) && plain(value) && plain(value) !== EMPTY_CELL)
      .map(([label, value]) => `${label}: ${plain(value)}.`)
      .join(' ');
    const description = row.columns.Description ? plain(row.columns.Description) : '';
    return {
      id: row.id,
      kind: 'dataset' as const,
      name: row.name,
      link: itemOnPage(datasetsPage(row.page), row.id, INVENTORY_ANCHOR),
      text: lines(
        row.name,
        `Dataset (a row of the data inventory) on the ${row.page} datasets page.`,
        dataLine(row),
        facts,
        description && `Description: ${clip(description, DESCRIPTION_CHARS)}`,
        row.paperDoi && `Paper DOI: ${row.paperDoi}`,
        topicsLine(row.topics),
      ),
    };
  });

  const onRequest = datasets.onRequest.map((study) => {
    if (!study.paperDoi) throw new Error(`corpus: the study "${study.study}" on ${study.page} has no DOI to name it by`);
    const id = onRequestItemId(study.paperDoi);
    return {
      id,
      kind: 'study' as const,
      name: study.study,
      link: itemOnPage(datasetsPage(study.page), id, ON_REQUEST_ANCHOR),
      text: lines(
        study.study,
        `Study on the ${study.page} datasets page whose data are shared only on request. CAAIL lists the study and holds none of its data.`,
        `Data availability statement: ${plain(study.statement)}`,
        `Paper DOI: ${study.paperDoi}`,
      ),
    };
  });

  return [...entries, ...inventory, ...onRequest];
}

function termEntries(taxonomy: ApiFiles['taxonomy']): CorpusEntry[] {
  return Object.entries(taxonomy.definitions).map(([label, definition]) => {
    const axis = label in taxonomy.axes.area ? 'research area (a column of the papers matrix)' : 'method (a row of the papers matrix)';
    return {
      id: termItemId(label),
      kind: 'term' as const,
      name: label,
      link: sitePage(`taxonomy/#${taxonomySlug(label)}`),
      text: lines(label, `CAAIL's definition of a ${axis}.`, clip(definition, DEFINITION_CHARS)),
    };
  });
}

function reportEntries(reports: Report[]): CorpusEntry[] {
  return reports.map((report) => ({
    id: report.id,
    kind: 'report' as const,
    name: report.title,
    link: sitePage(`field-reports/#${editionAnchor(report.id)}`),
    text: lines(
      report.title,
      `Field report, ${report.current ? 'the current edition' : 'superseded by a later edition'} (${report.editionLabel}).`,
      topicsLine(report.topics),
    ),
  }));
}

/**
 * The corpus date every file was generated at. They are written together by one
 * `pnpm parse`, so a disagreement means a partial regeneration, and an index built
 * from it would record a date half of it does not have.
 */
export function corpusDateOf(api: ApiFiles): string {
  const date = api.index.corpusDate;
  for (const [name, file] of Object.entries(api)) {
    if (file.corpusDate !== date) {
      throw new Error(`corpus: ${name} is dated ${file.corpusDate}, index.json ${date}; re-run pnpm parse`);
    }
  }
  return date;
}

/** One document per item, in a fixed order. Throws on a duplicate id. */
export function buildCorpus(api: ApiFiles): CorpusEntry[] {
  corpusDateOf(api);
  const corpus = [
    ...catalogEntries(api.catalog.software, 'software'),
    ...catalogEntries(api.catalog.databases, 'database'),
    ...paperEntries(api.papers),
    ...datasetEntries(api.datasets),
    ...termEntries(api.taxonomy),
    ...reportEntries(api.reports.reports),
  ];
  const seen = new Set<string>();
  for (const entry of corpus) {
    if (seen.has(entry.id)) throw new Error(`corpus: two items share the id ${entry.id}`);
    seen.add(entry.id);
  }
  return corpus;
}
