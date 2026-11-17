/**
 * The exact-match boost: the entries a question names outright, by DOI,
 * accession or name.
 *
 * An embedding places "GSE169291" or "10.1038/s43016-022-00658-w" wherever its
 * characters happen to fall, so semantic search finds a named entry only by
 * luck. This finds it directly, and retrieval puts what it finds ahead of the
 * semantic matches.
 *
 * Built from the API's compact index files, which the Worker bundles. The ids it
 * returns are entry ids (ids.ts), so they are the same ids the index build gives
 * the same items; corpus.test.ts checks that every id it can return is one the
 * corpus holds.
 */
import { TOP_K } from './settings.ts';
import { catalogItemId, onRequestItemId, paperItemId } from './ids.ts';

interface LookupCatalogRow {
  slug: string;
  name: string;
  kind: string;
  doi: string | null;
}

interface LookupPaperRow {
  id: number;
  title: string;
  doi: string | null;
}

/** The files the lookup reads. Taxonomy is absent on purpose; see `buildLookup`. */
export interface LookupFiles {
  catalogIndex: { entries: LookupCatalogRow[] };
  papersIndex: { references: LookupPaperRow[] };
  datasets: {
    entries: { id: string; name: string; doi: string | null; accessions: string[] }[];
    inventory: { id: string; name: string; accession: string | null; paperDoi: string | null; dataDoi: string | null }[];
    onRequest: { study: string; paperDoi: string | null }[];
  };
  reports: { reports: { id: string; title: string }[] };
}

export interface Lookup {
  /** Entry ids the question names, strongest first, at most TOP_K. */
  match(question: string): string[];
}

/**
 * A DOI as it appears in running text. The trailing class strips punctuation a
 * sentence puts after it.
 */
const DOI_IN_TEXT = /10\.\d{4,9}\/[^\s"'<>]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/** A name shorter than this is matched only as an exact, case-sensitive word. */
const SHORT_NAME = 4;

function normalizeDoi(doi: string): string {
  return doi.trim().toLowerCase().replace(TRAILING_PUNCTUATION, '');
}

/** Accessions compare case-insensitively and without a version suffix (SRA051669.1 is SRA051669). */
function normalizeAccession(accession: string): string {
  return accession.trim().toUpperCase().replace(/\.\d+$/, '');
}

/** Lowercase words separated by single spaces, padded so a phrase match falls on word boundaries. */
function phrase(text: string): string {
  const words = text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return words ? ` ${words} ` : '';
}

function add(map: Map<string, string[]>, key: string, id: string): void {
  if (!key) return;
  const ids = map.get(key) ?? [];
  if (!ids.includes(id)) ids.push(id);
  map.set(key, ids);
}

/**
 * Build the lookup.
 *
 * Taxonomy terms are not boosted by name. Their labels ("Deep Learning",
 * "Scaffolding") are the ordinary vocabulary of a question, so boosting them
 * would hand two of the eight places to definitions whenever a question asks
 * whether a method has been applied to an area, the shape that most needs the
 * papers. A question about what a term means still finds its definition by
 * meaning.
 */
export function buildLookup(files: LookupFiles): Lookup {
  const dois = new Map<string, string[]>();
  const accessions = new Map<string, string[]>();
  const names = new Map<string, string[]>();

  for (const row of files.catalogIndex.entries) {
    if (row.kind !== 'software' && row.kind !== 'database') continue;
    const id = catalogItemId(row.kind, row.slug);
    add(names, row.name.trim(), id);
    if (row.doi) add(dois, normalizeDoi(row.doi), id);
  }
  for (const ref of files.papersIndex.references) {
    const id = paperItemId(ref.id);
    add(names, ref.title.trim(), id);
    if (ref.doi) add(dois, normalizeDoi(ref.doi), id);
  }
  for (const entry of files.datasets.entries) {
    add(names, entry.name.trim(), entry.id);
    if (entry.doi) add(dois, normalizeDoi(entry.doi), entry.id);
    for (const accession of entry.accessions) add(accessions, normalizeAccession(accession), entry.id);
  }
  for (const row of files.datasets.inventory) {
    add(names, row.name.trim(), row.id);
    if (row.accession) add(accessions, normalizeAccession(row.accession), row.id);
    if (row.paperDoi) add(dois, normalizeDoi(row.paperDoi), row.id);
    if (row.dataDoi) add(dois, normalizeDoi(row.dataDoi), row.id);
  }
  for (const study of files.datasets.onRequest) {
    if (!study.paperDoi) continue;
    const id = onRequestItemId(study.paperDoi);
    add(names, study.study.trim(), id);
    add(dois, normalizeDoi(study.paperDoi), id);
  }
  for (const report of files.reports.reports) add(names, report.title.trim(), report.id);

  // Longest names first, so a name that contains a shorter one ranks ahead of it
  // when both match.
  const nameMatchers = [...names.entries()]
    .map(([name, ids]) => ({ name, phrase: phrase(name), ids }))
    .filter((matcher) => matcher.phrase)
    .sort((a, b) => b.phrase.length - a.phrase.length);

  return {
    match(question: string): string[] {
      const found: string[] = [];
      const take = (ids: string[] | undefined) => {
        for (const id of ids ?? []) if (!found.includes(id)) found.push(id);
      };

      for (const doi of question.match(DOI_IN_TEXT) ?? []) take(dois.get(normalizeDoi(doi)));
      const tokens = question.split(/[^A-Za-z0-9_.-]+/).filter(Boolean);
      for (const token of tokens) take(accessions.get(normalizeAccession(token.replace(TRAILING_PUNCTUATION, ''))));

      const questionPhrase = phrase(question);
      const words = new Set(question.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
      for (const matcher of nameMatchers) {
        const short = matcher.phrase.trim().length < SHORT_NAME;
        if (short ? words.has(matcher.name) : questionPhrase.includes(matcher.phrase)) take(matcher.ids);
      }
      return found.slice(0, TOP_K);
    },
  };
}
