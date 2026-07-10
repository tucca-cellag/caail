/**
 * fetch-licenses.ts — refreshes license-cache.json from the GitHub API.
 *
 * MANUAL / opt-in (`pnpm fetch:licenses`). Like fetch-citations.ts and
 * fetch-awesome-metrics.ts, this is the ONLY networked script for catalog
 * licenses and is kept OUT of the parse path: it looks up each Software.md /
 * Databases.md GitHub repo and records its detected SPDX license. catalog.ts
 * then folds that committed cache in at parse time (offline), so `pnpm parse` /
 * `pnpm build` stay deterministic and network-free. Re-run this only when the
 * catalog's GitHub entries change.
 *
 * Auth: set GITHUB_TOKEN for the authenticated rate limit (5000 req/hr). The
 * catalog has ~100+ GitHub repos, which EXCEEDS the 60 req/hr unauthenticated
 * limit — so a token is effectively required for a full run.
 *
 * A repo that 404s (renamed/removed) is logged and left out of the cache rather
 * than failing the run. A repo GitHub can't classify (no LICENSE file, or
 * `NOASSERTION`) is treated as "not detected" and omitted, so a curator can
 * supply a manual `License:` line. An HTTP 403 rate-limit response stops the run
 * loudly.
 *
 * The testable core (fetchLicenseCache) is importable and side-effect-free; the
 * file write + repo gathering happen only under the isMain CLI guard.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { buildCatalogModel } from './catalog.js';
import { repoFromUrl, LICENSE_CACHE_PATH, type LicenseCache } from './licenses.js';

/** GitHub REST repo endpoint base (the `/license` sub-resource returns the
 *  detected SPDX id AND the LICENSE file content for a deep-read fallback). */
const GITHUB_REPOS = 'https://api.github.com/repos';
/** Polite delay between requests (ms). */
const REQUEST_DELAY_MS = 200;

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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type GitHubLicense = {
  license?: { spdx_id?: string | null; name?: string | null } | null;
};

/** SPDX ids GitHub returns when it can't determine a real license. */
const UNDETECTED = new Set(['NOASSERTION', 'NONE', '']);

/**
 * Query the GitHub API for each `owner/repo` and assemble a LicenseCache. Repos
 * are de-duplicated; a 404 (no LICENSE file) is skipped, and a repo whose
 * license GitHub cannot classify (NOASSERTION) is omitted.
 *
 * The auto cache records ONLY GitHub's own authoritative SPDX match (its
 * `licensee` matcher). A NOASSERTION result means the LICENSE is non-standard —
 * exactly the case where a naive text deep-read is UNRELIABLE (it mislabels
 * BSD-header non-commercial licenses as BSD, CC-BY-NC as CC0, etc.), so those
 * are deliberately left for the curated scan (`scan:licenses`) + human review,
 * which renders them as dashed "verify before commercial use" tags rather than
 * trusted auto tags. Throws on a 403 (rate limit) or other non-OK response.
 *
 * @param repos  `owner/repo` keys (as produced by repoFromUrl)
 * @param log    optional progress sink (defaults to no-op)
 * @param now    ISO timestamp for `generatedAt` (injectable for determinism)
 */
export async function fetchLicenseCache(
  repos: ReadonlyArray<string | null | undefined>,
  log: (msg: string) => void = () => {},
  now: string = new Date().toISOString(),
): Promise<LicenseCache> {
  const out: LicenseCache['repos'] = {};
  const unique = [...new Set(repos.filter((r): r is string => !!r))];

  for (let i = 0; i < unique.length; i++) {
    const repo = unique[i];
    const res = await fetch(`${GITHUB_REPOS}/${repo}`, { headers: authHeaders() });

    if (res.status === 404) {
      log(`${repo}: 404 (skipped — renamed or removed)`);
      if (i + 1 < unique.length) await sleep(REQUEST_DELAY_MS);
      continue;
    }
    if (!res.ok) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      throw new Error(
        `GitHub ${res.status} ${res.statusText} on ${repo}` +
          (remaining === '0'
            ? ' (rate limit exhausted — set GITHUB_TOKEN or wait for reset)'
            : ''),
      );
    }

    const json = (await res.json()) as GitHubLicense;
    const spdx = json.license?.spdx_id?.trim() ?? '';
    if (UNDETECTED.has(spdx.toUpperCase())) {
      log(`${repo}: no standard SPDX (left for curated scan)`);
    } else {
      out[repo] = { spdx, name: json.license?.name?.trim() || spdx };
      log(`${repo}: ${spdx} (${i + 1}/${unique.length})`);
    }
    if (i + 1 < unique.length) await sleep(REQUEST_DELAY_MS);
  }

  return { generatedAt: now, repos: out };
}

// ---------------------------------------------------------------------------
// CLI entrypoint — guarded so importing this module is side-effect-free
// ---------------------------------------------------------------------------

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  (async () => {
    try {
      // Build the catalog with NO cache to enumerate the GitHub repo set.
      const model = buildCatalogModel(undefined, undefined, null);
      const repos = [...model.software, ...model.databases].map((e) =>
        repoFromUrl(e.url),
      );
      const withRepo = repos.filter((r) => r !== null).length;
      // eslint-disable-next-line no-console
      console.log(
        `fetch:licenses — querying GitHub for ${withRepo} repos ` +
          `(${process.env.GITHUB_TOKEN ? 'authenticated' : 'UNAUTHENTICATED — set GITHUB_TOKEN; 60 req/hr is too low for the full catalog'})`,
      );
      const cache = await fetchLicenseCache(repos, (m) =>
        // eslint-disable-next-line no-console
        console.log('  ' + m),
      );
      writeFileSync(
        LICENSE_CACHE_PATH,
        JSON.stringify(cache, null, 2) + '\n',
        'utf-8',
      );
      // eslint-disable-next-line no-console
      console.log(
        `fetch:licenses — wrote license-cache.json (${Object.keys(cache.repos).length} licenses). ` +
          `Run \`pnpm parse\` to fold them into catalog.json.`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        'fetch:licenses — FAILED:',
        err instanceof Error ? err.message : String(err),
      );
      process.exitCode = 1;
    }
  })();
}
