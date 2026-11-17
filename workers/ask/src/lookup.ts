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
 * ids the index build gives the same items. It and `entryIdsOf` walk the files
 * apart, so corpus.test.ts checks that every id it can return (`nameable`) is
 * one `entryIdsOf` knows: retrieval would drop any other in silence.
 */
import { MAX_NAMED_FETCHED } from './settings.ts';
import { onRequestItemId, paperItemId, termItemId } from './ids.ts';
import { TYPOGRAPHIC_PUNCTUATION, trimTrailing, trimVersion } from './text.ts';

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
  /** Read for its terms' ids only; terms are not boosted by name (see buildLookup). */
  taxonomy: { definitions: Record<string, string> };
}

export interface Lookup {
  /**
   * Entry ids the question names, strongest first, at most MAX_NAMED_FETCHED.
   * Retrieval keeps the first MAX_NAMED of them the index holds.
   */
  match(question: string): string[];
  /** Whether the corpus these files hold has an entry with this id. */
  knows(id: string): boolean;
}

/** The lookup `buildLookup` builds, which also says every id it can return. */
export interface BuiltLookup extends Lookup {
  /** Every id `match` can return: the ids some DOI, accession or name in the files leads to. */
  nameable: ReadonlySet<string>;
}

/**
 * Every entry id the corpus in these files holds, derived by the same id rules
 * the corpus build uses (ids.ts): each catalog item's served itemId, `paper:<n>`
 * for each reference, each dataset entry's and inventory row's served id, a
 * study on request by its DOI, each report's served id, and `term:<slug>` for
 * each taxonomy definition. corpus.test.ts checks it equals the built corpus's
 * ids. The Worker drops any vector outside it, so an entry the index still
 * holds after leaving the corpus, because a rebuild's deletes failed or have
 * not landed, is never offered to the model.
 */
export function entryIdsOf(files: LookupFiles): Set<string> {
  const ids = new Set<string>();
  for (const row of [...files.catalog.software, ...files.catalog.databases]) ids.add(row.itemId);
  for (const ref of files.papersIndex.references) ids.add(paperItemId(ref.id));
  for (const entry of files.datasets.entries) ids.add(entry.id);
  for (const row of files.datasets.inventory) ids.add(row.id);
  for (const study of files.datasets.onRequest) if (study.paperDoi) ids.add(onRequestItemId(study.paperDoi));
  for (const report of files.reports.reports) ids.add(report.id);
  for (const label of Object.keys(files.taxonomy.definitions)) ids.add(termItemId(label));
  return ids;
}

/**
 * A DOI as it appears in running text. A DOI's suffix may hold almost any
 * printable character, so it runs to the first space, ASCII quote, angle bracket
 * or typographic punctuation mark (TYPOGRAPHIC_PUNCTUATION, text.ts), which a
 * DOI pasted inside curly quotes or followed by an apostrophe would otherwise
 * keep. It starts only where a DOI can: not after a letter, digit, underscore
 * or dot, so `v210.1038/...` yields no candidate starting inside the token,
 * while a DOI after a space, bracket, quote, colon or the slash of a URL still
 * does. Linear: the lookbehind reads one character, the suffix class is greedy
 * with nothing after it to backtrack into, and each start position does
 * bounded work before it fails. lookup.test.ts times it on a pathological
 * question.
 */
const DOI_IN_TEXT = new RegExp(`(?<![\\w.])10\\.\\d{4,9}/[^\\s"'<>${TYPOGRAPHIC_PUNCTUATION}]+`, 'g');

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

/** The words of a text, case kept: a name is found only as whole words in the case it is catalogued in. */
function wordsOf(text: string): string[] {
  return text.normalize('NFKC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

interface NameMatcher {
  words: string[];
  /** The name's length in characters, which ranks a longer name ahead of one it contains. */
  rank: number;
  ids: string[];
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
export function buildLookup(files: LookupFiles): BuiltLookup {
  const known = entryIdsOf(files);
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

  const nameable = new Set<string>();
  for (const map of [dois, accessions, names]) for (const ids of map.values()) for (const id of ids) nameable.add(id);

  // Nothing longer than the longest identifier held can match one, so a longer
  // candidate is dropped before it is looked up. The bounds come from the corpus,
  // so they move with it.
  const longestDoi = longest(dois);
  const longestAccession = longest(accessions);

  // Names indexed by their first word, so a question is matched by looking up
  // each of its own words rather than by scanning it once per name: the cost
  // follows the question's length, not the number of names.
  const byFirstWord = new Map<string, NameMatcher[]>();
  for (const [name, ids] of names) {
    const words = wordsOf(name);
    if (words.length === 0) continue;
    const matchers = byFirstWord.get(words[0]) ?? [];
    matchers.push({ words, rank: words.join(' ').length, ids });
    byFirstWord.set(words[0], matchers);
  }

  return {
    knows: (id: string) => known.has(id),
    nameable,
    match(question: string): string[] {
      // Every id is taken in rank order: DOIs, then accessions, then names
      // longest first, each in the order it is found. So nothing found after
      // MAX_NAMED_FETCHED ids could displace one of them, and finding stops
      // there. A Set keeps the order and answers membership at once.
      const found = new Set<string>();
      const full = () => found.size >= MAX_NAMED_FETCHED;
      const take = (ids: string[] | undefined) => {
        for (const id of ids ?? []) {
          if (full()) return;
          found.add(id);
        }
      };

      for (const [candidate] of question.matchAll(DOI_IN_TEXT)) {
        if (full()) return [...found];
        const doi = normalizeDoi(candidate);
        if (doi.length <= longestDoi) take(dois.get(doi));
      }
      for (const token of question.split(/[^A-Za-z0-9_.-]+/)) {
        if (full()) return [...found];
        const accession = normalizeAccession(token);
        if (accession && accession.length <= longestAccession) take(accessions.get(accession));
      }
      if (full()) return [...found];

      // Every name is found before any is taken: a longer name later in the
      // question ranks ahead of a shorter one earlier.
      const words = wordsOf(question);
      const hits = new Set<NameMatcher>();
      for (let i = 0; i < words.length; i++) {
        for (const matcher of byFirstWord.get(words[i]) ?? []) {
          if (hits.has(matcher) || i + matcher.words.length > words.length) continue;
          let k = 1;
          while (k < matcher.words.length && words[i + k] === matcher.words[k]) k++;
          if (k === matcher.words.length) hits.add(matcher);
        }
      }
      // Longest names first, so a name that contains a shorter one ranks ahead of
      // it when both match.
      for (const matcher of [...hits].sort((a, b) => b.rank - a.rank)) {
        if (full()) break;
        take(matcher.ids);
      }
      return [...found];
    },
  };
}
