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
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { CANONICAL_SOURCES } from '../../src/content/canonical-sources.js';
import { isPrivateCompanion, isPublishedMarkdown } from '../../src/lib/canonical-files.js';
import { buildLlmsFullText, llmsFullSources } from './llms-full.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE_DOCS = 'site/src/content/docs';

/** The site page renders a canonical file that is already in the full text. */
const SHELL = 'a site shell around a canonical file the full text already carries';
/** The site page is a view computed from data the full text already carries. */
const DERIVED = 'a generated view over data the full text already carries';

/**
 * Published files deliberately kept out of llms-full.txt, each with its reason.
 *
 * Anything the walks below find that is neither here nor in `llmsFullSources()`
 * fails, so a new page needs a decision rather than defaulting to absent.
 */
const LEFT_OUT: Record<string, string> = {
  'CODE_OF_CONDUCT.md': 'conduct rules for contributors, not library content',
  'DESIGN.md': "the website's design system",
  'GLOSSARY.md':
    "the maintainers' vocabulary for working on the repository; the definitions a reader of the library needs are in Taxonomy.md",
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

/** Published Markdown at the repo root, by the same rule every enumerator uses. */
function rootMarkdown(): string[] {
  return readdirSync(REPO_ROOT).filter(isPublishedMarkdown).sort();
}

/** Every Starlight page under the site's docs directory, repo-relative. */
function sitePages(): string[] {
  return readdirSync(`${REPO_ROOT}${SITE_DOCS}`, { recursive: true, encoding: 'utf-8' })
    .filter((f) => /\.mdx?$/.test(f) && !isPrivateCompanion(f))
    .map((f) => `${SITE_DOCS}/${f}`)
    .sort();
}

/** Files the docs loader turns into site routes, repo-relative. */
function renderedCanonicalFiles(): string[] {
  return [
    ...CANONICAL_SOURCES.files,
    ...CANONICAL_SOURCES.dirs.flatMap((dir) =>
      readdirSync(`${REPO_ROOT}${dir}`)
        .filter(isPublishedMarkdown)
        .map((f) => `${dir}/${f}`),
    ),
  ];
}

describe('llmsFullSources coverage, checked against the repo', () => {
  const sources = new Set(llmsFullSources());
  const undecided = (files: string[]) => files.filter((f) => !sources.has(f) && !(f in LEFT_OUT));

  it('carries every published Markdown file at the repo root, or says why not', () => {
    expect(undecided(rootMarkdown())).toEqual([]);
  });

  it('carries every site page, or says why not', () => {
    expect(undecided(sitePages())).toEqual([]);
  });

  it('carries every canonical file the site renders as a page, with no exception', () => {
    // README.md is the converse case: in the full text, but rendered by no loader.
    expect(renderedCanonicalFiles().filter((f) => !sources.has(f))).toEqual([]);
  });

  it('keeps every exclusion current: the file exists and is not also carried', () => {
    const onDisk = new Set([...rootMarkdown(), ...sitePages()]);
    const stale = Object.keys(LEFT_OUT).filter((f) => !onDisk.has(f) || sources.has(f));
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

  it('excludes CLAUDE.md agent-instruction files', () => {
    expect(sources.some((s) => s.endsWith('CLAUDE.md'))).toBe(false);
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
