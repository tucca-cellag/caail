/**
 * site-config.test.ts — the deployed origin and base are written in exactly one
 * place (site-config.ts), and that place is what Astro deploys with.
 *
 * The sweep is the check, not the docstring: a hand-typed copy of the origin
 * or the `/caail` base anywhere in site code fails here, because the last
 * attempt to derive "every remaining copy" missed four of them by searching
 * from memory rather than from the tree.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_BASE, SITE_ORIGIN, SITE_URL } from './site-config';

const SITE_DIR = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Files allowed to spell the origin or base out, each for a reason a derived
 * value cannot serve.
 */
const ALLOWED: Record<string, string> = {
  'src/content/site-config.ts': 'the one definition',
  'scripts/favicons.mjs': 'a one-off generator run with plain `node`, which cannot import TypeScript; its output is a committed asset',
  'src/components/SiteTitle.astro': 'links to the TUCCA org hub at the origin root, a different site that would not move with CAAIL',
  'src/content/docs/privacy.mdx': 'reader-facing disclosure prose naming where the site is published',
};

describe('site-config', () => {
  it('composes SITE_URL from the origin and base', () => {
    expect(SITE_URL).toBe(`${SITE_ORIGIN}${SITE_BASE}/`);
  });

  it('is what astro.config.mjs deploys with', () => {
    const cfg = readFileSync(join(SITE_DIR, 'astro.config.mjs'), 'utf-8');
    expect(cfg).toMatch(/from '\.\/src\/content\/site-config\.ts'/);
    expect(cfg).toMatch(/\bsite:\s*SITE_ORIGIN\b/);
    expect(cfg).toMatch(/\bbase:\s*SITE_BASE\b/);
  });

  it('is the only place site code spells out the origin or the base', () => {
    // Code only: comments may mention the base to explain it. A quoted literal
    // ('/caail', "/caail/", `/caail…`) or the origin anywhere is a copy.
    const tracked = execFileSync('git', ['ls-files', 'src', 'scripts', 'astro.config.mjs'], {
      cwd: SITE_DIR,
      encoding: 'utf-8',
    })
      .split('\n')
      .filter((f) => /\.(ts|tsx|mjs|astro|mdx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !(f in ALLOWED));
    // An empty file list would pass vacuously; the tree has well over a hundred.
    expect(tracked.length).toBeGreaterThan(100);
    const originRe = new RegExp(SITE_ORIGIN.replace(/[.]/g, '\\.'));
    const baseRe = new RegExp(`['"\`]${SITE_BASE}[/'"\`]`);
    const offenders: string[] = [];
    for (const f of tracked) {
      readFileSync(join(SITE_DIR, f), 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          // A `//` comment starts the line or follows whitespace; the `//` in
          // `https://` follows a colon and must survive, or no origin is ever seen.
          const code = line.replace(/(^|\s)\/\/.*$/, '').trim();
          if (code.startsWith('*') || code.startsWith('/*')) return;
          if (originRe.test(code) || baseRe.test(code)) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
