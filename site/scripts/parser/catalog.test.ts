/**
 * catalog.test.ts — tests for the Software.md / Databases.md catalog parser.
 *
 * Two suites:
 *   A. Unit (fixtures): group tracking, link extraction, Summary:-strip, full
 *      multi-paragraph body capture, summaryHtml hyperlink preservation +
 *      repo-relative link rewriting, and slug disambiguation.
 *   B. Integration (real corpus): the verified ground-truth entry counts and
 *      structural invariants (every entry has a URL + non-empty group; no
 *      un-rewritten relative links survive in summaryHtml).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCatalogFile, buildCatalogModel } from './catalog.js';
import { CatalogSchema, type CatalogEntry } from './types.js';
import type { LicenseCache } from './licenses.js';

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');
const SOFTWARE_FIXTURE = join(FIXTURE_DIR, 'software.fixture.md');
const DATABASES_FIXTURE = join(FIXTURE_DIR, 'databases.fixture.md');
const LICENSE_FIXTURE = join(FIXTURE_DIR, 'catalog-license.fixture.md');

// ---------------------------------------------------------------------------
// A. Unit — fixtures
// ---------------------------------------------------------------------------

describe('parseCatalogFile — Software.md shape (fixture)', () => {
  let entries: CatalogEntry[];
  beforeAll(() => {
    entries = parseCatalogFile(SOFTWARE_FIXTURE);
  });

  it('emits one entry per H3, in document order', () => {
    expect(entries.map((e) => e.name)).toEqual(['BioMeta', 'GrowthOpt', 'BioMeta']);
  });

  it('assigns each entry to its enclosing H2 group', () => {
    expect(entries.map((e) => e.group)).toEqual([
      'Media Optimization',
      'Media Optimization',
      'Bioprocess Modeling',
    ]);
  });

  it('captures the H3 link target as url', () => {
    expect(entries[0].url).toBe('https://github.com/x/biometa');
    expect(entries[2].url).toBe('https://gitlab.com/y/biometa');
  });

  it('strips the leading "Summary:" label from the plain-text summary', () => {
    expect(entries[0].summary.startsWith('A tool for media optimization')).toBe(true);
    expect(entries[0].summary).not.toMatch(/^Summary:/i);
  });

  it('captures the FULL body (later paragraphs like Docs:) in summary', () => {
    // Regression guard: the old parser kept only the first paragraph, dropping
    // every secondary link. The full body — including the Docs: line — is kept.
    expect(entries[0].summary).toContain('Docs: https://biometa.example/docs');
  });

  it('preserves inline hyperlinks as <a> in summaryHtml', () => {
    expect(entries[0].summaryHtml).toContain(
      '<a href="https://doi.org/10.1000/x">Smith et al. 2020</a>',
    );
    // The autolinked Docs URL (from the second paragraph) is a real link too.
    expect(entries[0].summaryHtml).toContain('href="https://biometa.example/docs"');
    // Multi-paragraph body renders as multiple <p> blocks.
    expect((entries[0].summaryHtml.match(/<p>/g) ?? []).length).toBe(2);
  });

  it('rewrites repo-relative .md links the way the prose pages do', () => {
    // Papers.md is not a rendered page → GitHub blob (anchor preserved).
    expect(entries[0].summaryHtml).toContain(
      'href="https://github.com/tucca-cellag/caail/blob/main/Papers.md#5"',
    );
    // Datasets/Cow.md IS a rendered page → site route (cross-file anchor dropped).
    expect(entries[0].summaryHtml).toContain('href="/caail/datasets/cow/"');
  });

  it('disambiguates a repeated name with -b while keeping the first bare', () => {
    expect(entries[0].slug).toBe('biometa');
    expect(entries[2].slug).toBe('biometa-b');
    expect(entries[1].slug).toBe('growthopt');
  });
});

describe('parseCatalogFile — Databases.md shape (fixture)', () => {
  let entries: CatalogEntry[];
  beforeAll(() => {
    entries = parseCatalogFile(DATABASES_FIXTURE);
  });

  it('uses the body verbatim (no "Summary:" label to strip in Databases.md)', () => {
    expect(entries[0].summary).toContain(
      'GeneBank is a public sequence repository. It hosts many deposits.',
    );
  });

  it('captures every paragraph of a multi-paragraph entry', () => {
    // Regression guard: the second paragraph (and its links) must survive.
    expect(entries[0].summary).toContain('Pipeline at genebank/pipeline');
  });

  it('preserves and rewrites the second paragraph links in summaryHtml', () => {
    expect(entries[0].summaryHtml).toContain('href="https://github.com/genebank/pipeline"');
    // Datasets/Pig.md is a rendered page → site route.
    expect(entries[0].summaryHtml).toContain('href="/caail/datasets/pig/"');
  });

  it('parses every entry name/url/group', () => {
    expect(entries.map((e) => e.name)).toEqual(['GeneBank', 'ProtDB']);
    expect(entries[1].url).toBe('https://protdb.example/');
    expect(entries.every((e) => e.group === 'Sequence Repositories')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Integration — real corpus (ground-truth contract)
// ---------------------------------------------------------------------------

describe('buildCatalogModel — real corpus', () => {
  let model: ReturnType<typeof buildCatalogModel>;
  beforeAll(() => {
    model = buildCatalogModel();
  });

  it('emits the verified ground-truth entry counts', () => {
    // 118 / 133 = current Software.md / Databases.md H3 counts; bump when entries
    // are added. These MUST equal counts.json (asserted in generate-data).
    expect(model.software).toHaveLength(118);
    expect(model.databases).toHaveLength(134);
  });

  it('passes CatalogSchema (every url valid, fields present)', () => {
    expect(CatalogSchema.safeParse(model).success).toBe(true);
  });

  it('every entry has a non-empty group and a unique slug per catalog', () => {
    for (const list of [model.software, model.databases]) {
      expect(list.every((e) => e.group.length > 0)).toBe(true);
      const slugs = list.map((e) => e.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });

  it('leaves no un-rewritten repo-relative links in summaryHtml', () => {
    // Every internal link must have been resolved to a site route or a GitHub
    // blob URL — a surviving href="./…" / "../…" would 404 on the site.
    for (const list of [model.software, model.databases]) {
      for (const e of list) {
        expect(e.summaryHtml).not.toMatch(/href="\.\.?\//);
      }
    }
  });

  it('surfaces hyperlinks that the old plain-text parser dropped', () => {
    // COBRApy's summary cites a DOI inline; that link must now reach the card.
    const cobrapy = model.software.find((e) => e.name === 'COBRApy');
    expect(cobrapy?.summaryHtml).toContain('<a href="https://doi.org/');
  });

  it('carries a license field on every entry (null when undeterminable)', () => {
    for (const list of [model.software, model.databases]) {
      for (const e of list) {
        expect(e.license === null || typeof e.license === 'string').toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// C. License field — manual `License:` line + GitHub cache precedence
// ---------------------------------------------------------------------------

describe('parseCatalogFile — license extraction & cache fold', () => {
  const cache: LicenseCache = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    repos: {
      'x/manualtool': { spdx: 'MIT', name: 'MIT License' },
      'x/cachetool': { spdx: 'Apache-2.0', name: 'Apache License 2.0' },
    },
  };

  it('lets a manual License: line win over the cache', () => {
    const [manual] = parseCatalogFile(LICENSE_FIXTURE, 'Software.md', cache);
    expect(manual.name).toBe('ManualTool');
    expect(manual.license).toBe('Non-commercial');
  });

  it('removes the License: line from summary and summaryHtml', () => {
    const [manual] = parseCatalogFile(LICENSE_FIXTURE, 'Software.md', cache);
    expect(manual.summary).not.toMatch(/License:/i);
    expect(manual.summary).not.toMatch(/Non-commercial/);
    expect(manual.summaryHtml).not.toMatch(/License:/i);
    // The real description survives.
    expect(manual.summary).toContain('set by a manual line');
  });

  it('falls back to the GitHub-cache SPDX when there is no manual line', () => {
    const entries = parseCatalogFile(LICENSE_FIXTURE, 'Software.md', cache);
    expect(entries.find((e) => e.name === 'CacheTool')?.license).toBe('Apache-2.0');
  });

  it('yields null for a non-GitHub URL with no manual line', () => {
    const entries = parseCatalogFile(LICENSE_FIXTURE, 'Software.md', cache);
    expect(entries.find((e) => e.name === 'PlainTool')?.license).toBeNull();
  });

  it('still applies the manual line when no cache is present', () => {
    const entries = parseCatalogFile(LICENSE_FIXTURE, 'Software.md', null);
    expect(entries.find((e) => e.name === 'ManualTool')?.license).toBe('Non-commercial');
    // …but a cache-only license is null without the cache.
    expect(entries.find((e) => e.name === 'CacheTool')?.license).toBeNull();
  });
});
