/**
 * The exact-match boost, both directions: what a question names is found, and
 * what it does not name is not.
 */
import { describe, expect, it } from 'vitest';
import { buildLookup, type LookupFiles } from './lookup.ts';
import { TOP_K } from './settings.ts';

const FILES: LookupFiles = {
  catalog: {
    software: [
      { itemId: 'sw:alphafold', name: 'AlphaFold', doi: '10.1038/s41586-021-03819-2' },
      { itemId: 'sw:ax', name: 'Ax', doi: null },
      { itemId: 'sw:gnps', name: 'GNPS', doi: null },
    ],
    databases: [
      { itemId: 'db:gnps', name: 'GNPS', doi: null },
      { itemId: 'db:string', name: 'STRING', doi: '10.1093/NAR/GKAC1000' },
    ],
  },
  papersIndex: {
    references: [{ id: 1, title: 'Toward sustainable culture media', doi: '10.1016/j.scitotenv.2023.164988' }],
  },
  datasets: {
    entries: [{ id: 'ds:cattlegtex', name: 'CattleGTEx', doi: null, accessions: ['PRJNA123456'] }],
    inventory: [
      { id: 'ds:gse169291', name: 'Spontaneous immortalization of chicken fibroblasts', accession: 'GSE169291', paperDoi: '10.1038/s43016-022-00658-w', dataDoi: null, subseries: [] },
      { id: 'ds:sra051669', name: 'A deposit with a versioned accession', accession: 'SRA051669.1', paperDoi: null, dataDoi: '10.5281/zenodo.42', subseries: [] },
      {
        id: 'ds:gse158430',
        name: 'A SuperSeries row',
        accession: 'GSE158430',
        paperDoi: null,
        dataDoi: null,
        subseries: [
          { accession: 'GSE158414', id: null },
          { accession: 'GSE173196', id: 'ds:gse173196' },
        ],
      },
      { id: 'ds:gse173196', name: 'A SubSeries with a row of its own', accession: 'GSE173196', paperDoi: null, dataDoi: null, subseries: [] },
    ],
    onRequest: [{ study: 'miR-10167-3p targets TCF7L1 (Hu et al. 2024)', paperDoi: '10.1016/j.ygeno.2024.110903' }],
  },
  reports: { reports: [{ id: 'report:gfi-2026', title: 'GFI State of the Industry: Cultivated Meat 2026' }] },
};

const lookup = buildLookup(FILES);

describe('finds what a question names', () => {
  it.each([
    ['a DOI, in any case and inside a URL', 'What cites https://doi.org/10.1016/J.SCITOTENV.2023.164988?', ['paper:1']],
    ['a DOI with a sentence after it', 'Is 10.1093/nar/gkac1000. indexed?', ['db:string']],
    ['a paper DOI an inventory row names', 'data for 10.1038/s43016-022-00658-w', ['ds:gse169291']],
    ['a data DOI', 'what is 10.5281/zenodo.42', ['ds:sra051669']],
    ['an on-request study by its DOI', 'is 10.1016/j.ygeno.2024.110903 here', ['onrequest:10.1016/j.ygeno.2024.110903']],
    ['an accession, in any case', 'what is gse169291?', ['ds:gse169291']],
    ['an accession with a version suffix', 'SRA051669.1 and SRA051669.2', ['ds:sra051669']],
    ['an entry accession', 'Where is PRJNA123456 described?', ['ds:cattlegtex']],
    ['a SubSeries accession, as its SuperSeries row', 'Which dataset holds GSE158414?', ['ds:gse158430']],
    ['a SubSeries with a row of its own, that row first', 'Which dataset holds GSE173196?', ['ds:gse173196', 'ds:gse158430']],
    ['a name, in any case', 'how does alphafold work', ['sw:alphafold']],
    ['a name dual-listed in two files', 'Is GNPS a database?', ['sw:gnps', 'db:gnps']],
    ['a short name, as an exact word', 'Can Ax run Bayesian optimization?', ['sw:ax']],
    ['a title', 'Summarize "Toward Sustainable Culture Media".', ['paper:1']],
    ['a report title', 'What does GFI State of the Industry: Cultivated Meat 2026 say?', ['report:gfi-2026']],
  ])('%s', (_label, question, expected) => {
    expect(lookup.match(question)).toEqual(expected);
  });

  // The id is the one catalog.json serves, whatever its form: nothing rebuilds it.
  it('returns a catalog entry under its served itemId', () => {
    const served = buildLookup({ ...FILES, catalog: { software: [{ itemId: 'sw:served-id', name: 'Servedname', doi: null }], databases: [] } });
    expect(served.match('What is Servedname?')).toEqual(['sw:served-id']);
  });

  it('ranks identifiers ahead of names', () => {
    expect(lookup.match('AlphaFold and GSE169291')).toEqual(['ds:gse169291', 'sw:alphafold']);
  });
});

describe('finds nothing a question does not name', () => {
  it.each([
    ['a name inside another word', 'alphafolding proteins'],
    ['a short name in another case', 'an ax to grind'],
    ['a short name inside another word', 'the Axolotl genome'],
    ['a DOI prefix only', 'anything under 10.1038/s41586'],
    ['an accession inside a longer token', 'GSE1692910 is not it'],
    ['an unrelated question', 'which tools optimize serum-free media?'],
    ['an empty question', ''],
  ])('%s', (_label, question) => {
    expect(lookup.match(question)).toEqual([]);
  });
});

/**
 * A question is read once, by every identifier rule, so each rule has to stay
 * linear in its length. The body cap bounds a question in bytes, not in words
 * (one "word" can fill the whole body), so these run well past that cap: a rule
 * that backtracks shows as seconds here, and a linear one as a few milliseconds.
 */
describe('stays linear on a pathological question', () => {
  const RUN = 50_000;
  const BUDGET_MS = 100;

  it.each([
    ['a long run of trailing punctuation, then a letter', `${'.'.repeat(RUN)}x`],
    ['the same run inside a DOI', `10.1234/${'.'.repeat(RUN)}x`],
    ['a long run of closing brackets, then a letter', `${')'.repeat(RUN)}x`],
    ['a long accession-shaped token with a version tail', `GSE${'1'.repeat(RUN)}.${'2'.repeat(RUN)}x`],
  ])('%s', (_label, token) => {
    const started = performance.now();
    const found = lookup.match(`What is ${token}?`);
    const elapsed = performance.now() - started;

    expect(found).toEqual([]);
    expect(elapsed, `matching took ${elapsed.toFixed(0)} ms`).toBeLessThan(BUDGET_MS);
  });

  it('still strips the punctuation a sentence puts after an identifier', () => {
    expect(lookup.match('See (10.1093/nar/gkac1000).')).toEqual(['db:string']);
    expect(lookup.match('Is it GSE169291)?!')).toEqual(['ds:gse169291']);
  });
});

it('returns at most TOP_K', () => {
  const many: LookupFiles = {
    ...FILES,
    catalog: {
      software: Array.from({ length: TOP_K + 5 }, (_, i) => ({ itemId: `sw:tool-${i}`, name: `Toolname${i}`, doi: null })),
      databases: [],
    },
  };
  const question = Array.from({ length: TOP_K + 5 }, (_, i) => `Toolname${i}`).join(' ');
  expect(buildLookup(many).match(question)).toHaveLength(TOP_K);
});
