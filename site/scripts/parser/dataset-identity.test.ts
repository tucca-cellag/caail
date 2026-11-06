/**
 * dataset-identity.test.ts — the identity fields an inventory row carries so a consumer can
 * tell whether a find is already held without parsing Markdown cells
 * (tucca-cellag/caail-planning#367).
 *
 *   A. Unit: rowIdentity over every cell shape the Datasets/CLAUDE.md schema allows, and
 *      the ones it does not.
 *   B. Integration: the real corpus.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { rowIdentity, buildDatasetInventory } from './dataset-inventory.js';
import type { DatasetInventoryRow } from './types.js';

describe('rowIdentity: the Paper cell', () => {
  it('reads a journal DOI link as a bare lowercase DOI', () => {
    expect(rowIdentity({ Paper: '[DOI](https://doi.org/10.1038/S43016-022-00658-w)' }).paperDoi)
      .toBe('10.1038/s43016-022-00658-w');
  });

  it('reads a preprint DOI link the same way', () => {
    expect(rowIdentity({ Paper: '[preprint](https://doi.org/10.64898/2026.05.20.726299)' }).paperDoi)
      .toBe('10.64898/2026.05.20.726299');
  });

  it('never serves a data host\'s DOI as the paper', () => {
    expect(rowIdentity({
      Paper: '[preprint](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/X)',
    }).paperDoi).toBeNull();
    expect(rowIdentity({ Paper: '[DOI](https://doi.org/10.5281/zenodo.1)' }).paperDoi).toBeNull();
  });

  it('keeps a DOI that contains parentheses', () => {
    expect(rowIdentity({ Paper: '[DOI](https://doi.org/10.1016/S0092-8674(20)30001-1)' }).paperDoi)
      .toBe('10.1016/s0092-8674(20)30001-1');
  });

  it('gives no DOI for "none named", a non-DOI link, or a table with no Paper column', () => {
    expect(rowIdentity({ Paper: 'none named' }).paperDoi).toBeNull();
    expect(rowIdentity({ Paper: '[preprint](https://example.org/paper)' }).paperDoi).toBeNull();
    expect(rowIdentity({ Resource: 'x', Data: 'supplementary' }).paperDoi).toBeNull();
  });
});

describe('rowIdentity: the Data cell', () => {
  it('reads an accession badge as a deposit with its accession and link', () => {
    expect(rowIdentity({ Data: '[`GSE169291`](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE169291)' }))
      .toMatchObject({
        dataStatus: 'deposit',
        accession: 'GSE169291',
        dataUrl: 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE169291',
        dataDoi: null,
      });
  });

  it('keeps an accession the shared id pattern does not know', () => {
    // SRX is not in db/lib.ts's ACCESSION pattern; the badge is still the deposit's name.
    expect(rowIdentity({ Data: '[`SRX1674471`](https://www.ncbi.nlm.nih.gov/sra/?term=SRX1674471)' }).accession)
      .toBe('SRX1674471');
  });

  it('reads a named repository link as a deposit with no accession', () => {
    expect(rowIdentity({ Data: '[Zenodo](https://zenodo.org/records/16764338)' })).toMatchObject({
      dataStatus: 'deposit',
      accession: null,
      dataUrl: 'https://zenodo.org/records/16764338',
      dataDoi: null,
    });
  });

  it('takes a DOI only where the link states one, never derived from a record URL', () => {
    expect(rowIdentity({ Data: '[FigShare](https://doi.org/10.6084/m9.figshare.29551862)' }).dataDoi)
      .toBe('10.6084/m9.figshare.29551862');
    expect(rowIdentity({
      Data: '[Dataverse](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/XNFVTS)',
    }).dataDoi).toBe('10.7910/dvn/xnfvts');
    expect(rowIdentity({ Data: '[Mendeley](https://data.mendeley.com/datasets/cp2hdhkys3/6)' }).dataDoi).toBeNull();
    expect(rowIdentity({
      Data: '[Dataverse](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi%3A10.7910%2FDVN%2FXNFVTS)',
    }).dataDoi).toBe('10.7910/dvn/xnfvts');
  });

  it('serves a dataDoi only for a data host, never for a paper the Data cell links to', () => {
    expect(rowIdentity({ Data: '[Article](https://doi.org/10.1038/s41467-020-00001-1)' })).toMatchObject({
      dataStatus: 'deposit', dataUrl: 'https://doi.org/10.1038/s41467-020-00001-1', dataDoi: null,
    });
  });

  it('decodes a percent-encoded doi.org path once', () => {
    expect(rowIdentity({ Data: '[FigShare](https://doi.org/10.6084%2Fm9.figshare.1)' }).dataDoi)
      .toBe('10.6084/m9.figshare.1');
  });

  it('drops a trailing slash from a stated DOI', () => {
    expect(rowIdentity({ Data: '[Zenodo](https://doi.org/10.5281/zenodo.123/)' }).dataDoi).toBe('10.5281/zenodo.123');
  });

  it('ends a stated DOI at its query string or fragment', () => {
    expect(rowIdentity({ Data: '[Zenodo](https://doi.org/10.5281/zenodo.123?tab=files)' }).dataDoi)
      .toBe('10.5281/zenodo.123');
    expect(rowIdentity({ Data: '[Zenodo](https://doi.org/10.5281/zenodo.123#versions)' }).dataDoi)
      .toBe('10.5281/zenodo.123');
  });

  it('reads the two status words, with no accession, link or DOI', () => {
    for (const word of ['supplementary', 'unavailable'] as const) {
      expect(rowIdentity({ Data: word })).toEqual({
        paperDoi: null, dataStatus: word, accession: null, dataUrl: null, dataDoi: null,
      });
    }
  });

  it('degrades to nulls for a Data cell outside the schema rather than throwing', () => {
    // Enforcing the cell's shape is db:check's job (tucca-cellag/caail-planning#740); a throw here would take the
    // whole build down for a curation typo.
    expect(rowIdentity({ Data: 'see paper' })).toMatchObject({ dataStatus: null, accession: null, dataUrl: null });
    expect(rowIdentity({ Data: '' })).toMatchObject({ dataStatus: null });
  });

  it('gives all-null fields for a table with neither a Data nor a DOI / URL column', () => {
    expect(rowIdentity({ Resource: 'x', Scope: 'y' })).toEqual({
      paperDoi: null, dataStatus: null, accession: null, dataUrl: null, dataDoi: null,
    });
  });
});

describe('rowIdentity: the CrossSpecies DOI / URL cell', () => {
  it('reads a data-repository DOI as the deposit itself', () => {
    expect(rowIdentity({ 'DOI / URL': '[10.5281/zenodo.19339684](https://doi.org/10.5281/zenodo.19339684)' })).toEqual({
      paperDoi: null, dataStatus: 'deposit', accession: null,
      dataUrl: 'https://doi.org/10.5281/zenodo.19339684', dataDoi: '10.5281/zenodo.19339684',
    });
  });

  it('reads a journal DOI as the paper, with the deposit left unstated', () => {
    expect(rowIdentity({ 'DOI / URL': '[10.1186/s12915-019-0726-5](https://doi.org/10.1186/s12915-019-0726-5)' })).toEqual({
      paperDoi: '10.1186/s12915-019-0726-5', dataStatus: null, accession: null, dataUrl: null, dataDoi: null,
    });
  });

  it('reads a non-DOI link as where the data sit', () => {
    expect(rowIdentity({ 'DOI / URL': '[GitHub](https://github.com/sezinata/FoodML)' })).toEqual({
      paperDoi: null, dataStatus: 'deposit', accession: null, dataUrl: 'https://github.com/sezinata/FoodML', dataDoi: null,
    });
  });
});

describe('inventory identity — real corpus', () => {
  let rows: DatasetInventoryRow[];
  beforeAll(() => {
    rows = buildDatasetInventory().inventory;
  });

  it('gives every row with a Data column a status', () => {
    for (const r of rows.filter((x) => 'Data' in x.columns)) expect(r.dataStatus, r.id).not.toBeNull();
  });

  it('gives every row that names a paper a DOI, so a silent null cannot ship', () => {
    // Selects on what the cell says, not on the shapes the parser accepts: a Paper link in
    // any other form must fail here rather than drop out of the check.
    const named = rows.filter((x) => 'Paper' in x.columns && x.columns.Paper!.trim() !== 'none named');
    expect(named.length).toBeGreaterThan(150);
    for (const r of named) expect(r.paperDoi, `${r.id}: ${r.columns.Paper}`).not.toBeNull();
  });

  it('gives every CrossSpecies row a DOI or a data link from its DOI / URL cell', () => {
    for (const r of rows.filter((x) => 'DOI / URL' in x.columns)) {
      expect(r.paperDoi ?? r.dataUrl, r.id).not.toBeNull();
    }
  });

  it('gives every deposit row a link, and an accession or a DOI only alongside one', () => {
    for (const r of rows.filter((x) => x.dataStatus === 'deposit')) {
      expect(r.dataUrl, r.id).not.toBeNull();
    }
    for (const r of rows.filter((x) => x.dataStatus !== 'deposit')) {
      expect([r.accession, r.dataUrl, r.dataDoi], r.id).toEqual([null, null, null]);
    }
  });

  it('reads the Data column, not the id, for a row named after data it only mentions', () => {
    // ds:prjeb41939's Data cell reads "unavailable"; its id comes from reused data (tucca-cellag/caail-planning#715).
    const row = rows.find((r) => r.id === 'ds:prjeb41939');
    expect(row?.dataStatus).toBe('unavailable');
    expect(row?.accession).toBeNull();
  });

  it('serves a known accession and paper DOI on the row that holds them', () => {
    const row = rows.find((r) => r.id === 'ds:gse169291');
    expect(row).toMatchObject({ accession: 'GSE169291', paperDoi: '10.1038/s43016-022-00658-w' });
  });
});
