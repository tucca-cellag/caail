/**
 * dataset-inventory.test.ts — the inventory rows served to agents, and the SuperSeries
 * membership folded onto them (CAAIL-258).
 *
 *   A. Unit: the two pure helpers behind the fold.
 *   B. Integration: the real corpus, including the query that used to return nothing.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { buildDatasetInventory, parseSubseries, rowAccession } from './dataset-inventory.js';
import type { DatasetInventoryRow } from './types.js';

describe('parseSubseries', () => {
  it('returns [] for a row that is not a SuperSeries', () => {
    expect(parseSubseries(null)).toEqual([]);
    expect(parseSubseries(undefined)).toEqual([]);
    expect(parseSubseries('')).toEqual([]);
  });

  it('parses a stored member array', () => {
    expect(parseSubseries('["GSE173196","GSE173198"]')).toEqual(['GSE173196', 'GSE173198']);
  });

  // db:check is what fails a bad value. Throwing here would take the whole build down
  // for a curation typo, in a module every dataset page depends on.
  it('degrades to [] rather than throwing on malformed input', () => {
    expect(parseSubseries('{not json')).toEqual([]);
    expect(parseSubseries('{"a":1}')).toEqual([]);
  });

  it('drops non-string members', () => {
    expect(parseSubseries('["GSE1",7,null,"GSE2"]')).toEqual(['GSE1', 'GSE2']);
  });
});

describe('rowAccession', () => {
  it('reads the accession out of the frozen id', () => {
    expect(rowAccession('ds:gse173199')).toBe('GSE173199');
  });

  // ds:gse158430-2 is the SAME GEO accession as ds:gse158430, fanned out per species.
  // Treating the suffix as part of the accession would make the two look unrelated.
  it('strips the per-species fan-out suffix', () => {
    expect(rowAccession('ds:gse158430-2')).toBe('GSE158430');
    expect(rowAccession('ds:gse158430-3')).toBe('GSE158430');
  });
});

describe('buildDatasetInventory — real corpus', () => {
  let inventory: DatasetInventoryRow[];
  const byId = (id: string): DatasetInventoryRow =>
    inventory.find((r) => r.id === id)!;

  beforeAll(() => {
    inventory = buildDatasetInventory().inventory;
  });

  it('gives every row a subseries array (empty when it is not a SuperSeries)', () => {
    expect(inventory.every((r) => Array.isArray(r.subseries))).toBe(true);
    expect(inventory.some((r) => r.subseries.length === 0)).toBe(true);
  });

  it('resolves a member that has its own inventory row', () => {
    const parent = byId('ds:gse173199');
    expect(parent.subseries.map((s) => s.accession)).toEqual(['GSE173196', 'GSE173198']);
    expect(parent.subseries.find((s) => s.accession === 'GSE173198')?.id).toBe('ds:gse173198');
  });

  // The atlas half of the hybrid: eight members served, zero Markdown rows added. If these
  // ever resolve, someone promoted them and the page grew by ~24 near-identical rows.
  it('serves an unpromoted member with a null id rather than dropping it', () => {
    const atlas = byId('ds:gse158430');
    expect(atlas.subseries).toHaveLength(8);
    expect(atlas.subseries.every((s) => s.id === null)).toBe(true);
  });

  it('never lists a row as its own subseries', () => {
    for (const r of inventory) {
      expect(r.subseries.map((s) => s.accession)).not.toContain(rowAccession(r.id));
    }
  });

  /**
   * THE REGRESSION. This is the query that returned nothing while every guard in the repo
   * stayed green, because the guards tested CAAIL's own `Type` string rather than anything
   * about the world: GSE173198 is a bulk RNA-seq bovine differentiation timecourse at
   * 0/24/48/72/96 h with n=4, and it was reachable from GEO in ten minutes and from CAAIL
   * not at all. A homepage example asserted, on that silence, that no such deposit existed.
   */
  it('finds a bovine bulk RNA-seq differentiation timecourse', () => {
    const hits = inventory.filter((r) =>
      r.page === 'Cow' &&
      /^rna-seq/i.test(r.columns.Type ?? '') &&
      /0\/24\/48\/72\/96/.test(r.columns.Description ?? ''));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((r) => r.id)).toContain('ds:gse173198');
  });

  it('makes every audited subseries accession addressable', () => {
    const accessions = new Set(inventory.map((r) => rowAccession(r.id)));
    for (const a of ['GSE173196', 'GSE173198', 'GSE262675', 'GSE262757', 'GSE290556', 'GSE206911', 'GSE206913']) {
      expect(accessions.has(a)).toBe(true);
    }
  });
});
