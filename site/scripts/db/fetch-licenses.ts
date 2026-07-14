/**
 * fetch-licenses.ts — refresh the committed license-cache.json from the GitHub API.
 *
 * MANUAL / opt-in (`pnpm --dir site db:fetch-licenses`). Like fetch-citations, this is
 * the ONLY networked script for licenses and is kept OUT of the parse/bootstrap path:
 * it looks up each Software.md / Databases.md GitHub repo and records its detected SPDX
 * license into `scripts/parser/license-cache.json`. `seedLicenses` (bootstrap) then folds
 * that committed cache into the DB offline, and a manual `licenses-manual.json` override
 * wins over it — so bootstrap/parse/build stay deterministic and network-free. Re-run this
 * only when the catalog's GitHub entries change, then `db:bootstrap` to apply.
 *
 * Auth: set GITHUB_TOKEN for the authenticated rate limit (5000 req/hr); the catalog has
 * ~65 GitHub repos, exceeding the 60 req/hr unauthenticated limit. A repo GitHub can't
 * classify (NOASSERTION) is omitted (left for a manual `License:` curation), never guessed.
 *
 * The testable core (`fetchLicenseCache`) takes an injectable `fetchFn` and is
 * side-effect-free; the file write happens only under the isMain CLI guard.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCatalogModel } from '../parser/catalog.js';
import { SITE_ROOT } from './lib.js';
import { repoFromUrl } from './seed.js';

const GITHUB_REPOS = 'https://api.github.com/repos';
const REQUEST_DELAY_MS = 200;
const LICENSE_CACHE_PATH = join(SITE_ROOT, 'scripts', 'parser', 'license-cache.json');
/** SPDX ids GitHub returns when it can't determine a real license. */
const UNDETECTED = new Set(['NOASSERTION', 'NONE', '']);

export interface LicenseCache {
  generatedAt: string;
  repos: Record<string, { spdx: string; name: string }>;
}

type FetchFn = (url: string, init?: { headers: Record<string, string> }) => Promise<{
  status: number; ok: boolean; statusText: string;
  headers: { get(name: string): string | null };
  json(): Promise<{ license?: { spdx_id?: string | null; name?: string | null } | null }>;
}>;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CAAIL-licenses',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Query GitHub for each `owner/repo` and assemble a LicenseCache. Repos are
 * de-duplicated; a 404 is skipped; a NOASSERTION (non-standard LICENSE) is omitted —
 * GitHub's own SPDX matcher is the only trusted auto source (a naive text deep-read
 * mislabels NC/CC licenses). Throws on 403 (rate limit) or other non-OK responses.
 */
export async function fetchLicenseCache(
  repos: ReadonlyArray<string | null | undefined>,
  fetchFn: FetchFn = fetch as unknown as FetchFn,
  log: (msg: string) => void = () => {},
  now: string = new Date().toISOString(),
): Promise<LicenseCache> {
  const out: LicenseCache['repos'] = {};
  const unique = [...new Set(repos.filter((r): r is string => !!r))];

  for (let i = 0; i < unique.length; i++) {
    const repo = unique[i];
    // Pass the auth + required User-Agent headers on every request — GitHub rejects a
    // User-Agent-less request with 403, and without the token falls to the 60 req/hr
    // unauthenticated limit that ~65 repos blow through.
    const res = await fetchFn(`${GITHUB_REPOS}/${repo}`, { headers: authHeaders() });
    if (res.status === 404) {
      log(`${repo}: 404 (skipped — renamed or removed)`);
      if (i + 1 < unique.length) await sleep(REQUEST_DELAY_MS);
      continue;
    }
    if (!res.ok) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      throw new Error(
        `GitHub ${res.status} ${res.statusText} on ${repo}` +
          (remaining === '0' ? ' (rate limit — set GITHUB_TOKEN or wait for reset)' : ''),
      );
    }
    const json = await res.json();
    const spdx = json.license?.spdx_id?.trim() ?? '';
    if (UNDETECTED.has(spdx.toUpperCase())) {
      log(`${repo}: no standard SPDX (left for manual curation)`);
    } else {
      out[repo] = { spdx, name: json.license?.name?.trim() || spdx };
      log(`${repo}: ${spdx} (${i + 1}/${unique.length})`);
    }
    if (i + 1 < unique.length) await sleep(REQUEST_DELAY_MS);
  }
  return { generatedAt: now, repos: out };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  (async () => {
    try {
      const model = buildCatalogModel();
      const repos = [...model.software, ...model.databases].map((e) => repoFromUrl(e.url));
      const withRepo = repos.filter((r) => r !== null).length;
      console.log(
        `db:fetch-licenses — querying GitHub for ${withRepo} repos ` +
          `(${process.env.GITHUB_TOKEN ? 'authenticated' : 'UNAUTHENTICATED — set GITHUB_TOKEN; 60 req/hr is too low'})`,
      );
      const cache = await fetchLicenseCache(repos, undefined, (m) => console.log('  ' + m));
      writeFileSync(LICENSE_CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
      console.log(
        `db:fetch-licenses — wrote license-cache.json (${Object.keys(cache.repos).length} licenses). ` +
          `Run \`pnpm --dir site db:bootstrap\` to fold them into the DB.`,
      );
    } catch (err) {
      console.error('db:fetch-licenses — FAILED:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  })();
}
