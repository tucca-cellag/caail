/**
 * papers.test.ts — tests for the Papers.md model orchestrator.
 *
 * Two suites:
 *   A. A small synthetic fixture (papers.fixture.md) exercising every branch.
 *   B. The real repo-root Papers.md, asserting verified ground-truth invariants.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPapersModel, PAPERS_MD_PATH } from './papers.js';
import { PapersDataSchema, type PapersData } from './types.js';

const FIXTURE_PATH = join(
  fileURLToPath(import.meta.url),
  '..',
  'fixtures',
  'papers.fixture.md',
);

// ---------------------------------------------------------------------------
// A. Synthetic fixture
// ---------------------------------------------------------------------------

describe('buildPapersModel — fixture', () => {
  let model: PapersData;

  it('builds without throwing (internal schema validation passes)', () => {
    expect(() => {
      model = buildPapersModel(FIXTURE_PATH);
    }).not.toThrow();
  });

  it('parses the two area columns in order', () => {
    expect(model.areas).toEqual([
      { key: 'media', label: 'Media Optimization' },
      { key: 'cell', label: 'Cellular Engineering' },
    ]);
  });

  it('collects the method rows in order', () => {
    expect(model.methods).toEqual([
      'Bayesian Optimization',
      'Deep Learning',
      'GNN',
    ]);
  });

  it('emits only populated cells with correct refIds/labels', () => {
    // Bayesian Optimization × media has #1 and #2; Deep Learning × cell has #1,#4.
    // The GNN row and all other cells are empty → no entries.
    expect(model.cells).toEqual([
      {
        method: 'Bayesian Optimization',
        area: 'media',
        refIds: [1, 2],
        labels: ['Cosenza et al. 2022', 'Cosenza et al. 2022'],
      },
      {
        method: 'Deep Learning',
        area: 'cell',
        refIds: [1, 4],
        labels: ['Cosenza et al. 2022', 'Jones 2020'],
      },
    ]);
  });

  it('marks a matrix-cited References ref as primary with code+data flags', () => {
    const ref2 = model.references.find((r) => r.id === 2)!;
    expect(ref2.section).toBe('References');
    expect(ref2.isPrimary).toBe(true);
    expect(ref2.methods).toEqual(['Bayesian Optimization']);
    expect(ref2.areas).toEqual(['media']);
    expect(ref2.hasCode).toBe(true);
    expect(ref2.hasData).toBe(true);
    expect(ref2.codeUrl).toBe('https://github.com/example/repo-two');
    expect(ref2.dataUrl).toBe('https://doi.org/10.5281/zenodo.1234567');
  });

  it('handles a ref cited across two methods/areas', () => {
    const ref1 = model.references.find((r) => r.id === 1)!;
    expect(ref1.isPrimary).toBe(true);
    expect(ref1.methods).toEqual(['Bayesian Optimization', 'Deep Learning']);
    expect(ref1.areas).toEqual(['media', 'cell']);
    expect(ref1.hasCode).toBe(true);
    expect(ref1.hasData).toBe(false);
    expect(ref1.codeUrl).toBe('https://github.com/example/repo-one');
    expect(ref1.dataUrl).toBeNull();
  });

  it('marks the Reviews ref as non-primary with no methods/areas', () => {
    const ref3 = model.references.find((r) => r.id === 3)!;
    expect(ref3.section).toBe('Reviews & Perspectives');
    expect(ref3.isPrimary).toBe(false);
    expect(ref3.methods).toEqual([]);
    expect(ref3.areas).toEqual([]);
  });

  it('disambiguates colliding base slugs by ascending id', () => {
    const ref1 = model.references.find((r) => r.id === 1)!;
    const ref2 = model.references.find((r) => r.id === 2)!;
    expect(ref1.slug).toBe('cosenza-2022');
    expect(ref2.slug).toBe('cosenza-2022b');
  });

  it('leaves single-occurrence slugs unsuffixed', () => {
    const ref4 = model.references.find((r) => r.id === 4)!;
    expect(ref4.slug).toBe('jones-2020');
  });

  it('produces a model that validates against the schema', () => {
    expect(PapersDataSchema.safeParse(model).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Real corpus integration
// ---------------------------------------------------------------------------

describe('buildPapersModel — real Papers.md', () => {
  const model = buildPapersModel();

  it('resolves PAPERS_MD_PATH to the repo-root Papers.md', () => {
    expect(PAPERS_MD_PATH.endsWith('/caail/Papers.md')).toBe(true);
  });

  it('has 193 references', () => {
    expect(model.references.length).toBe(193);
  });

  // NOTE: The task spec claimed 70 code / 10 data. Verified ground truth (both
  // via AST scan and a line-based grep mapping every `> **Code**`/`> **Data**`
  // line to its nearest preceding `<a id>` anchor) is 69 DISTINCT refs with a
  // code URL and 10 refs carrying a `> **Data**` blockquote.
  //   - 71 `**Code**` lines exist, but ref 133 has TWO separate Code
  //     blockquotes, so distinct refs with code = 69, not 70.
  //   - 10 `**Data**` lines exist, but ref 132's is a prose blockquote whose
  //     only link is the relative `./Datasets/` (not an absolute deposit URL).
  //     The schema's `z.string().url()` rejects relative URLs, so we store
  //     null there → 9 refs with a non-null absolute dataUrl.
  it('has 69 refs with a code URL, consistent with hasCode', () => {
    const withCodeUrl = model.references.filter((r) => r.codeUrl !== null).length;
    const withHasCode = model.references.filter((r) => r.hasCode).length;
    expect(withCodeUrl).toBe(69);
    expect(withHasCode).toBe(69);
  });

  it('has 9 refs with an absolute data URL', () => {
    const withDataUrl = model.references.filter((r) => r.dataUrl !== null).length;
    expect(withDataUrl).toBe(9);
  });

  it('has 6 distinct sections including References and Reviews & Perspectives', () => {
    const sections = new Set(model.references.map((r) => r.section));
    expect(sections.size).toBe(6);
    expect(sections.has('References')).toBe(true);
    expect(sections.has('Reviews & Perspectives')).toBe(true);
  });

  it('has 23 method rows', () => {
    expect(model.methods.length).toBe(23);
  });

  it('has 7 areas with the exact keys in column order', () => {
    expect(model.areas.length).toBe(7);
    expect(model.areas.map((a) => a.key)).toEqual([
      'media',
      'cell',
      'bioprocess',
      'scaffolding',
      'sensory',
      'tooling',
      'eval',
    ]);
  });

  it('has no dangling matrix refIds', () => {
    const ids = new Set(model.references.map((r) => r.id));
    const dangling = model.cells
      .flatMap((c) => c.refIds)
      .filter((id) => !ids.has(id));
    expect(dangling.length).toBe(0);
  });

  it('spot-checks the Deep Learning × cell cell', () => {
    const cell = model.cells.find(
      (c) => c.method === 'Deep Learning' && c.area === 'cell',
    )!;
    expect(cell).toBeDefined();
    expect(cell.refIds).toEqual([4, 5, 6, 122, 57, 60, 145]);
    expect(cell.refIds.length).toBe(7);
  });

  it('spot-checks reference id 6', () => {
    const ref6 = model.references.find((r) => r.id === 6)!;
    expect(ref6.year).toBe(2021);
    expect(ref6.journal).toBe('Bioinformatics');
    expect(ref6.doi).toBe('10.1093/bioinformatics/btab083');
    expect(ref6.hasCode).toBe(true);
    expect(ref6.isPrimary).toBe(true);
  });

  it('validates against the schema', () => {
    expect(PapersDataSchema.safeParse(model).success).toBe(true);
  });
});
