/**
 * counts.test.ts — tests for the corpus counts computation.
 *
 * Two suites:
 *   A. Unit: talks scoping (fixture OtherResources-like file) — verifies that
 *      only links under `## YouTube Videos` are counted, not links in any other
 *      `##` section.
 *   B. Integration: real repo-root corpus files with the real papers model,
 *      asserting the verified ground-truth values for all six fields.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeCounts } from './counts.js';
import { buildPapersModel } from './papers.js';
import { CountsSchema, type PapersData } from './types.js';

const FIXTURE_DIR = join(fileURLToPath(import.meta.url), '..', 'fixtures');

// ---------------------------------------------------------------------------
// A. Unit — talks scoping (fixture)
// ---------------------------------------------------------------------------

describe('computeCounts — talks scoping (fixture)', () => {
  it('counts only list-item links under ## YouTube Videos, not links in other sections', () => {
    const fixtureRoot = join(FIXTURE_DIR, 'counts-other-resources.fixture.md');

    // Build a minimal stub PapersData — we only care about talks here.
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
    // The fixture base dir must have Software.md, Databases.md, OtherResources.md,
    // Datasets/, and ResearchAreas/ — for this unit test we only care about talks,
    // so we use a dedicated OtherResources fixture and stub the rest.
    // Instead, supply a custom repoRoot that holds our fixture file as
    // OtherResources.md but stub Software.md, Databases.md, Datasets/, ResearchAreas/.
    const fixtureRepoRoot = join(FIXTURE_DIR, 'counts-repo-root-fixture');

    const result = computeCounts(stubModel, fixtureRepoRoot);

    // The fixture YouTube Videos section has 3 links; a second ## section has
    // 2 more links that must NOT be counted.
    expect(result.talks).toBe(3);
    // Schema validates
    expect(CountsSchema.safeParse(result).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Integration — real corpus files
// ---------------------------------------------------------------------------

describe('computeCounts — real corpus (ground-truth contract)', () => {
  let model: PapersData;
  let result: ReturnType<typeof computeCounts>;

  it('builds the real papers model without throwing', () => {
    expect(() => {
      model = buildPapersModel();
    }).not.toThrow();
  });

  it('computeCounts returns the verified ground-truth counts', () => {
    result = computeCounts(model);
    expect(result).toEqual({
      papers: 193,
      software: 70,
      databases: 71,
      species: 14,
      researchAreas: 8,
      talks: 5,
    });
  });

  it('result passes CountsSchema validation', () => {
    expect(CountsSchema.safeParse(result).success).toBe(true);
  });
});
