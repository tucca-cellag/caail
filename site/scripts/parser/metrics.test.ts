/**
 * metrics.test.ts — tests for the "By the Numbers" metrics builder.
 *
 * Suites:
 *   A. speciesInventory: inventory-table row counting + stub detection (fixtures).
 *   B. Integration: buildMetricsModel over the real corpus — matrix coverage
 *      math, library === computeCounts, species shape, momentum present.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMetricsModel, speciesInventory } from './metrics.js';
import { buildPapersModel } from './papers.js';
import { computeCounts } from './counts.js';
import { AREAS } from './areas.js';
import { MetricsSchema } from './types.js';

const FIXTURE_ROOT = join(
  fileURLToPath(import.meta.url),
  '..',
  'fixtures',
  'datasets-metrics',
);

// ---------------------------------------------------------------------------
// A. speciesInventory (fixtures)
// ---------------------------------------------------------------------------

describe('speciesInventory', () => {
  it('counts the inventory table rows on a dense page (excludes header)', () => {
    const cow = speciesInventory(FIXTURE_ROOT, 'Cow');
    expect(cow.inventoryRows).toBe(3);
    expect(cow.isStub).toBe(false);
    expect(cow.species).toBe('Cow');
  });

  it('treats a placeholder-note stub (no table) as 0 rows / isStub', () => {
    const sheep = speciesInventory(FIXTURE_ROOT, 'Sheep');
    expect(sheep.inventoryRows).toBe(0);
    expect(sheep.isStub).toBe(true);
  });

  it('treats a missing page as a stub', () => {
    const missing = speciesInventory(FIXTURE_ROOT, 'Nonexistent');
    expect(missing.inventoryRows).toBe(0);
    expect(missing.isStub).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Integration — real corpus
// ---------------------------------------------------------------------------

describe('buildMetricsModel — real corpus', () => {
  let metrics: ReturnType<typeof buildMetricsModel>;
  let model: ReturnType<typeof buildPapersModel>;

  beforeAll(() => {
    model = buildPapersModel();
    metrics = buildMetricsModel(model, undefined, '2026-06-01T00:00:00.000Z');
  });

  it('library equals computeCounts (single source of truth)', () => {
    expect(metrics.library).toEqual(computeCounts(model));
  });

  it('matrix coverage math is internally consistent', () => {
    const { totalCells, filledCells, coveragePct } = metrics.matrix;
    expect(totalCells).toBe(model.methods.length * AREAS.length);
    expect(filledCells).toBe(model.cells.filter((c) => c.refIds.length > 0).length);
    expect(filledCells).toBeLessThanOrEqual(totalCells);
    expect(coveragePct).toBeCloseTo((filledCells / totalCells) * 100, 1);
  });

  it('per-area covers all 7 areas; per-method covers every matrix method', () => {
    expect(metrics.matrix.perArea).toHaveLength(AREAS.length);
    expect(metrics.matrix.perMethod).toHaveLength(model.methods.length);
    // every area paper count is bounded by the total reference count
    for (const a of metrics.matrix.perArea) {
      expect(a.papers).toBeLessThanOrEqual(metrics.library.papers);
    }
  });

  it('reports all 10 species, each now carrying inventory rows', () => {
    expect(metrics.species).toHaveLength(10);
    const stubs = metrics.species.filter((s) => s.isStub).map((s) => s.species);
    expect(stubs).toEqual([]);
    // dense species carry rows
    const pig = metrics.species.find((s) => s.species === 'Pig')!;
    expect(pig.inventoryRows).toBeGreaterThan(0);
  });

  it('datasets breakdown parts sum to total and match library.datasets', () => {
    const { total, speciesRows, referenceEntries, benchmarkEntries } = metrics.datasets;
    expect(speciesRows + referenceEntries + benchmarkEntries).toBe(total);
    expect(total).toBe(metrics.library.datasets);
    expect(speciesRows).toBeGreaterThan(0);
    expect(referenceEntries).toBeGreaterThan(0);
    expect(benchmarkEntries).toBeGreaterThan(0);
  });

  it('captures a build-time momentum snapshot from git', () => {
    expect(metrics.momentum).not.toBeNull();
    expect(metrics.momentum!.papersLastModified).toBeTruthy();
  });

  it('passes MetricsSchema', () => {
    expect(MetricsSchema.safeParse(metrics).success).toBe(true);
  });
});
