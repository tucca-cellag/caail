/**
 * fetch-authors.ts: refreshes author-cache.json, the full author names behind each
 * paper's DOI, which the shared-author graph uses to tell same-key people apart
 * (authors.ts).
 *
 * MANUAL / opt-in (`pnpm fetch:authors`), like fetch:citations: `pnpm parse` and
 * `pnpm build` read the committed cache and never touch the network. Re-run it when
 * papers are added. Until then a new paper has no record, and its shared-author joins
 * use names only, exactly as before; `pnpm parse` prints which papers that applies to.
 *
 * Sources, in order: Crossref for every DOI it holds (the publisher's deposit, with
 * any ORCID), then DataCite for the rest, which in this corpus are the arXiv DOIs.
 * Each is queried in batches of 50 DOIs, 5 s apart, so the corpus takes about eight
 * requests. No contact address is sent.
 *
 * Fails closed: a non-OK response throws, and the CLI writes nothing.
 *
 * The testable core (fetchAuthorCache, serializeAuthorCache) is importable and
 * side-effect-free; the DOI gathering and file write happen only under the isMain guard.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { AUTHOR_CACHE_PATH, type AuthorCache, type Authorship } from './authors.js';
import { doiKey } from './citations.js';
import { buildPapersModel } from './papers.js';

const CROSSREF_WORKS = 'https://api.crossref.org/works';
const DATACITE_DOIS = 'https://api.datacite.org/dois';
/** DOIs per request, for both registries. */
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

const chunk = <T>(xs: readonly T[], n: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Look the DOIs up in Crossref, then DataCite for any Crossref does not hold, and
 * assemble an AuthorCache. DOIs neither registry returns are absent from the cache.
 * Throws on a non-OK response, and on a DOI that a batch query cannot carry.
 */
export async function fetchAuthorCache(
  dois: ReadonlyArray<string | null | undefined>,
  {
    fetchImpl = fetch as unknown as FetchLike,
    delayMs = DELAY_MS,
    log = () => {},
    now = new Date().toISOString(),
  }: { fetchImpl?: FetchLike; delayMs?: number; log?: (msg: string) => void; now?: string } = {},
): Promise<AuthorCache> {
  const wanted = [...new Set(dois.map(doiKey).filter((d): d is string => d !== null))].sort();
  const wantedSet = new Set(wanted);
  // Crossref's filter separates values with commas and DataCite's query quotes them, so
  // a DOI holding either character cannot ride in a batch. None in the corpus does.
  const unbatchable = wanted.filter((d) => /[,"]/.test(d));
  if (unbatchable.length) throw new Error(`cannot batch DOIs containing , or ": ${unbatchable.join(' ')}`);

  let requests = 0;
  const getJson = async (url: string, label: string): Promise<unknown> => {
    if (requests++ > 0) await sleep(delayMs);
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${res.statusText}`);
    return res.json();
  };

  const works: AuthorCache['works'] = {};

  const crossrefBatches = chunk(wanted, BATCH_SIZE);
  for (const [i, batch] of crossrefBatches.entries()) {
    const params = new URLSearchParams({
      filter: batch.map((d) => `doi:${d}`).join(','),
      rows: String(BATCH_SIZE),
      select: 'DOI,author',
    });
    const label = `Crossref batch ${i + 1}/${crossrefBatches.length}`;
    const json = (await getJson(`${CROSSREF_WORKS}?${params}`, label)) as { message?: { items?: CrossrefItem[] } };
    for (const item of json.message?.items ?? []) {
      const key = doiKey(item.DOI);
      if (!key || !wantedSet.has(key)) continue;
      const authors = (item.author ?? [])
        .map((a) => ({ given: clean(a.given), family: clean(a.family), orcid: bareOrcid(a.ORCID) }))
        .filter(named);
      works[key] = { source: 'crossref', authors };
    }
    log(`${label}: ${json.message?.items?.length ?? 0} records`);
  }

  const rest = wanted.filter((d) => !works[d]);
  const dataciteBatches = chunk(rest, BATCH_SIZE);
  for (const [i, batch] of dataciteBatches.entries()) {
    const params = new URLSearchParams({
      query: `doi:(${batch.map((d) => `"${d}"`).join(' OR ')})`,
      'page[size]': String(BATCH_SIZE),
    });
    const label = `DataCite batch ${i + 1}/${dataciteBatches.length}`;
    const json = (await getJson(`${DATACITE_DOIS}?${params}`, label)) as { data?: DataciteRecord[] };
    for (const record of json.data ?? []) {
      const key = doiKey(record.id);
      if (!key || !wantedSet.has(key)) continue;
      const authors = (record.attributes.creators ?? [])
        .filter((c) => c.nameType !== 'Organizational')
        .map((c) => ({
          given: clean(c.givenName),
          family: clean(c.familyName),
          orcid: bareOrcid(
            c.nameIdentifiers?.find((n) => /orcid/i.test(n.nameIdentifierScheme ?? ''))?.nameIdentifier,
          ),
        }))
        .filter(named);
      works[key] = { source: 'datacite', authors };
    }
    log(`${label}: ${json.data?.length ?? 0} records`);
  }

  const missing = wanted.filter((d) => !works[d]);
  if (missing.length) log(`no record in either registry: ${missing.join(' ')}`);

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
      // eslint-disable-next-line no-console
      console.log(`fetch:authors: looking up ${dois.filter(Boolean).length} paper DOIs in Crossref, then DataCite`);
      // eslint-disable-next-line no-console
      const cache = await fetchAuthorCache(dois, { log: (m) => console.log('  ' + m) });
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
