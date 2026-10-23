/**
 * llms-full.test.ts — the public/llms-full.txt full-text agent index.
 *
 * Verifies the source list (CLAUDE.md excluded, README first) and that the
 * concatenated text is non-trivial and carries a per-file delimiter for the
 * key canonical sources.
 *
 * The coverage block checks the list against the REPO rather than against
 * itself. The older delimiter test iterated `llmsFullSources()`, so a file
 * missing from the list was also missing from the expectations, and
 * `Taxonomy.md` and `AIAgentsFoundationModels.md` were left out of the served
 * text for months with every test green.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { CAAIL_PAGES } from '../../src/content/caail-pages.js';
import { CANONICAL_SOURCES } from '../../src/content/canonical-sources.js';
import { isPrivateCompanion } from '../../src/lib/canonical-files.js';
import { buildLlmsFullText, llmsFullSources } from './llms-full.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE_DOCS = 'site/src/content/docs';

/** The site page renders a canonical file that is already in the full text. */
const SHELL = 'a site shell around a canonical file the full text already carries';
/** The site page is a view computed from data the full text already carries. */
const DERIVED = 'a generated view over data the full text already carries';
/** Loaded by an agent as instructions; the library is what it reads. */
const SKILL = 'a Claude Code skill, loaded as instructions rather than read as library content';

/**
 * Published files deliberately kept out of llms-full.txt, each with its reason.
 * A key ending in `/` covers everything under that directory.
 *
 * Every Markdown file git would publish must be in `llmsFullSources()` or
 * covered here, so a new page, or a new directory of them, fails until someone
 * decides. `site/` is deliberately not a key: a prefix that broad would let a
 * new prose page under the site's docs default to absent, which is the failure
 * this list exists to stop. The same goes for every directory key, so keep
 * each one as narrow as the files it describes.
 *
 * "Fails" means any run of this suite. CI runs it only on the paths in
 * `test.yml`'s filter, so a PR adding Markdown outside them (a new top-level
 * directory, say) merges without it and the next PR that does run it goes red.
 */
const LEFT_OUT: Record<string, string> = {
  'CODE_OF_CONDUCT.md': 'conduct rules for contributors, not library content',
  'DESIGN.md': "the website's design system",
  'GLOSSARY.md':
    "the maintainers' vocabulary for working on the repository; the definitions a reader of the library needs are in Taxonomy.md",
  '.claude/': 'rules, skills and reviewer agents for maintaining the repository',
  'plugin/': SKILL,
  'plugin-contribute/': SKILL,
  'skills/': SKILL,
  'site/README.md': "the website's developer guide",
  'site/HANDOFF-M2.md': 'a handoff note from building the website',
  'site/public/setup.md': 'a generated copy of skills/caail-install/SKILL.md, served at its own URL',
  'site/scripts/parser/fixtures/': 'parser test fixtures',
  'site/scripts/parser/taxonomy.fixture.md': 'a parser test fixture',
  'site/scripts/parser/taxonomy.collision.fixture.md': 'a parser test fixture',
  'site/scripts/parser/taxonomy.unknown-axis.fixture.md': 'a parser test fixture',
  'site/src/assets/tucca/README.md': "notes on the website's TUCCA logo files",
  [`${SITE_DOCS}/about.mdx`]:
    "a guide to the website's navigation; README.md, which the full text carries, describes the library itself",
  [`${SITE_DOCS}/privacy.mdx`]: "the website's data practices, not library content",
  [`${SITE_DOCS}/index.mdx`]: 'the homepage, assembled from components',
  [`${SITE_DOCS}/cite.mdx`]: 'README.md, which the full text carries, gives the same citation',
  [`${SITE_DOCS}/report.mdx`]: 'a form for reporting a wrong entry',
  [`${SITE_DOCS}/awesome-lists.mdx`]: SHELL,
  [`${SITE_DOCS}/databases.mdx`]: SHELL,
  [`${SITE_DOCS}/field-reports.mdx`]: SHELL,
  [`${SITE_DOCS}/software.mdx`]: SHELL,
  [`${SITE_DOCS}/talks.mdx`]: SHELL,
  [`${SITE_DOCS}/papers/explorer.mdx`]: SHELL,
  [`${SITE_DOCS}/papers/reviews.mdx`]: SHELL,
  [`${SITE_DOCS}/primers/ai.mdx`]: SHELL,
  [`${SITE_DOCS}/primers/cell-ag.mdx`]: SHELL,
  [`${SITE_DOCS}/papers/network.mdx`]: DERIVED,
  [`${SITE_DOCS}/by-the-numbers.mdx`]: DERIVED,
  [`${SITE_DOCS}/citations.mdx`]: DERIVED,
  [`${SITE_DOCS}/licenses.mdx`]: DERIVED,
  [`${SITE_DOCS}/topics.mdx`]: DERIVED,
};

/** True when the LEFT_OUT key `key` covers the repo-relative `file`. */
function covers(key: string, file: string): boolean {
  return key.endsWith('/') ? file.startsWith(key) : file === key;
}

/**
 * Markdown by extension, in any case. Deliberately wider than
 * `isPublishedMarkdown`, which is case-sensitive to match the loader: GitHub
 * still renders a `FAQ.MD` or a `.markdown` file, so the walk has to see one
 * and fail on it rather than let it default to absent.
 */
const MARKDOWN_PATHSPECS = [':(icase)*.md', ':(icase)*.mdx', ':(icase)*.markdown'];

/**
 * Not an agent-instruction file and not a private companion.
 *
 * The instruction-file test is the exact `CLAUDE.md` that `isPublishedMarkdown`
 * drops, so the walk and `llmsFullSources()` agree on what counts as a page. A
 * differently cased `Claude.md` is a page to both, and would be inlined into the
 * served text; the "excludes CLAUDE.md" test below is what refuses it, by
 * matching in any case.
 */
function isPublishable(file: string): boolean {
  const name = file.split('/').pop() ?? file;
  return name !== 'CLAUDE.md' && !isPrivateCompanion(name);
}

let publishedCache: string[] | undefined;

/**
 * Every Markdown file git would publish: tracked, or untracked and not
 * ignored, and still on disk. Asking git rather than walking the disk keeps a
 * gitignored scratch file at the root (an audit report, say) from failing this
 * locally while CI, which never sees it, stays green. The disk check drops a
 * file deleted with `rm` but not yet `git rm`, which git still lists and
 * `llmsFullSources()` no longer reads. Lazy, so a missing work tree fails the
 * tests that need it rather than the collection of this file.
 */
function publishedMarkdown(): string[] {
  if (!publishedCache) {
    let listing: string;
    try {
      listing = execFileSync(
        'git',
        ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...MARKDOWN_PATHSPECS],
        { cwd: REPO_ROOT, encoding: 'utf-8' },
      );
    } catch (err) {
      throw new Error(
        `llms-full coverage asks git which files are published and needs a git work tree at ${REPO_ROOT}: ${String(err)}`,
      );
    }
    publishedCache = listing
      .split('\0')
      .filter((f) => f && isPublishable(f) && existsSync(join(REPO_ROOT, f)))
      .sort();
  }
  return publishedCache;
}

describe('llmsFullSources coverage, checked against the repo', () => {
  const sources = new Set(llmsFullSources());

  it('carries every Markdown file git would publish, or says why not', () => {
    const undecided = publishedMarkdown().filter(
      (f) => !sources.has(f) && !Object.keys(LEFT_OUT).some((k) => covers(k, f)),
    );
    expect(undecided).toEqual([]);
  });

  it('carries every page the site renders from a canonical file, with no exception', () => {
    // README.md is the converse case: in the full text, but rendered by no loader.
    expect(CAAIL_PAGES.missingTopLevelSources([...sources])).toEqual([]);
    const inLoaderDirs = publishedMarkdown().filter((f) =>
      CANONICAL_SOURCES.dirs.some((d) => f.startsWith(`${d}/`) && !f.slice(d.length + 1).includes('/')),
    );
    expect(inLoaderDirs.filter((f) => !sources.has(f))).toEqual([]);
  });

  it('keeps every exclusion current: it matches a published file, and none it matches is carried', () => {
    const files = publishedMarkdown();
    const stale = Object.keys(LEFT_OUT).filter((k) => {
      const matched = files.filter((f) => covers(k, f));
      return matched.length === 0 || matched.some((f) => sources.has(f));
    });
    expect(stale).toEqual([]);
  });
});

describe('llmsFullSources', () => {
  const sources = llmsFullSources();

  it('includes the core canonical files', () => {
    for (const f of ['README.md', 'Papers.md', 'Software.md', 'Databases.md', 'CONTRIBUTING.md']) {
      expect(sources).toContain(f);
    }
  });

  it('includes per-species dataset and research-area pages', () => {
    expect(sources).toContain('Datasets/Cow.md');
    expect(sources).toContain('ResearchAreas/Bioprocess.md');
  });

  it('excludes CLAUDE.md agent-instruction files, in any case', () => {
    // Case-insensitive on purpose: `isPublishedMarkdown` drops only the exact
    // name, so a `Claude.md` beside the pages would otherwise be served.
    expect(sources.filter((s) => /(^|\/)claude\.md$/i.test(s))).toEqual([]);
  });

  it('orders each directory with README first', () => {
    const datasets = sources.filter((s) => s.startsWith('Datasets/'));
    expect(datasets[0]).toBe('Datasets/README.md');
  });
});

describe('buildLlmsFullText', () => {
  const text = buildLlmsFullText();

  it('is substantial (full library, not a stub)', () => {
    expect(text.length).toBeGreaterThan(50_000);
  });

  it('starts with the agent-facing header', () => {
    expect(text.startsWith('# CAAIL — Cellular Agriculture AI Library (full canonical text)')).toBe(
      true,
    );
  });

  it('carries a per-file delimiter for each source', () => {
    for (const rel of llmsFullSources()) {
      expect(text).toContain(`# ===== ${rel} =====`);
    }
  });

  it('contains real canonical content (Papers references section)', () => {
    expect(text).toContain('## References');
  });
});
