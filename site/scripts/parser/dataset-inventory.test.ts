/**
 * dataset-inventory.test.ts — the inventory rows served to agents, and the SuperSeries
 * membership folded onto them (CAAIL-258).
 *
 *   A. Unit: the two pure helpers behind the fold.
 *   B. Integration: the real corpus, including the query that used to return nothing.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { buildDatasetInventory, parseSubseries, idAccession, rowDepositAccession } from './dataset-inventory.js';
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

describe('idAccession', () => {
  it('reads the accession out of the frozen id', () => {
    expect(idAccession('ds:gse173199')).toBe('GSE173199');
    expect(idAccession('ds:srp033481')).toBe('SRP033481');
    expect(idAccession('ds:prjna527944')).toBe('PRJNA527944');
  });

  // ds:gse158430-2 is the SAME GEO accession as ds:gse158430, fanned out per species.
  // Treating the suffix as part of the accession would make the two look unrelated.
  it('ignores the per-species fan-out suffix', () => {
    expect(idAccession('ds:gse158430-2')).toBe('GSE158430');
    expect(idAccession('ds:gse158430-3')).toBe('GSE158430');
    expect(idAccession('ds:prjna527944-2')).toBe('PRJNA527944');
  });

  // The regression a trailing `-\d+$` strip caused: E-MTAB is the one family with an
  // internal hyphen, so stripping collapsed every ArrayExpress row onto the key "E-MTAB".
  it('keeps a hyphenated E-MTAB accession whole', () => {
    expect(idAccession('ds:e-mtab-9622')).toBe('E-MTAB-9622');
    expect(idAccession('ds:e-mtab-9622-2')).toBe('E-MTAB-9622');
  });

  it('falls back to the bare slug when the id encodes no accession', () => {
    expect(idAccession('ds:tecator-nir-meat')).toBe('TECATOR-NIR-MEAT');
  });
});

describe('rowDepositAccession', () => {
  it('prefers the Data column over the id', () => {
    expect(rowDepositAccession('ds:gse1', '[`GSE999`](https://example.test)')).toBe('GSE999');
  });

  /*
   * The reason this function exists. `db:add` mints an id from the first accession found
   * anywhere in the joined cells, so a row whose Data column has no accession is named
   * after one merely MENTIONED in its Description. Resolving a member by id would then
   * point an agent at a row that is not the deposit it asked for.
   */
  it('does not claim an accession the row only mentions', () => {
    expect(rowDepositAccession('ds:prjeb41939', 'unavailable')).toBe('PRJEB41939');
    expect(rowDepositAccession('ds:prjna726590', 'none named')).toBe('PRJNA726590');
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
      expect(r.subseries.map((s) => s.accession))
        .not.toContain(rowDepositAccession(r.id, r.columns.Data ?? ''));
    }
  });

  /*
   * Resolution must be a pure function of repo state. GSE158430 has three rows and
   * PRJNA527944 two, so a map built from the raw NDJSON would be last-write-wins over an
   * unordered list — and since db:add assigns a GLOBAL MAX(ordinal)+1, adding an unrelated
   * row on any page could flip which species row a member pointed at between builds.
   *
   * Asserted as a property of the emitted order rather than by rebuilding: every resolved
   * id must be the CANONICALLY FIRST row claiming that accession. That pins the same
   * guarantee without parsing all 17 pages a second time.
   */
  it('resolves a shared accession to the canonically first row claiming it', () => {
    const firstClaimant = new Map<string, string>();
    for (const r of inventory) {
      const acc = rowDepositAccession(r.id, r.columns.Data ?? '');
      if (!firstClaimant.has(acc)) firstClaimant.set(acc, r.id);
    }
    // The corpus really does have accessions claimed by several rows, or this proves nothing.
    const counts = new Map<string, number>();
    for (const r of inventory) {
      const acc = rowDepositAccession(r.id, r.columns.Data ?? '');
      counts.set(acc, (counts.get(acc) ?? 0) + 1);
    }
    expect([...counts.values()].some((n) => n > 1)).toBe(true);

    for (const r of inventory) {
      for (const s of r.subseries) {
        if (s.id !== null) expect(s.id).toBe(firstClaimant.get(s.accession));
      }
    }
  });

  // A row whose Data column carries no accession is named after one its Description merely
  // mentions. It must never be handed back as the catalogue entry for that accession.
  it('does not resolve a member to a row that only mentions the accession', () => {
    const mentionOnly = inventory.filter((r) => {
      const data = r.columns.Data ?? '';
      return !/GSE\d+|PRJ[A-Z]+\d+|SRP\d+|E-MTAB-\d+|CRA\d+|PXD\d+/i.test(data)
        && /^ds:(gse|prj|srp|e-mtab|cra|pxd)/i.test(r.id);
    });
    expect(mentionOnly.length).toBeGreaterThan(0); // the corpus really does contain these
    const resolvedIds = new Set(inventory.flatMap((r) => r.subseries.map((s) => s.id)));
    for (const r of mentionOnly) expect(resolvedIds.has(r.id)).toBe(false);
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
    const accessions = new Set(inventory.map((r) => rowDepositAccession(r.id, r.columns.Data ?? '')));
    for (const a of ['GSE173196', 'GSE173198', 'GSE262675', 'GSE262757', 'GSE290556', 'GSE206911', 'GSE206913']) {
      expect(accessions.has(a)).toBe(true);
    }
  });
});
