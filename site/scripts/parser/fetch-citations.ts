/**
 * fetch-citations.ts — refreshes citation-cache.json from OpenAlex.
 *
 * MANUAL / opt-in (`pnpm fetch:citations`). This is the ONLY parser script that
 * touches the network: it looks up each DOI (Papers.md references plus the
 * associated-publication DOIs on catalog + dataset entries) in OpenAlex and records
 * the work's OpenAlex id, its `referenced_works` list, and its global
 * `cited_by_count`. graph.ts intersects the reference lists against the corpus at
 * parse time (offline) to derive in-corpus citation edges, and the parser folds the
 * `cited_by_count` onto every content type for the "cited by N" badge — so
 * `pnpm parse` / `pnpm build` stay deterministic and network-free, and you only
 * re-run this when papers/DOIs are added.
 *
 * Politeness: queries are batched ~50 DOIs per request (≈4 requests for the
 * whole corpus). Set OPENALEX_MAILTO=<contact> to use OpenAlex's faster "polite
 * pool"; without it we fall back to the common pool (no email is hardcoded).
 *
 * The testable core (fetchCitationCache) is importable and side-effect-free;
 * the file write + DOI gathering happen only under the isMain CLI guard.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPapersModel } from './papers.js';
import { doiKey, type CitationCache } from './citations.js';

/**
 * Read the `doi` column from a committed NDJSON table (catalog / dataset_entries), so
 * the fetch resolves counts for tool/dataset DOIs too, not just papers. Read as plain
 * files (no node:sqlite import) since this script runs without --experimental-sqlite.
 */
function ndjsonDois(file: string): string[] {
  const path = fileURLToPath(new URL(`../../db/ndjson/${file}`, import.meta.url));
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8').trim();
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => (JSON.parse(l) as { doi?: string | null }).doi)
    .filter((d): d is string => !!d);
}

/**
 * Flatten the `related_dois` JSON arrays from a committed NDJSON table (#102), so the
 * sibling version DOIs summed into a resource's badge also get their cited_by_count
 * fetched. A malformed/absent value contributes nothing.
 */
function ndjsonRelatedDois(file: string): string[] {
  const path = fileURLToPath(new URL(`../../db/ndjson/${file}`, import.meta.url));
  if (!existsSync(path)) return [];
  const text = readFileSync(path, 'utf-8').trim();
  if (!text) return [];
  return text.split('\n').flatMap((l) => {
    const raw = (JSON.parse(l) as { related_dois?: string | null }).related_dois;
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr) ? arr.filter((d): d is string => typeof d === 'string') : [];
    } catch {
      return [];
    }
  });
}

/** OpenAlex works endpoint. */
const OPENALEX_WORKS = 'https://api.openalex.org/works';
/** DOIs per OR-filter request (OpenAlex accepts up to 50 values per OR). */
const BATCH_SIZE = 50;
/** Polite delay between batches (ms). */
const BATCH_DELAY_MS = 1100;

/** Absolute path to the committed cache this script writes. */
export const CITATION_CACHE_PATH: string = fileURLToPath(
  new URL('./citation-cache.json', import.meta.url),
);

/** `&mailto=…` query fragment when OPENALEX_MAILTO is set, else ''. */
function mailtoParam(): string {
  const m = process.env.OPENALEX_MAILTO?.trim();
  return m ? `&mailto=${encodeURIComponent(m)}` : '';
}

function userAgent(): string {
  const m = process.env.OPENALEX_MAILTO?.trim();
  return m ? `CAAIL-citation-graph (${m})` : 'CAAIL-citation-graph';
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type OpenAlexWork = {
  id: string;
  doi: string | null;
  referenced_works?: string[];
  cited_by_count?: number;
};

/**
 * Query OpenAlex for the given DOIs and assemble a CitationCache. DOIs are
 * normalized + de-duplicated (doiKey); DOIs OpenAlex doesn't return are simply
 * absent from the cache. Throws on a non-OK HTTP response.
 *
 * @param dois  raw DOI strings (bare or URL form) from the corpus
 * @param log   optional progress sink (defaults to no-op)
 * @param now   ISO timestamp for `generatedAt` (injectable for determinism in tests)
 */
export async function fetchCitationCache(
  dois: ReadonlyArray<string | null | undefined>,
  log: (msg: string) => void = () => {},
  now: string = new Date().toISOString(),
): Promise<CitationCache> {
  const works: CitationCache['works'] = {};
  const unique = [
    ...new Set(dois.map(doiKey).filter((d): d is string => d !== null)),
  ];
  const batches = Math.ceil(unique.length / BATCH_SIZE);

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const filter = encodeURIComponent(`doi:${batch.join('|')}`);
    const url =
      `${OPENALEX_WORKS}?filter=${filter}` +
      `&select=id,doi,referenced_works,cited_by_count&per-page=${BATCH_SIZE}${mailtoParam()}`;

    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } });
    if (!res.ok) {
      throw new Error(
        `OpenAlex ${res.status} ${res.statusText} on batch ${i / BATCH_SIZE + 1}/${batches}`,
      );
    }
    const json = (await res.json()) as { results?: OpenAlexWork[] };
    for (const w of json.results ?? []) {
      const key = doiKey(w.doi);
      if (!key) continue;
      works[key] = {
        openalexId: w.id,
        referencedWorks: w.referenced_works ?? [],
        citedByCount: w.cited_by_count ?? null,
      };
    }
    log(
      `batch ${i / BATCH_SIZE + 1}/${batches}: ${json.results?.length ?? 0} works ` +
        `(${Object.keys(works).length} cached so far)`,
    );
    if (i + BATCH_SIZE < unique.length) await sleep(BATCH_DELAY_MS);
  }

  return { generatedAt: now, works };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — guarded so importing this module is side-effect-free
// ---------------------------------------------------------------------------

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  (async () => {
    try {
      const model = buildPapersModel();
      const dois = [
        ...model.references.map((r) => r.doi),
        ...ndjsonDois('catalog.ndjson'),
        ...ndjsonDois('dataset_entries.ndjson'),
        ...ndjsonRelatedDois('catalog.ndjson'),
        ...ndjsonRelatedDois('dataset_entries.ndjson'),
      ];
      const withDoi = dois.filter((d) => d != null).length;
      // eslint-disable-next-line no-console
      console.log(
        `fetch:citations — querying OpenAlex for ${withDoi} DOIs (papers + catalog + dataset entries + related versions) ` +
          `(${process.env.OPENALEX_MAILTO ? 'polite pool' : 'common pool; set OPENALEX_MAILTO for the polite pool'})`,
      );
      const cache = await fetchCitationCache(dois, (m) =>
        // eslint-disable-next-line no-console
        console.log('  ' + m),
      );
      writeFileSync(
        CITATION_CACHE_PATH,
        JSON.stringify(cache, null, 2) + '\n',
        'utf-8',
      );
      // eslint-disable-next-line no-console
      console.log(
        `fetch:citations — wrote citation-cache.json (${Object.keys(cache.works).length} works). ` +
          `Run \`pnpm parse\` to regenerate graph.json.`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        'fetch:citations — FAILED:',
        err instanceof Error ? err.message : String(err),
      );
      process.exitCode = 1;
    }
  })();
}
