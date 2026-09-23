/**
 * site-config.test.ts — the deployed origin and base are written in exactly one
 * place (site-config.ts), and that place is what Astro deploys with.
 *
 * The sweep is the check, not the docstring: a hand-typed copy of the origin
 * or the `/caail` base anywhere in site code fails here, because the last
 * attempt to derive "every remaining copy" missed four of them by searching
 * from memory rather than from the tree.
 *
 * Files that cannot import site-config.ts (static assets, a TOML config, a
 * plain-node script) are pinned instead: each must contain the value derived
 * from it, so changing site-config.ts fails here and names every file to edit.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_BASE, SITE_ORIGIN, SITE_URL } from './site-config';

const SITE_DIR = fileURLToPath(new URL('../../', import.meta.url));
const REPO_DIR = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Files allowed to spell the origin or base out in code, each for a reason a
 * derived value cannot serve.
 */
const ALLOWED: Record<string, string> = {
  'src/content/site-config.ts': 'the one definition',
  'scripts/favicons.mjs': 'a one-off generator run with plain `node`, which cannot import TypeScript (pinned below)',
  'src/components/SiteTitle.astro': 'links to the TUCCA org hub at the origin root, a different site that would not move with CAAIL',
  'src/content/docs/privacy.mdx': 'reader-facing disclosure prose naming where the site is published',
};

/** Static copies, repo-relative, each with the derived value it must contain. */
const PINNED: Array<[file: string, mustContain: string]> = [
  ['site/public/robots.txt', SITE_URL],
  ['site/public/llms.txt', SITE_URL],
  ['site/public/site.webmanifest', `"start_url": "${SITE_BASE}/"`],
  ['site/lighthouserc.json', `${SITE_BASE}/`],
  ['site/scripts/favicons.mjs', `start_url: '${SITE_BASE}/'`],
  ['workers/events/wrangler.toml', `ALLOWED_ORIGIN = "${SITE_ORIGIN}"`],
];

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
    // Tracked AND untracked-but-not-ignored, so a new file is checked before it
    // is committed.
    const files = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', 'src', 'scripts', 'astro.config.mjs', 'playwright.config.ts'],
      { cwd: SITE_DIR, encoding: 'utf-8' },
    )
      .split('\n')
      // .mdx is prose, where `*` starts a list item rather than a comment; it has
      // its own check below.
      .filter((f) => /\.(ts|tsx|mjs|js|astro|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && !(f in ALLOWED));
    // An empty file list would pass vacuously; the tree has well over a hundred.
    expect(files.length).toBeGreaterThan(100);
    const originRe = new RegExp(SITE_ORIGIN.replace(/[.]/g, '\\.'));
    // The base as the FIRST path segment of a URL, wherever the URL starts: after a
    // quote, after an interpolation (`localhost:${PORT}/caail/`), or after a host
    // ('https://host/caail'). A later segment that happens to be spelled the same
    // (the repo name tucca-cellag/caail, the Slack workspace /t/caail) is not a copy
    // of the base; repo coordinates are CAAIL-405.
    const baseRe = new RegExp(
      `(?:['"\`}]|(?:localhost|[\\w-]+\\.[a-z]{2,})(?::\\d+)?)${SITE_BASE}(?=[/'"\`)\\s]|$)`,
    );
    const offenders: string[] = [];
    for (const f of files) {
      readFileSync(join(SITE_DIR, f), 'utf-8')
        .split('\n')
        .forEach((line, i) => {
          // Only whole comment lines are skipped: they may explain the base.
          // Trailing comments are scanned with the code, which errs toward
          // reporting rather than toward missing a copy.
          const t = line.trim();
          if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
          if (originRe.test(line) || baseRe.test(line)) offenders.push(`${f}:${i + 1}: ${t}`);
        });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('is the base every MDX page links under', () => {
    // Markdown links in MDX are not base-rewritten, so each spells the base out.
    // They cannot import it; instead every root-relative link must start with the
    // current base, so changing site-config.ts fails here and names each page.
    const pages = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', 'src/content/docs'],
      { cwd: SITE_DIR, encoding: 'utf-8' },
    )
      .split('\n')
      .filter((f) => f.endsWith('.mdx'));
    expect(pages.length).toBeGreaterThan(5);
    const originRe = new RegExp(SITE_ORIGIN.replace(/[.]/g, '\\.'));
    const bad: string[] = [];
    let seen = 0;
    for (const f of pages) {
      const text = readFileSync(join(SITE_DIR, f), 'utf-8');
      for (const m of text.matchAll(/\]\((\/[^)\s]*)|href="(\/[^"]*)"/g)) {
        const target = m[1] ?? m[2];
        if (target.startsWith('//')) continue; // protocol-relative, not site-relative
        seen++;
        if (!target.startsWith(`${SITE_BASE}/`)) bad.push(`${f}: ${target}`);
      }
      if (!(f in ALLOWED) && originRe.test(text)) bad.push(`${f}: spells out ${SITE_ORIGIN}`);
    }
    expect(seen).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('matches every static copy that cannot import it', () => {
    const stale = PINNED.filter(([file, want]) => !readFileSync(join(REPO_DIR, file), 'utf-8').includes(want));
    expect(stale.map(([f, want]) => `${f} should contain ${want}`)).toEqual([]);
  });
});
