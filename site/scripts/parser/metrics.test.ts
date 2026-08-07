/**
 * metrics.test.ts — tests for the "By the Numbers" metrics builder.
 *
 * Suites:
 *   A. speciesInventory: inventory-table row counting + stub detection (fixtures).
 *   B. Integration: buildMetricsModel over the real corpus — matrix coverage
 *      math, library === computeCounts, species shape, momentum present.
 *   C. The three cross-cutting axes (topics / licenses / citations) agree with the
 *      models they are rolled up from, each checked WITHIN its own universe.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildMetricsModel, speciesInventory } from './metrics.js';
import { buildPapersModel } from './papers.js';
import { buildCatalogModel } from './catalog.js';
import { buildTopicsModel } from './topics.js';
import { buildDatasetsModel } from './datasets-entries.js';
import { computeCounts } from './counts.js';
import { AREAS } from './areas.js';
import { MetricsSchema } from './types.js';
import { LICENSE_TIERS } from '../../src/lib/licenses.js';
import { CITATION_BANDS, citationBand } from '../../src/lib/citation-bands.js';

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
  let catalog: ReturnType<typeof buildCatalogModel>;
  let topics: ReturnType<typeof buildTopicsModel>;
  let datasets: ReturnType<typeof buildDatasetsModel>;

  beforeAll(() => {
    model = buildPapersModel();
    catalog = buildCatalogModel();
    topics = buildTopicsModel();
    datasets = buildDatasetsModel();
    metrics = buildMetricsModel(
      { papers: model, catalog, topics, datasets },
      undefined,
      '2026-06-01T00:00:00.000Z',
    );
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
    const { total, speciesRows, curatedEntries, referenceEntries, benchmarkEntries } =
      metrics.datasets;
    expect(speciesRows + curatedEntries + referenceEntries + benchmarkEntries).toBe(total);
    expect(total).toBe(metrics.library.datasets);
    expect(speciesRows).toBeGreaterThan(0);
    expect(curatedEntries).toBeGreaterThan(0);
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

  // -------------------------------------------------------------------------
  // C. Cross-cutting axes
  // -------------------------------------------------------------------------

  it('topics roll up the topic model without recounting it', () => {
    const t = metrics.topics;
    expect(t.themes).toBe(topics.themes.length);
    expect(t.tags).toBe(topics.tags.length);
    expect(t.perTheme).toHaveLength(topics.themes.length);
    // per-theme item counts come straight off the topic nodes
    for (const row of t.perTheme) {
      const node = topics.themes.find((n) => n.slug === row.slug)!;
      expect(row.items).toBe(node.counts.total);
      expect(row.tags).toBe(node.tags.length);
    }
  });

  it('distinguishes assignments from distinct tagged items', () => {
    const t = metrics.topics;
    // an item may carry several topics, so there are at least as many assignments
    // as tagged items, and you cannot tag more items than exist
    expect(t.assignments).toBeGreaterThanOrEqual(t.taggedItems);
    expect(t.taggedItems).toBeLessThanOrEqual(t.taggableItems);
    expect(t.taggableItems).toBeGreaterThan(0);
  });

  it('license tiers cover every catalog + dataset entry exactly once', () => {
    const l = metrics.licenses;
    expect(l.total).toBe(
      catalog.software.length + catalog.databases.length + datasets.entries.length,
    );
    expect(l.tiers.map((x) => x.tier)).toEqual([...LICENSE_TIERS]);
    expect(l.tiers.reduce((n, x) => n + x.count, 0)).toBe(l.total);
    expect(l.tiers.reduce((n, x) => n + x.pct, 0)).toBeCloseTo(100, 0);
  });

  it('license universe excludes papers', () => {
    // papers carry no license by design; a regression that folded them in would
    // push total past the catalog + dataset-entry population
    expect(metrics.licenses.total).toBeLessThan(
      metrics.library.papers + catalog.software.length + catalog.databases.length,
    );
  });

  it('citation bands partition only the entries that have a count', () => {
    const c = metrics.citations;
    expect(c.bands.map((b) => b.band)).toEqual([...CITATION_BANDS]);
    expect(c.bands.reduce((n, b) => n + b.count, 0)).toBe(c.withCount);
    expect(c.papersWithCount + c.catalogWithCount).toBe(c.withCount);
    // unbanded ("not indexed") is not a band: coverage is a strict subset
    expect(c.papersWithCount).toBeLessThanOrEqual(c.papersTotal);
    expect(c.catalogWithCount).toBeLessThanOrEqual(c.catalogTotal);
    expect(c.papersTotal).toBe(metrics.library.papers);
  });

  it('both subject grids share one shape and cover every theme with its tags', () => {
    for (const [name, grid, keys] of [
      ['licenses', metrics.licenses.bySubject, LICENSE_TIERS],
      ['citations', metrics.citations.bySubject, CITATION_BANDS],
    ] as const) {
      const themeRows = grid.filter((r) => r.kind === 'theme');
      const tagRows = grid.filter((r) => r.kind === 'tag');
      expect(themeRows.map((r) => r.slug).sort(), name).toEqual(
        topics.themes.map((t) => t.slug).sort(),
      );
      expect(tagRows.map((r) => r.slug).sort(), name).toEqual(
        topics.tags.map((t) => t.slug).sort(),
      );
      for (const r of grid) {
        expect(r.cells.map((c) => c.key), `${name} ${r.slug}`).toEqual([...keys]);
        // each row's cells sum to its own total
        expect(r.cells.reduce((n, c) => n + c.count, 0), `${name} ${r.slug}`).toBe(r.total);
      }
      // every tag row names a real parent theme, and sits within it
      for (const r of tagRows) {
        const parent = themeRows.find((t) => t.slug === r.theme)!;
        expect(parent, `${name} ${r.slug} parent`).toBeDefined();
        expect(r.total, `${name} ${r.slug} <= parent`).toBeLessThanOrEqual(parent.total);
      }
    }
  });

  it('each subject grid stays inside its own population', () => {
    // Licenses exclude papers; citations include them. Conflating the two denominators
    // is the mistake these two assertions exist to catch.
    for (const r of metrics.licenses.bySubject) {
      expect(r.total).toBeLessThanOrEqual(metrics.licenses.total);
    }
    for (const r of metrics.citations.bySubject) {
      expect(r.total).toBeLessThanOrEqual(metrics.citations.withCount);
      for (const c of r.cells) {
        const overall = metrics.citations.bands.find((b) => b.band === c.key)!;
        expect(c.count).toBeLessThanOrEqual(overall.count);
      }
    }
    for (const r of metrics.licenses.bySubject) {
      for (const c of r.cells) {
        const overall = metrics.licenses.tiers.find((t) => t.tier === c.key)!;
        expect(c.count).toBeLessThanOrEqual(overall.count);
      }
    }
  });

  it('citation band assignment matches the shared classifier', () => {
    const counts = model.references
      .map((r) => r.citedByOpenAlex)
      .filter((n): n is number => n != null);
    for (const b of metrics.citations.bands) {
      const expected = counts.filter((n) => citationBand(n) === b.band).length;
      // the metric spans papers + catalog + datasets, so the paper-only tally
      // can only be a subset of each band
      expect(b.count).toBeGreaterThanOrEqual(expected);
    }
  });
});
