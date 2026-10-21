/**
 * fetch-authors.ts: refreshes author-cache.json, the full author names behind each
 * paper's DOI, which the shared-author graph uses to tell same-key people apart
 * (authors.ts).
 *
 * MANUAL / opt-in (`pnpm fetch:authors`), like fetch:citations: `pnpm parse` and
 * `pnpm build` read the committed cache and never touch the network. Re-run it when
 * papers are added: `pnpm --dir site test` fails until every paper with a DOI has a
 * record, and until then the new paper's shared-author joins use names only. A paper
 * with no DOI can have no record, and always joins by name.
 *
 * Sources, in order: Crossref for every DOI it holds (the publisher's deposit, with any
 * ORCID); DataCite for every DOI Crossref did not return with named authors (DataCite
 * registers arXiv's, for example); then each DOI still missing, one at a time from both,
 * so a batch query that mis-reads an unusual DOI cannot lose it. Batches are 50 DOIs and
 * every request is 5 s apart. No contact address is sent.
 *
 * Fails closed: a non-OK response (other than a single lookup's 404) throws, as does a
 * batch reporting more matches than one page holds, and the CLI writes nothing. A record
 * with named authors is never replaced by one without them, from this run or the last:
 * a DOI the registries skip in an otherwise good run, or return with no named authors
 * where it had some before, keeps its previous record, and the run says which. A DOI no
 * registry holds is recorded with source `none`, so the cache says the fetch ran for it;
 * `pnpm parse` lists those, which is where a mistyped DOI shows up.
 *
 * The testable core (fetchAuthorCache, serializeAuthorCache) is importable and
 * side-effect-free; the DOI gathering and file write happen only under the isMain guard.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { AUTHOR_CACHE_PATH, loadAuthorCache, type AuthorCache, type Authorship, type AuthorRecord } from './authors.js';
import { doiKey } from './citations.js';
import { buildPapersModel } from './papers.js';

const CROSSREF_WORKS = 'https://api.crossref.org/works';
const DATACITE_DOIS = 'https://api.datacite.org/dois';
/** DOIs per batch request, for both registries, and the page size asked for. */
const BATCH_SIZE = 50;
/** Delay between requests (ms). */
const DELAY_MS = 5000;
const USER_AGENT = 'CAAIL-shared-author-graph (https://github.com/tucca-cellag/caail)';

/** The minimal slice of `fetch` this script uses, so tests can stub the network. */
export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; statusText: string; json(): Promise<unknown> }>;

type CrossrefAuthor = { given?: string; family?: string; ORCID?: string };
type CrossrefItem = { DOI: string; author?: CrossrefAuthor[] };
type DataciteCreator = {
  name?: string;
  givenName?: string;
  familyName?: string;
  nameType?: string;
  nameIdentifiers?: { nameIdentifier?: string; nameIdentifierScheme?: string }[];
};
type DataciteRecord = { id: string; attributes: { creators?: DataciteCreator[] } };

/** The bare ORCID iD from any of the URL forms the registries return, else null. */
export function bareOrcid(value: string | null | undefined): string | null {
  const m = value?.match(/\d{4}-\d{4}-\d{4}-\d{3}[\dXx]/);
  return m ? m[0].toUpperCase() : null;
}

const clean = (s: string | undefined): string | null => s?.trim() || null;

/** Keep only authorships that name a person (drops consortium and organization entries). */
const named = (a: Authorship): boolean => a.family !== null || a.given !== null;

const crossrefAuthors = (item: CrossrefItem): Authorship[] =>
  (item.author ?? [])
    .map((a) => ({ given: clean(a.given), family: clean(a.family), orcid: bareOrcid(a.ORCID) }))
    .filter(named);

/**
 * A DataCite person's given and family names. Some records carry only `name`
 * ("Liu, Sherry"), which is split at its comma; a name with no comma stays unsplit and
 * unusable, since there is no telling which part is the family name.
 */
const dataciteNames = (c: DataciteCreator): { given: string | null; family: string | null } => {
  if (c.givenName || c.familyName) return { given: clean(c.givenName), family: clean(c.familyName) };
  const [family, given] = (c.name ?? '').split(/,(.*)/s);
  return given === undefined ? { given: null, family: null } : { given: clean(given), family: clean(family) };
};

const dataciteAuthors = (record: DataciteRecord): Authorship[] =>
  (record.attributes.creators ?? [])
    .filter((c) => c.nameType !== 'Organizational')
    .map((c) => ({
      ...dataciteNames(c),
      orcid: bareOrcid(c.nameIdentifiers?.find((n) => /orcid/i.test(n.nameIdentifierScheme ?? ''))?.nameIdentifier),
    }))
    .filter(named);

const chunk = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Look the DOIs up (Crossref, then DataCite, then one at a time for what is still
 * missing) and assemble an AuthorCache, falling back to `previous` as the module
 * docstring describes. Throws on a non-OK response other than a single lookup's 404, and
 * on a batch reporting more matches than one page holds.
 */
export async function fetchAuthorCache(
  dois: ReadonlyArray<string | null | undefined>,
  {
    fetchImpl = fetch as unknown as FetchLike,
    delayMs = DELAY_MS,
    log = () => {},
    now = new Date().toISOString(),
    previous = null,
  }: {
    fetchImpl?: FetchLike;
    delayMs?: number;
    log?: (msg: string) => void;
    now?: string;
    previous?: AuthorCache | null;
  } = {},
): Promise<AuthorCache> {
  const wanted = [...new Set(dois.map(doiKey).filter((d): d is string => d !== null))].sort();
  const wantedSet = new Set(wanted);
  // Crossref's filter separates values with commas and DataCite's query quotes them, so a
  // DOI holding either character skips the batches and is looked up on its own.
  const batchable = wanted.filter((d) => !/[,"]/.test(d));

  let requests = 0;
  const getJson = async (url: string, label: string, notFoundOk = false): Promise<unknown | null> => {
    if (requests++ > 0) await sleep(delayMs);
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (notFoundOk && res.status === 404) return null;
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
    return res.json();
  };
  const assertOnePage = (label: string, total: number | undefined, asked: number) => {
    if ((total ?? 0) > BATCH_SIZE) {
      throw new Error(`${label}: ${total} matches for ${asked} DOIs, more than one page of ${BATCH_SIZE} holds`);
    }
  };

  const works: AuthorCache['works'] = {};
  const hasNames = (d: string) => (works[d]?.authors.length ?? 0) > 0;
  // A record with named authors replaces one without them, never the reverse.
  const take = (d: string, record: AuthorRecord) => {
    if (!wantedSet.has(d)) return;
    if (!works[d] || (record.authors.length > 0 && !hasNames(d))) works[d] = record;
  };

  const crossrefBatches = chunk(batchable, BATCH_SIZE);
  for (const [i, batch] of crossrefBatches.entries()) {
    const params = new URLSearchParams({
      filter: batch.map((d) => `doi:${d}`).join(','),
      rows: String(BATCH_SIZE),
      select: 'DOI,author',
    });
    const label = `Crossref batch ${i + 1}/${crossrefBatches.length}`;
    const json = (await getJson(`${CROSSREF_WORKS}?${params}`, label)) as {
      message?: { items?: CrossrefItem[]; 'total-results'?: number };
    };
    assertOnePage(label, json.message?.['total-results'], batch.length);
    for (const item of json.message?.items ?? []) {
      const key = doiKey(item.DOI);
      if (key) take(key, { source: 'crossref', authors: crossrefAuthors(item) });
    }
    log(`${label}: ${json.message?.items?.length ?? 0} records`);
  }

  const dataciteBatches = chunk(
    batchable.filter((d) => !hasNames(d)),
    BATCH_SIZE,
  );
  for (const [i, batch] of dataciteBatches.entries()) {
    const params = new URLSearchParams({
      query: `doi:(${batch.map((d) => `"${d}"`).join(' OR ')})`,
      'page[size]': String(BATCH_SIZE),
    });
    const label = `DataCite batch ${i + 1}/${dataciteBatches.length}`;
    const json = (await getJson(`${DATACITE_DOIS}?${params}`, label)) as {
      data?: DataciteRecord[];
      meta?: { total?: number };
    };
    assertOnePage(label, json.meta?.total, batch.length);
    for (const record of json.data ?? []) {
      const key = doiKey(record.id);
      if (key) take(key, { source: 'datacite', authors: dataciteAuthors(record) });
    }
    log(`${label}: ${json.data?.length ?? 0} records`);
  }

  const single = wanted.filter((d) => !works[d]);
  for (const d of single) {
    const cr = (await getJson(`${CROSSREF_WORKS}/${encodeURIComponent(d)}`, `Crossref ${d}`, true)) as {
      message?: CrossrefItem;
    } | null;
    if (cr?.message) take(d, { source: 'crossref', authors: crossrefAuthors(cr.message) });
    if (hasNames(d)) continue;
    const dc = (await getJson(`${DATACITE_DOIS}/${encodeURIComponent(d)}`, `DataCite ${d}`, true)) as {
      data?: DataciteRecord;
    } | null;
    if (dc?.data) take(d, { source: 'datacite', authors: dataciteAuthors(dc.data) });
  }
  if (single.length) log(`looked up one at a time: ${single.join(' ')}`);

  const prevHasNames = (d: string) => (previous?.works[d]?.authors.length ?? 0) > 0;
  const emptied = wanted.filter((d) => works[d] && !hasNames(d) && prevHasNames(d));
  for (const d of emptied) works[d] = previous!.works[d];
  if (emptied.length) log(`returned with no named authors, so the previous record is kept: ${emptied.join(' ')}`);

  const missing = wanted.filter((d) => !works[d]);
  const kept = missing.filter((d) => previous?.works[d]);
  for (const d of kept) works[d] = previous!.works[d];
  if (kept.length) log(`not returned this run, so the previous record is kept: ${kept.join(' ')}`);
  const absent = missing.filter((d) => !works[d]);
  for (const d of absent) works[d] = { source: 'none', authors: [] };
  if (absent.length) log(`no registry holds these, recorded as none (check each DOI): ${absent.join(' ')}`);

  const sorted: AuthorCache['works'] = {};
  for (const k of Object.keys(works).sort()) sorted[k] = works[k];
  return { generatedAt: now, works: sorted };
}

/**
 * The cache as committed: one paper per line, sorted by DOI, so a refresh shows up in
 * review as a changed line per paper rather than a reflowed file.
 */
export function serializeAuthorCache(cache: AuthorCache): string {
  const keys = Object.keys(cache.works).sort();
  const lines = keys.map(
    (k, i) => `    ${JSON.stringify(k)}: ${JSON.stringify(cache.works[k])}${i < keys.length - 1 ? ',' : ''}`,
  );
  return `{\n  "generatedAt": ${JSON.stringify(cache.generatedAt)},\n  "works": {\n${lines.join('\n')}\n  }\n}\n`;
}

// ---------------------------------------------------------------------------
// CLI entrypoint, guarded so importing this module is side-effect-free
// ---------------------------------------------------------------------------

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  (async () => {
    try {
      const dois = buildPapersModel().references.map((r) => r.doi);
      const previous = loadAuthorCache();
      // eslint-disable-next-line no-console
      console.log(`fetch:authors: looking up ${dois.filter(Boolean).length} paper DOIs in Crossref, then DataCite`);
      // eslint-disable-next-line no-console
      const cache = await fetchAuthorCache(dois, { log: (m) => console.log('  ' + m), previous });
      writeFileSync(AUTHOR_CACHE_PATH, serializeAuthorCache(cache), 'utf-8');
      // eslint-disable-next-line no-console
      console.log(
        `fetch:authors: wrote author-cache.json (${Object.keys(cache.works).length} papers). ` +
          'Run `pnpm parse` to regenerate graph.json.',
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('fetch:authors: FAILED:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  })();
}
