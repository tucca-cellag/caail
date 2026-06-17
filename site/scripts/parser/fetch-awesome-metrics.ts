/**
 * fetch-awesome-metrics.ts — refreshes awesome-cache.json from the GitHub API.
 *
 * MANUAL / opt-in (`pnpm fetch:awesome-lists`). Like fetch-citations.ts, this is
 * a networked script kept OUT of the parse path: it looks up each AwesomeLists.md
 * GitHub repo and records its star count, last-push timestamp, and archived flag.
 * awesome-lists.ts then folds that committed cache in at parse time (offline), so
 * `pnpm parse` / `pnpm build` stay deterministic and network-free. Re-run this
 * only when the awesome-list set changes.
 *
 * Auth: set GITHUB_TOKEN to use the authenticated rate limit (5000 req/hr) and a
 * polite User-Agent; without it the unauthenticated limit (60 req/hr) is ample
 * for the ~20-repo corpus. A repo that 404s (renamed/removed) is logged and left
 * out of the cache rather than failing the run; an HTTP 403 rate-limit response
 * stops the run loudly.
 *
 * The testable core (fetchAwesomeCache) is importable and side-effect-free; the
 * file write + repo gathering happen only under the isMain CLI guard.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  AWESOME_CACHE_PATH,
  buildAwesomeListsModel,
  type AwesomeCache,
} from './awesome-lists.js';

/** GitHub REST repo endpoint base. */
const GITHUB_REPOS = 'https://api.github.com/repos';
/** Polite delay between requests (ms). */
const REQUEST_DELAY_MS = 200;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CAAIL-awesome-lists',
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type GitHubRepo = {
  stargazers_count?: number;
  pushed_at?: string;
  archived?: boolean;
};

/**
 * Query the GitHub API for each `owner/repo` and assemble an AwesomeCache. Repos
 * are de-duplicated; a 404 is skipped (logged) so a renamed repo doesn't fail the
 * whole run. Throws on a 403 (rate limit) or other non-OK, non-404 response.
 *
 * @param repos  `owner/repo` keys (as produced by repoFromUrl)
 * @param log    optional progress sink (defaults to no-op)
 * @param now    ISO timestamp for `generatedAt` (injectable for determinism)
 */
export async function fetchAwesomeCache(
  repos: ReadonlyArray<string | null | undefined>,
  log: (msg: string) => void = () => {},
  now: string = new Date().toISOString(),
): Promise<AwesomeCache> {
  const out: AwesomeCache['repos'] = {};
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

    const json = (await res.json()) as GitHubRepo;
    out[repo] = {
      stars: json.stargazers_count ?? 0,
      pushedAt: json.pushed_at ?? '',
      archived: json.archived ?? false,
    };
    log(`${repo}: ${out[repo].stars}★ (${i + 1}/${unique.length})`);
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
      // Build the model with NO cache to enumerate the repo set from the markdown.
      const model = buildAwesomeListsModel(undefined, null);
      const repos = model.groups.flatMap((g) => g.items.map((it) => it.repo));
      const withRepo = repos.filter((r) => r !== null).length;
      // eslint-disable-next-line no-console
      console.log(
        `fetch:awesome-lists — querying GitHub for ${withRepo} repos ` +
          `(${process.env.GITHUB_TOKEN ? 'authenticated' : 'unauthenticated; set GITHUB_TOKEN for a higher rate limit'})`,
      );
      const cache = await fetchAwesomeCache(repos, (m) =>
        // eslint-disable-next-line no-console
        console.log('  ' + m),
      );
      writeFileSync(
        AWESOME_CACHE_PATH,
        JSON.stringify(cache, null, 2) + '\n',
        'utf-8',
      );
      // eslint-disable-next-line no-console
      console.log(
        `fetch:awesome-lists — wrote awesome-cache.json (${Object.keys(cache.repos).length} repos). ` +
          `Run \`pnpm parse\` to regenerate awesome-lists.json.`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        'fetch:awesome-lists — FAILED:',
        err instanceof Error ? err.message : String(err),
      );
      process.exitCode = 1;
    }
  })();
}
