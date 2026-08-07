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
  entryHeadingDepth,
  isEntryHeading,
  pageFromPath,
} from './datasets.js';

const FIXTURE_ROOT = join(
  fileURLToPath(import.meta.url),
  '..',
  'fixtures',
  'datasets-metrics',
);

describe('entry-heading identity (the per-page depth rule)', () => {
  it('marks Benchmarks entries at H2 and every other page at H3', () => {
    expect(entryHeadingDepth('Benchmarks')).toBe(2);
    for (const p of ['Cow', 'HumanReference', 'CrossSpecies', 'FoodSafety']) {
      expect(entryHeadingDepth(p)).toBe(3);
    }
  });

  it('derives the page from a path, which is how extraction picks the depth', () => {
    expect(pageFromPath('Datasets/Benchmarks.md')).toBe('Benchmarks');
    expect(pageFromPath('/abs/path/Datasets/Cow.md')).toBe('Cow');
    // The trap this guards: a temp file named after anything but the page reads at the
    // default depth and silently finds no entries.
    expect(pageFromPath('/tmp/entries-Benchmarks.md')).not.toBe('Benchmarks');
  });

  it('excludes a narrative H2 on the H2-entry page, so a footer is not an 18th dataset', () => {
    expect(isEntryHeading('Benchmarks', 'MassSpecGym', '')).toBe(true);
    expect(isEntryHeading('Benchmarks', 'Further reading', '')).toBe(false);
    expect(isEntryHeading('Benchmarks', 'Complete data inventory', '')).toBe(false);
  });

  it('compares PLAIN TEXT, which every caller must flatten to before asking', () => {
    // The asymmetry this pins: extract/emit hold mdast and once passed `inlineMd` (markdown
    // source) while the counter and the card renderer passed flattened text. `## [Further
    // reading](…)` then counted as narrative on one pair of paths and as a dataset on the
    // other — a page counted 17 and emitted 18, tripping the served-==-counted assertion.
    // A caller handing this function markdown source is the bug; the exclusion set is exact.
    expect(isEntryHeading('Benchmarks', 'Further reading', '')).toBe(false);
    expect(isEntryHeading('Benchmarks', '[Further reading](../README.md)', '')).toBe(true);
  });

  it('keeps using the enclosing section on H3 pages, where the H2 is not an entry', () => {
    expect(isEntryHeading('Cow', 'CattleGTEx', 'Featured atlases')).toBe(true);
    expect(isEntryHeading('Cow', 'Some row', 'Complete data inventory')).toBe(false);
  });

  it('matches the exclusions case-insensitively, so one capital letter is not a dataset', () => {
    for (const v of ['Further Reading', 'FURTHER READING', 'further reading']) {
      expect(isEntryHeading('Benchmarks', v, ''), `${v} should be narrative`).toBe(false);
    }
    expect(isEntryHeading('Cow', 'Some row', 'COMPLETE DATA INVENTORY')).toBe(false);
  });
});

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
    expect(b.total).toBe(
      b.speciesRows + b.curatedEntries + b.referenceEntries + b.benchmarkEntries,
    );
  });

  it('every part is positive on the real corpus', () => {
    expect(b.speciesRows).toBeGreaterThan(0);
    expect(b.curatedEntries).toBeGreaterThan(0);
    expect(b.referenceEntries).toBeGreaterThan(0);
    expect(b.benchmarkEntries).toBeGreaterThan(0);
  });

  it('returns the verified ground-truth dataset total', () => {
    // GROUND TRUTH — pinned after the first green run of `pnpm parse`.
    // Bump in lockstep when Datasets/ inventory tables / reference / benchmark
    // entries change. 226 = 164 inventory rows + 21 curated species-page entries
    // + 24 reference entries + 17 benchmarks. It was 205 until #156, which folded
    // in the two populations the total had silently omitted.
    expect(b.total).toBe(226);
  });

  it('counts the same population the datasets endpoint serves', () => {
    // The reason the total moved. Before #156 these were different populations in both
    // directions, so a consumer comparing them got a number about nothing.
    expect(b.speciesRows).toBe(164);
    expect(b.curatedEntries + b.referenceEntries + b.benchmarkEntries).toBe(62);
  });
});
