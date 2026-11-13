/**
 * dataset-inventory.test.ts — the inventory rows served to agents, and the SuperSeries
 * membership folded onto them (tucca-cellag/caail-planning#226).
 *
 *   A. Unit: the two pure helpers behind the fold.
 *   B. Integration: the real corpus, including the query that used to return nothing.
 */

import { describe, it, expect, beforeAll, onTestFinished } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildDatasetInventory, parseSubseries, idAccession, readInventoryHeader, rowDepositAccession, rowLinks } from './dataset-inventory.js';
import { REPO_ROOT } from '../db/lib.js';
import type { DatasetInventoryRow } from './types.js';

describe('buildDatasetInventory refuses a stray inventory table (tucca-cellag/caail-planning#752)', () => {
  it('throws on a reference page carrying one, which pnpm parse would otherwise pass uncounted', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-inventory-stray-'));
    cpSync(join(REPO_ROOT, 'Datasets'), join(root, 'Datasets'), { recursive: true });
    expect(() => buildDatasetInventory(root)).not.toThrow();
    const page = join(root, 'Datasets', 'CrossSpecies.md');
    const table = '\n## Complete data inventory\n\n| Study | Paper | Data |\n| --- | --- | --- |\n| A hand-added row | x | supplementary |\n';
    writeFileSync(page, `${readFileSync(page, 'utf-8')}${table}`);
    expect(() => buildDatasetInventory(root)).toThrow(/pnpm parse: Datasets\/CrossSpecies\.md has a "## Complete data inventory" table/);
  });

  it('throws on an inventory page that defines a reference-link target, which a served cell could not resolve (tucca-cellag/caail-planning#348)', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-inventory-refdef-'));
    cpSync(join(REPO_ROOT, 'Datasets'), join(root, 'Datasets'), { recursive: true });
    expect(() => buildDatasetInventory(root)).not.toThrow();
    const page = join(root, 'Datasets', 'Cow.md');
    writeFileSync(page, `${readFileSync(page, 'utf-8')}\n[geo]: https://www.ncbi.nlm.nih.gov/geo/\n`);
    expect(() => buildDatasetInventory(root)).toThrow(/pnpm parse: Datasets\/Cow\.md defines \[geo\]:/);
    // A GFM footnote leaves the same gap.
    writeFileSync(page, `${readFileSync(join(REPO_ROOT, 'Datasets', 'Cow.md'), 'utf-8')}\n[^1]: Reads counted after QC.\n`);
    expect(() => buildDatasetInventory(root)).toThrow(/pnpm parse: Datasets\/Cow\.md defines \[\^1\]:/);
  });
});

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
    expect(rowDepositAccession('ds:prjna1', 'supplementary')).toBe('PRJNA1');
  });
});

describe('rowLinks (tucca-cellag/caail-planning#759)', () => {
  const PAREN_DOI = 'https://doi.org/10.1016/S0092-8674(20)30001-1';

  it('keeps a URL holding balanced parentheses whole, as a Markdown link target and as a bare URL', () => {
    expect(rowLinks([`[DOI](${PAREN_DOI})`])).toEqual([PAREN_DOI]);
    expect(rowLinks([`see ${PAREN_DOI} for the paper`])).toEqual([PAREN_DOI]);
    expect(rowLinks(['[Wiki](https://en.wikipedia.org/wiki/Foo_(bar))'])).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it("never swallows a Markdown link's closing paren, or the paren closing a bare URL's aside", () => {
    expect(rowLinks(['[GEO](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE1)'])).toEqual([
      'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE1',
    ]);
    expect(rowLinks([`[DOI](${PAREN_DOI}), then more`])).toEqual([PAREN_DOI]);
    expect(rowLinks(['(deposited at https://zenodo.org/records/1)'])).toEqual(['https://zenodo.org/records/1']);
    expect(rowLinks([`(see ${PAREN_DOI})`])).toEqual([PAREN_DOI]);
  });

  it('reads a bare URL where GFM autolinking ends it, as the rendered row shows it', () => {
    expect(rowLinks(['https://a.org/x(b c)'])).toEqual(['https://a.org/x(b']);
    expect(rowLinks(['see https://a.org/x(y.) here'])).toEqual(['https://a.org/x(y']);
    expect(rowLinks(['<https://a.org/x>'])).toEqual(['https://a.org/x']);
    expect(rowLinks([`Data at ${PAREN_DOI}.`, `[DOI](${PAREN_DOI})`, 'https://c.org/z;'])).toEqual([PAREN_DOI, 'https://c.org/z']);
  });

  it("keeps a link target whole however CommonMark reads it: nested parentheses, a SICI DOI's angle brackets", () => {
    expect(rowLinks(['[t](https://w.org/Foo_(bar_(baz)))'])).toEqual(['https://w.org/Foo_(bar_(baz))']);
    const sici = 'https://doi.org/10.1002/(SICI)1097-4636(199601)30:1<1::AID-JBM1>3.0.CO;2-#';
    expect(rowLinks([`[DOI](${sici})`])).toEqual([sici]);
  });

  it('reads a cell as the inline content of its table cell, so one opening with block syntax keeps its links', () => {
    expect(rowLinks(['<div>see [x](https://a.org/d)</div>'])).toEqual(['https://a.org/d']);
    expect(rowLinks(['<!-- c --> [x](https://c.org/y)'])).toEqual(['https://c.org/y']);
    expect(rowLinks(['[r]: https://def.org/x'])).toEqual(['https://def.org/x']);
    expect(rowLinks(['    https://ind.org/x'])).toEqual(['https://ind.org/x']);
  });

  it("serves an inline HTML anchor's href, and no URL the row does not write out in full", () => {
    expect(rowLinks(['<a href="https://h.org/x">x</a>'])).toEqual(['https://h.org/x']);
    // GFM links `www.` text as `http://www.…`, a scheme the row never wrote.
    expect(rowLinks(['www.example.org/x'])).toEqual([]);
  });

  it('keeps a link target written with an entity or a backslash escape, as the parser decodes it', () => {
    expect(rowLinks(['[x](https://a.org/?a=1&amp;b=2)'])).toEqual(['https://a.org/?a=1&b=2']);
    expect(rowLinks(['[x](https://a.org/x\\))'])).toEqual(['https://a.org/x)']);
    expect(rowLinks(['[x](http://www.a.org/?a=1&amp;b=2)'])).toEqual(['http://www.a.org/?a=1&b=2']);
  });

  it("serves only http(s) links: a repo-relative link is CAAIL's own page, not a URL the row writes out", () => {
    expect(rowLinks(['[Cow](./Cow.md) and [x](mailto:a@b.org) and [GEO](https://www.ncbi.nlm.nih.gov/geo/)'])).toEqual([
      'https://www.ncbi.nlm.nih.gov/geo/',
    ]);
  });
});

describe('a parenthesised DOI through the inventory build (tucca-cellag/caail-planning#759)', () => {
  it("serves a row's links whole, matching the paperDoi it reads from the same Paper cell", () => {
    const ndjson = mkdtempSync(join(tmpdir(), 'caail-inventory-paren-'));
    onTestFinished(() => rmSync(ndjson, { recursive: true, force: true }));
    cpSync(join(REPO_ROOT, 'site', 'db', 'ndjson'), ndjson, { recursive: true });
    const rowsPath = join(ndjson, 'dataset_rows.ndjson');
    const lines = readFileSync(rowsPath, 'utf-8').split('\n').filter(Boolean);
    // A Cow row, its Paper cell located by the page's own header; it becomes a parenthesised DOI.
    const read = readInventoryHeader('Cow', REPO_ROOT);
    if ('problem' in read) throw new Error(read.problem);
    const paper = read.header.indexOf('Paper');
    expect(paper).toBeGreaterThanOrEqual(0);
    const at = lines.findIndex((l) => (JSON.parse(l) as { page: string }).page === 'Cow');
    expect(at).toBeGreaterThanOrEqual(0);
    const row = JSON.parse(lines[at]!) as { item_id: string; cells_json: string };
    const cells = JSON.parse(row.cells_json) as string[];
    expect(cells).toHaveLength(read.header.length);
    cells[paper] = '[DOI](https://doi.org/10.1016/S0092-8674(20)30001-1)';
    lines[at] = JSON.stringify({ ...JSON.parse(lines[at]!), cells_json: JSON.stringify(cells) });
    writeFileSync(rowsPath, `${lines.join('\n')}\n`);

    const served = buildDatasetInventory(REPO_ROOT, ndjson).inventory.find((r) => r.id === row.item_id)!;
    expect(served.paperDoi).toBe('10.1016/s0092-8674(20)30001-1');
    expect(served.links).toContain('https://doi.org/10.1016/S0092-8674(20)30001-1');
    expect(served.links.some((u) => u.endsWith('S0092-8674(20'))).toBe(false);
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
   * Resolution must be a pure function of repo state. GSE158430 has three rows, so a map
   * built from the raw NDJSON would be last-write-wins over an
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
