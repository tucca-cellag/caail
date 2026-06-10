/**
 * datasets.test.ts — tests for the "every catalogued dataset" breakdown.
 *
 * Suites:
 *   A. Per-page unit counters over fixtures (inventory rows, reference H3
 *      entries, benchmark H2 entries, stubs, missing pages).
 *   B. computeDatasetBreakdown over the datasets-metrics fixture — exact,
 *      hand-counted totals across all three page shapes.
 *   C. Integration: the real corpus — the parts sum to the total, and the
 *      total matches the verified ground-truth contract.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inventoryRowCount,
  headingCount,
  computeDatasetBreakdown,
} from './datasets.js';

const FIXTURE_ROOT = join(
  fileURLToPath(import.meta.url),
  '..',
  'fixtures',
  'datasets-metrics',
);

// ---------------------------------------------------------------------------
// A. Per-page unit counters (fixtures)
// ---------------------------------------------------------------------------

describe('inventoryRowCount', () => {
  it('counts the `## Complete data inventory` data rows (excludes header)', () => {
    expect(inventoryRowCount(FIXTURE_ROOT, 'Cow')).toBe(3);
    expect(inventoryRowCount(FIXTURE_ROOT, 'CrossSpecies')).toBe(2);
  });

  it('returns 0 for a placeholder-note stub (no table)', () => {
    expect(inventoryRowCount(FIXTURE_ROOT, 'Sheep')).toBe(0);
  });

  it('returns 0 for a missing page', () => {
    expect(inventoryRowCount(FIXTURE_ROOT, 'Nonexistent')).toBe(0);
  });
});

describe('headingCount', () => {
  it('counts H3 dataset entries on a reference page (Further reading bullets are not H3)', () => {
    expect(headingCount(FIXTURE_ROOT, 'HumanReference', 3)).toBe(3);
    expect(headingCount(FIXTURE_ROOT, 'CHOReference', 3)).toBe(2);
  });

  it('counts H2 dataset entries on the benchmarks page (H1 title is not counted)', () => {
    expect(headingCount(FIXTURE_ROOT, 'Benchmarks', 2)).toBe(4);
  });

  it('returns 0 for a missing page', () => {
    expect(headingCount(FIXTURE_ROOT, 'Nonexistent', 3)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B. computeDatasetBreakdown (fixture — exact hand-counted totals)
// ---------------------------------------------------------------------------

describe('computeDatasetBreakdown (fixture)', () => {
  const b = computeDatasetBreakdown(FIXTURE_ROOT);

  it('sums species + CrossSpecies inventory rows into speciesRows', () => {
    // Cow(3) + Sheep(0) + CrossSpecies(2); other species pages absent → 0.
    expect(b.speciesRows).toBe(5);
  });

  it('sums reference-page H3 entries into referenceEntries', () => {
    // HumanReference(3) + CHOReference(2).
    expect(b.referenceEntries).toBe(5);
  });

  it('counts benchmark H2 entries into benchmarkEntries', () => {
    expect(b.benchmarkEntries).toBe(4);
  });

  it('total equals the sum of all three parts', () => {
    expect(b.total).toBe(b.speciesRows + b.referenceEntries + b.benchmarkEntries);
    expect(b.total).toBe(14);
  });

  it('perPage carries a transparent {page, kind, count} entry per source page', () => {
    const cross = b.perPage.find((p) => p.page === 'CrossSpecies');
    expect(cross).toEqual({ page: 'CrossSpecies', kind: 'inventory', count: 2 });
    const bench = b.perPage.find((p) => p.page === 'Benchmarks');
    expect(bench).toEqual({ page: 'Benchmarks', kind: 'benchmark', count: 4 });
  });
});

// ---------------------------------------------------------------------------
// C. Integration — real corpus
// ---------------------------------------------------------------------------

describe('computeDatasetBreakdown — real corpus', () => {
  let b: ReturnType<typeof computeDatasetBreakdown>;

  beforeAll(() => {
    b = computeDatasetBreakdown();
  });

  it('parts sum to total (no-drift invariant)', () => {
    expect(b.total).toBe(b.speciesRows + b.referenceEntries + b.benchmarkEntries);
  });

  it('every part is positive on the real corpus', () => {
    expect(b.speciesRows).toBeGreaterThan(0);
    expect(b.referenceEntries).toBeGreaterThan(0);
    expect(b.benchmarkEntries).toBeGreaterThan(0);
  });

  it('returns the verified ground-truth dataset total', () => {
    // GROUND TRUTH — pinned after the first green run of `pnpm parse`.
    // Bump in lockstep when Datasets/ inventory tables / reference / benchmark
    // entries change.
    expect(b.total).toBe(146);
  });
});
