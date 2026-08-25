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
    // Bayesian Optimization × media has #1 and #2; Deep Learning × cell has #1,#4;
    // GNN × media has #5 (the merged-blockquote fixture ref).
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
      {
        method: 'GNN',
        area: 'media',
        refIds: [5],
        labels: ['Merged 2024'],
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

  it('recovers BOTH codeUrl and dataUrl from a merged single-node blockquote (Fix E)', () => {
    // ref 5 in the fixture has `> **Code**: …\n> **Data**: …` with NO blank line
    // between them — remark folds both lines into one blockquote node.
    const ref5 = model.references.find((r) => r.id === 5)!;
    expect(ref5.isPrimary).toBe(true);
    expect(ref5.hasCode).toBe(true);
    expect(ref5.hasData).toBe(true);
    expect(ref5.codeUrl).toBe('https://github.com/example/merged');
    expect(ref5.dataUrl).toBe('https://zenodo.org/record/merged');
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
    // Repo-root basename — robust across normal checkouts and linked worktrees
    // (whose root dir isn't named "caail"); must have ascended out of site/.
    expect(PAPERS_MD_PATH.endsWith('/Papers.md')).toBe(true);
    expect(PAPERS_MD_PATH.includes('/site/')).toBe(false);
  });

  it('has 346 references', () => {
    // current Papers.md reference count; bump when refs are added.
    expect(model.references.length).toBe(346);
  });

  // Ground truth (bump when refs change): DISTINCT refs with a code URL and
  // refs with a non-null absolute data URL. (Ref 132's only data link is the relative
  // `./Datasets/` — rejected by the schema's `z.string().url()`, stored as null.)
  it('has 93 refs with a code URL, consistent with hasCode', () => {
    const withCodeUrl = model.references.filter((r) => r.codeUrl !== null).length;
    const withHasCode = model.references.filter((r) => r.hasCode).length;
    expect(withCodeUrl).toBe(93);
    expect(withHasCode).toBe(93);
  });

  it('has 10 refs with an absolute data URL', () => {
    const withDataUrl = model.references.filter((r) => r.dataUrl !== null).length;
    expect(withDataUrl).toBe(11);
  });

  it('has 6 distinct sections including References and Reviews & Perspectives', () => {
    const sections = new Set(model.references.map((r) => r.section));
    expect(sections.size).toBe(6);
    expect(sections.has('References')).toBe(true);
    expect(sections.has('Reviews & Perspectives')).toBe(true);
  });

  // Deliberately no row count. The method rows are the one matrix axis CAAIL does not
  // enumerate or guard (#81): the set drifts as rows are split and minted, so a hardcoded
  // length asserts nothing about correctness and goes red on every legitimate addition.
  // It had already drifted here, the name saying 24 against an assertion of 25. The
  // columns below keep their enumeration because db:check holds CONTRIBUTING.md and
  // CLAUDE.md to that exact list, so there the typed fact has something checking it.
  // What does not drift is that a row is a distinct, usable label, and that the matrix
  // cannot cite a row the header set never declared.
  it('gives every method row a unique, non-empty label', () => {
    expect(model.methods.every((m) => m.trim().length > 0)).toBe(true);
    expect(new Set(model.methods).size).toBe(model.methods.length);
  });

  it('has no matrix cell on an undeclared method row', () => {
    const declared = new Set(model.methods);
    const undeclared = model.cells
      .map((c) => c.method)
      .filter((m) => !declared.has(m));
    expect(undeclared).toEqual([]);
  });

  it('has 8 areas with the exact keys in column order', () => {
    expect(model.areas.length).toBe(8);
    expect(model.areas.map((a) => a.key)).toEqual([
      'media',
      'cell',
      'bioprocess',
      'scaffolding',
      'sensory',
      'metabolic',
      'foodsafety',
      'tooling',
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
    // #145 (MetaGEM) left this cell for `Deep Learning x Metabolic Modeling`:
    // it reconstructs genome-scale metabolic networks, which Cellular Engineering
    // excludes ("gene regulation ... that does not run through a metabolic network").
    expect(cell.refIds).toEqual([5, 122, 57, 118, 123, 263]);
    expect(cell.refIds.length).toBe(6);
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
