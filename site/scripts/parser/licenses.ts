/**
 * licenses.ts — reads the committed GitHub-license cache (license-cache.json)
 * and looks a catalog entry's license up by its repo URL, OFFLINE.
 *
 * The network lookup lives ONLY in the manual `pnpm fetch:licenses` script
 * (fetch-licenses.ts); catalog.ts folds this committed cache in at parse time,
 * so `pnpm parse` / `pnpm build` stay deterministic and network-free — the same
 * split as citations.ts / awesome-lists.ts. With no cache (or a repo missing
 * from it) an entry simply has no auto-detected license, and a manual `License:`
 * line (if any) still applies.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Absolute path to the committed license cache (parser input, not generated). */
export const LICENSE_CACHE_PATH: string = fileURLToPath(
  new URL('./license-cache.json', import.meta.url),
);

// ---------------------------------------------------------------------------
// Cache schema (input — committed license-cache.json)
// ---------------------------------------------------------------------------

export const LicenseCacheRepoSchema = z.object({
  /** SPDX id from GitHub, e.g. "MIT", "Apache-2.0", "GPL-3.0" */
  spdx: z.string(),
  /** GitHub's human license name, e.g. "MIT License" */
  name: z.string(),
});

export const LicenseCacheSchema = z.object({
  /** ISO timestamp of the fetch run that produced this cache */
  generatedAt: z.string(),
  /** keyed by lowercase `owner/repo` (see repoFromUrl) */
  repos: z.record(z.string(), LicenseCacheRepoSchema),
});

export type LicenseCacheRepo = z.infer<typeof LicenseCacheRepoSchema>;
export type LicenseCache = z.infer<typeof LicenseCacheSchema>;

/**
 * Read + validate the license cache if present, else null so entries are built
 * with no auto-detected licenses. Keeps the parse step network-free.
 */
export function loadLicenseCache(
  path: string = LICENSE_CACHE_PATH,
): LicenseCache | null {
  if (!existsSync(path)) return null;
  return LicenseCacheSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

// ---------------------------------------------------------------------------
// URL → owner/repo key (mirrors awesome-lists.repoFromUrl — kept local so the
// catalog parser has no cross-dependency on the AwesomeLists parser)
// ---------------------------------------------------------------------------

const GITHUB_REPO_RE = /github\.com\/([^/]+)\/([^/#?]+)/i;

/**
 * Parse a GitHub repo URL into a lowercase `owner/repo` key (the cache key), or
 * null when the URL isn't a GitHub repo. A trailing `.git` is stripped.
 */
export function repoFromUrl(url: string): string | null {
  const m = GITHUB_REPO_RE.exec(url);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  return `${owner}/${repo}`.toLowerCase();
}

/**
 * Auto-detected SPDX license for an entry URL, from the cache. Returns null for
 * non-GitHub URLs, an absent cache, or a repo the cache doesn't cover.
 */
export function licenseForUrl(
  url: string,
  cache: LicenseCache | null,
): string | null {
  if (!cache) return null;
  const repo = repoFromUrl(url);
  if (!repo) return null;
  return cache.repos[repo]?.spdx ?? null;
}
