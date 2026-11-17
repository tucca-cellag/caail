/**
 * The exact-match boost: the entries a question names outright, by DOI,
 * accession or name.
 *
 * An embedding places "GSE169291" or "10.1038/s43016-022-00658-w" wherever its
 * characters happen to fall, so semantic search finds a named entry only by
 * luck. This finds it directly, and retrieval puts what it finds ahead of the
 * semantic matches.
 *
 * Built from the API files the Worker bundles. The ids it returns are entry ids
 * (ids.ts), read as the files serve them where they serve one, so they are the
 * ids the index build gives the same items; corpus.test.ts checks that every id
 * it can return is one the corpus holds.
 */
import { TOP_K } from './settings.ts';
import { onRequestItemId, paperItemId } from './ids.ts';
import { trimTrailing, trimVersion } from './text.ts';

interface LookupCatalogRow {
  itemId: string;
  name: string;
  doi: string | null;
}

interface LookupPaperRow {
  id: number;
  title: string;
  doi: string | null;
}

/** The files the lookup reads. Taxonomy is absent on purpose; see `buildLookup`. */
export interface LookupFiles {
  catalog: { software: LookupCatalogRow[]; databases: LookupCatalogRow[] };
  papersIndex: { references: LookupPaperRow[] };
  datasets: {
    entries: { id: string; name: string; doi: string | null; accessions: string[] }[];
    inventory: {
      id: string;
      name: string;
      accession: string | null;
      paperDoi: string | null;
      dataDoi: string | null;
      subseries: { accession: string; id: string | null }[];
    }[];
    onRequest: { study: string; paperDoi: string | null }[];
  };
  reports: { reports: { id: string; title: string }[] };
}

export interface Lookup {
  /** Entry ids the question names, strongest first, at most TOP_K. */
  match(question: string): string[];
}

/**
 * A DOI as it appears in running text. Linear: the suffix class is greedy with
 * nothing after it to backtrack into, and each start position does bounded work
 * before it fails. lookup.test.ts times it on a pathological question.
 */
const DOI_IN_TEXT = /10\.\d{4,9}\/[^\s"'<>]+/g;

/** Punctuation a sentence puts after an identifier, stripped by a walk, not a pattern (text.ts). */
const TRAILING_PUNCTUATION: ReadonlySet<string> = new Set('.,;:!?)]}');

function normalizeDoi(doi: string): string {
  return trimTrailing(doi.trim(), TRAILING_PUNCTUATION).toLowerCase();
}

/** Accessions compare case-insensitively and without a version suffix (SRA051669.1 is SRA051669). */
function normalizeAccession(accession: string): string {
  return trimVersion(trimTrailing(accession.trim(), TRAILING_PUNCTUATION)).toUpperCase();
}

/** The length of the longest key, or 0 for none. */
function longest(map: Map<string, string[]>): number {
  let max = 0;
  for (const key of map.keys()) max = Math.max(max, key.length);
  return max;
}

/**
 * The words of a text, case kept, separated by single spaces and padded, so a
 * name is found only as whole words in the case it is catalogued in.
 */
function wordsOf(text: string): string {
  const words = text.normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
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
 * A name matches only as a whole-word occurrence of its catalogued form, case
 * included. Many names are ordinary words in another case: STRING and PRIDE are
 * databases, "string" and "pride" are not, and "open problems" or "a virtual
 * lab" in a question do not mean the Open Problems benchmark or the Virtual Lab
 * agent. The cost is that a name written in another case, or a title quoted in
 * another case, is not boosted; it is still found by meaning.
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

  for (const row of [...files.catalog.software, ...files.catalog.databases]) {
    add(names, row.name.trim(), row.itemId);
    if (row.doi) add(dois, normalizeDoi(row.doi), row.itemId);
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
  // A SuperSeries row's SubSeries accessions find the row, after any row of the
  // SubSeries' own, which the loop above has already put first.
  for (const row of files.datasets.inventory) {
    for (const member of row.subseries) add(accessions, normalizeAccession(member.accession), row.id);
  }
  for (const study of files.datasets.onRequest) {
    if (!study.paperDoi) continue;
    const id = onRequestItemId(study.paperDoi);
    add(names, study.study.trim(), id);
    add(dois, normalizeDoi(study.paperDoi), id);
  }
  for (const report of files.reports.reports) add(names, report.title.trim(), report.id);

  // Nothing longer than the longest identifier held can match one, so a longer
  // candidate is dropped before it is looked up. The bounds come from the corpus,
  // so they move with it.
  const longestDoi = longest(dois);
  const longestAccession = longest(accessions);

  // Longest names first, so a name that contains a shorter one ranks ahead of it
  // when both match.
  const nameMatchers = [...names.entries()]
    .map(([name, ids]) => ({ words: wordsOf(name), ids }))
    .filter((matcher) => matcher.words)
    .sort((a, b) => b.words.length - a.words.length);

  return {
    match(question: string): string[] {
      const found: string[] = [];
      const take = (ids: string[] | undefined) => {
        for (const id of ids ?? []) if (!found.includes(id)) found.push(id);
      };

      for (const candidate of question.match(DOI_IN_TEXT) ?? []) {
        const doi = normalizeDoi(candidate);
        if (doi.length <= longestDoi) take(dois.get(doi));
      }
      for (const token of question.split(/[^A-Za-z0-9_.-]+/)) {
        const accession = normalizeAccession(token);
        if (accession && accession.length <= longestAccession) take(accessions.get(accession));
      }

      const questionWords = wordsOf(question);
      for (const matcher of nameMatchers) if (questionWords.includes(matcher.words)) take(matcher.ids);
      return found.slice(0, TOP_K);
    },
  };
}
