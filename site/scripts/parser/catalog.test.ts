/**
 * catalog.test.ts — tests for the Software.md / Databases.md catalog parser.
 *
 * Two suites:
 *   A. Unit (fixtures): group tracking, link extraction, Summary:-strip vs
 *      first-paragraph, multi-paragraph entries, and slug disambiguation.
 *   B. Integration (real corpus): the verified ground-truth entry counts and
 *      structural invariants (every entry has a URL + non-empty group).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCatalogFile, buildCatalogModel } from './catalog.js';
import { CatalogSchema, type CatalogEntry } from './types.js';

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');
const SOFTWARE_FIXTURE = join(FIXTURE_DIR, 'software.fixture.md');
const DATABASES_FIXTURE = join(FIXTURE_DIR, 'databases.fixture.md');

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

  it('strips a leading "Summary:" and ignores later paragraphs (e.g. Docs:)', () => {
    expect(entries[0].summary).toBe('A tool for media optimization.');
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

  it('uses the first paragraph (no "Summary:" label) as the summary', () => {
    expect(entries[0].summary).toBe(
      'GeneBank is a public sequence repository. It hosts many deposits.',
    );
  });

  it('takes only the first paragraph for multi-paragraph entries', () => {
    expect(entries[0].summary).not.toContain('Pipeline');
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
    // 70 / 72 = current Software.md / Databases.md H3 counts; bump when entries
    // are added. These MUST equal counts.json (asserted in generate-data).
    expect(model.software).toHaveLength(70);
    expect(model.databases).toHaveLength(72);
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
});
