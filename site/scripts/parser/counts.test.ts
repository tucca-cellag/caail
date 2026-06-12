/**
 * counts.test.ts — tests for the corpus counts computation.
 *
 * Two suites:
 *   A. Unit: talks counting (fixture Talks.md) — verifies that all video/playlist
 *      items across every section of Talks.md are counted.
 *   B. Integration: real repo-root corpus files with the real papers model,
 *      asserting the verified ground-truth values for all six fields.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCounts } from './counts.js';
import { buildPapersModel } from './papers.js';
import { CountsSchema, type PapersData } from './types.js';

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');

// ---------------------------------------------------------------------------
// A. Unit — talks scoping (fixture)
// ---------------------------------------------------------------------------

describe('computeCounts — talks counting (fixture)', () => {
  // Build a minimal stub PapersData — we only care about talks/species/researchAreas here.
  const stubModel: PapersData = {
    areas: [],
    methods: [],
    cells: [],
    references: Array.from({ length: 3 }, (_, i) => ({
      id: i + 1,
      section: 'References',
      raw: `Stub, A. (2022). Title ${i + 1}. *Journal*, 1(1), 1. https://doi.org/10.1/a${i}`,
      authors: [`Stub, A.`],
      authorsText: 'Stub, A.',
      year: 2022,
      title: `Title ${i + 1}`,
      journal: 'Journal',
      doi: `10.1/a${i}`,
      codeUrl: null,
      dataUrl: null,
      isPrimary: true,
      methods: [],
      areas: [],
      hasCode: false,
      hasData: false,
      slug: `stub-2022${'abcdefghijklmnopqrstuvwxyz'[i] ?? String(i)}`,
    })),
  };

  // Point computeCounts at our fixture directory as the "repo root".
  // The fixture base dir holds Software.md, Databases.md, Talks.md,
  // Datasets/, and ResearchAreas/ — all minimal stubs.
  const fixtureRepoRoot = join(FIXTURE_DIR, 'counts-repo-root-fixture');

  it('counts video/playlist items across all Talks.md sections', () => {
    const result = computeCounts(stubModel, fixtureRepoRoot);

    // The fixture Talks.md has 2 videos under ## YouTube Videos + 1 playlist
    // under ## AI Fundamentals = 3 items.
    expect(result.talks).toBe(3);
    // Schema validates
    expect(CountsSchema.safeParse(result).success).toBe(true);
  });

  it('excludes CLAUDE.md and README.md from species and researchAreas counts', () => {
    const result = computeCounts(stubModel, fixtureRepoRoot);

    // Datasets/ contains: Cow.md, Pig.md (real pages), README.md (excluded),
    // CLAUDE.md (excluded) → species = 2.
    expect(result.species).toBe(2);

    // ResearchAreas/ contains: Bioprocess.md, MediaOptimization.md (real pages),
    // CLAUDE.md (excluded) → researchAreas = 2.
    expect(result.researchAreas).toBe(2);

    // Cow.md/Pig.md are empty stubs and there are no reference/benchmark pages
    // in this fixture → no catalogued datasets.
    expect(result.datasets).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B. Integration — real corpus files
// ---------------------------------------------------------------------------

describe('computeCounts — real corpus (ground-truth contract)', () => {
  let result: ReturnType<typeof computeCounts>;

  beforeAll(() => {
    const model = buildPapersModel();
    result = computeCounts(model);
  });

  it('computeCounts returns the verified ground-truth counts', () => {
    expect(result).toEqual({
      papers: 232,
      software: 87,
      databases: 84,
      species: 14,
      datasets: 146,
      researchAreas: 8,
      talks: 14,
    });
  });

  it('result passes CountsSchema validation', () => {
    expect(CountsSchema.safeParse(result).success).toBe(true);
  });
});
