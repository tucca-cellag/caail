import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLACK_INVITE_URL, COMMUNITY_PATH } from './community.ts';

// src/lib -> src -> site -> repo root (same idiom as caail-pages.test.ts).
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE_ROOT = join(REPO_ROOT, 'site');

/**
 * Every file under `dir`, recursively, skipping build output and deps.
 *
 * `coverage` is skipped explicitly: instrumented output embeds source text, so
 * a `vitest run --coverage` would otherwise copy the invite out of community.ts
 * and fail this guard against its own artifact. Dot-directories (.astro,
 * .vitest, …) are covered by the leading-dot filter below.
 */
function walk(dir: string, acc: string[] = []): string[] {
  const SKIP = new Set(['node_modules', 'dist', 'coverage', '.astro', '.git', 'public']);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe('the community Slack invite is confined to two places', () => {
  it('matches the invite published in canonical Community.md', () => {
    const md = readFileSync(join(REPO_ROOT, 'Community.md'), 'utf-8');
    expect(md).toContain(SLACK_INVITE_URL);
  });

  it('appears nowhere under site/ except this module and its test', () => {
    // The invite is deliberately NOT inlined into components: every in-site
    // surface links to COMMUNITY_PATH instead, so rotating it touches two
    // files. A stray paste into a component is what this catches.
    const offenders = walk(SITE_ROOT)
      .filter((f) => /\.(ts|tsx|js|mjs|astro|md|mdx|json|css)$/.test(f))
      .filter((f) => !f.endsWith(join('src', 'lib', 'community.ts')))
      .filter((f) => !f.endsWith(join('src', 'lib', 'community.test.ts')))
      .filter((f) => {
        // A broken symlink or an unreadable file with a text extension would
        // otherwise crash the suite rather than fail an assertion.
        try {
          return readFileSync(f, 'utf-8').includes('join.slack.com');
        } catch {
          return false;
        }
      })
      .map((f) => f.slice(SITE_ROOT.length + 1));

    expect(offenders).toEqual([]);
  });

  it('exposes a base-relative community path, not a baked-in /caail prefix', () => {
    expect(COMMUNITY_PATH).toBe('/community/');
    expect(COMMUNITY_PATH.startsWith('/caail')).toBe(false);
  });
});
