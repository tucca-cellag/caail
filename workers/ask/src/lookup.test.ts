/**
 * The exact-match boost, both directions: what a question names is found, and
 * what it does not name is not.
 */
import { describe, expect, it } from 'vitest';
import { buildLookup, type LookupFiles } from './lookup.ts';
import { MAX_NAMED_FETCHED } from './settings.ts';
import { fastestRun } from './test-env.ts';

const FILES: LookupFiles = {
  catalog: {
    software: [
      { itemId: 'sw:alphafold', name: 'AlphaFold', doi: '10.1038/s41586-021-03819-2' },
      { itemId: 'sw:ax', name: 'Ax', doi: null },
      { itemId: 'sw:gnps', name: 'GNPS', doi: null },
      { itemId: 'sw:open-problems', name: 'Open Problems', doi: null },
      { itemId: 'sw:virtual-lab', name: 'Virtual Lab', doi: null },
    ],
    databases: [
      { itemId: 'db:gnps', name: 'GNPS', doi: null },
      { itemId: 'db:string', name: 'STRING', doi: '10.1093/NAR/GKAC1000' },
      { itemId: 'db:pride', name: 'PRIDE', doi: null },
      { itemId: 'db:paren', name: 'A database whose DOI ends in a parenthesis', doi: '10.1234/vol(12)' },
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
  taxonomy: { definitions: { 'Deep Learning': 'A definition.' } },
};

const lookup = buildLookup(FILES);

describe('finds what a question names', () => {
  it.each([
    ['a DOI, in any case and inside a URL', 'What cites https://doi.org/10.1016/J.SCITOTENV.2023.164988?', ['paper:1']],
    ['a DOI with a sentence after it', 'Is 10.1093/nar/gkac1000. indexed?', ['db:string']],
    ['a paper DOI an inventory row names', 'data for 10.1038/s43016-022-00658-w', ['ds:gse169291']],
    // Typographic punctuation ends a DOI, so a DOI in curly quotes, before an
    // apostrophe or in full-width brackets is still found. Escaped so the
    // source shows which character.
    ['a DOI in curly quotes', 'Is “10.1038/s43016-022-00658-w” here?', ['ds:gse169291']],
    // Where a DOI can start: after a space, a bracket, a quote or a colon.
    ['a DOI after a space', 'about 10.1038/s43016-022-00658-w', ['ds:gse169291']],
    ['a DOI after an opening parenthesis', 'about (10.1038/s43016-022-00658-w)', ['ds:gse169291']],
    ['a DOI after an opening curly quote', '“10.1038/s43016-022-00658-w', ['ds:gse169291']],
    ['a DOI after doi:', 'doi:10.1038/s43016-022-00658-w', ['ds:gse169291']],
    ['a DOI before a curly apostrophe', '10.1038/s43016-022-00658-w’s data', ['ds:gse169291']],
    ['a DOI in full-width brackets', '「10.1038/s43016-022-00658-w」（论文）', ['ds:gse169291']],
    ['a DOI before an ellipsis', 'and 10.1038/s43016-022-00658-w…', ['ds:gse169291']],
    // A DOI may end in a closing parenthesis; the trailing strip is applied to
    // the catalogued DOI too, so it still matches, bare or in brackets.
    ['a DOI that ends in a closing parenthesis', 'what is 10.1234/vol(12)?', ['db:paren']],
    ['the same DOI in parentheses', 'see (10.1234/vol(12)).', ['db:paren']],
    ['the same DOI in curly quotes', '“10.1234/vol(12)”', ['db:paren']],
    ['a data DOI', 'what is 10.5281/zenodo.42', ['ds:sra051669']],
    ['an on-request study by its DOI', 'is 10.1016/j.ygeno.2024.110903 here', ['onrequest:10.1016/j.ygeno.2024.110903']],
    ['an accession, in any case', 'what is gse169291?', ['ds:gse169291']],
    ['an accession with a version suffix', 'SRA051669.1 and SRA051669.2', ['ds:sra051669']],
    ['an entry accession', 'Where is PRJNA123456 described?', ['ds:cattlegtex']],
    ['a SubSeries accession, as its SuperSeries row', 'Which dataset holds GSE158414?', ['ds:gse158430']],
    ['a SubSeries with a row of its own, that row first', 'Which dataset holds GSE173196?', ['ds:gse173196', 'ds:gse158430']],
    ['a name as catalogued', 'how does AlphaFold work', ['sw:alphafold']],
    ['an all-capitals name as catalogued', 'Is STRING useful for protein interactions?', ['db:string']],
    ['a two-word name as catalogued', 'Has Open Problems benchmarked this?', ['sw:open-problems']],
    ['a name with punctuation round it', 'What does "Virtual Lab" do?', ['sw:virtual-lab']],
    ['a name dual-listed in two files', 'Is GNPS a database?', ['sw:gnps', 'db:gnps']],
    ['a short name, as an exact word', 'Can Ax run Bayesian optimization?', ['sw:ax']],
    ['a title as catalogued', 'Summarize "Toward sustainable culture media".', ['paper:1']],
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

describe('knows the corpus the files hold', () => {
  it.each([['sw:alphafold'], ['paper:1'], ['ds:gse169291'], ['onrequest:10.1016/j.ygeno.2024.110903'], ['report:gfi-2026'], ['term:deep-learning']])(
    'knows %s',
    (id) => {
      expect(lookup.knows(id)).toBe(true);
    },
  );

  it.each([['sw:removed'], ['paper:2'], ['term:scaffolding'], ['corpus']])('does not know %s', (id) => {
    expect(lookup.knows(id)).toBe(false);
  });
});

describe('finds nothing a question does not name', () => {
  // Names match only as catalogued, case and whole words, because many are
  // ordinary words in another case. Each of these questions uses one of the
  // fixture's names as an ordinary word.
  it.each([
    ['a name in another case', 'how does alphafold work'],
    ['an all-capitals name written as an ordinary word', 'which string of tools optimizes media?'],
    ['a two-word name written as an ordinary phrase', 'what are the open problems in scaffolding?'],
    ['a two-word name in another case', 'can a virtual lab replace bench work?'],
    ['an all-capitals name written as an ordinary word, capitalised', 'Pride in the work is not a dataset.'],
    ['a title in another case', 'Summarize "Toward Sustainable Culture Media".'],
    ['a name inside another word', 'alphafolding proteins'],
    ['a short name in another case', 'an ax to grind'],
    ['a short name inside another word', 'the Axolotl genome'],
    ['a DOI prefix only', 'anything under 10.1038/s41586'],
    // A DOI starts only where one can: never inside another token.
    ['a DOI inside a longer token', 'see v210.1038/s43016-022-00658-w'],
    ['a DOI after a dot inside a token', 'see ref.10.1038/s43016-022-00658-w'],
    ['a DOI after an underscore', 'see file_10.1038/s43016-022-00658-w'],
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
    const { result: found, ms } = fastestRun(() => lookup.match(`What is ${token}?`), BUDGET_MS);

    expect(found).toEqual([]);
    expect(ms, `matching took ${ms.toFixed(0)} ms`).toBeLessThan(BUDGET_MS);
  });

  // Name matching scales with the question, not with names × question: a corpus
  // grown many times over still answers a long question in milliseconds.
  it('matches names in time that does not grow with the number of names', () => {
    const names = 20_000;
    const many = buildLookup({
      ...FILES,
      catalog: {
        software: Array.from({ length: names }, (_, i) => ({ itemId: `sw:t${i}`, name: `Toolname${i} Suite`, doi: null })),
        databases: [],
      },
    });
    const filler = Array.from({ length: 8_000 }, (_, i) => `word${i % 97}`).join(' ');
    const question = `${filler} Toolname123 Suite ${filler}`;

    const { result: found, ms } = fastestRun(() => many.match(question), BUDGET_MS / 2);

    expect(found).toEqual(['sw:t123']);
    expect(ms, `matching took ${ms.toFixed(0)} ms`).toBeLessThan(BUDGET_MS / 2);
  });

  it('still strips the punctuation a sentence puts after an identifier', () => {
    expect(lookup.match('See (10.1093/nar/gkac1000).')).toEqual(['db:string']);
    expect(lookup.match('Is it GSE169291)?!')).toEqual(['ds:gse169291']);
  });
});

// Finding stops at the bound, so the ids returned must be the first ones of the
// full ranking: identifiers before names wherever they sit in the question, and
// longer names before shorter ones, however late they are written.
it('returns the first MAX_NAMED_FETCHED ids of the full ranking when a question names more', () => {
  const count = MAX_NAMED_FETCHED + 4;
  const tools = Array.from({ length: count }, (_, i) => ({ itemId: `sw:len-${i}`, name: `Name${'x'.repeat(i)}`, doi: null }));
  const many = buildLookup({ ...FILES, catalog: { software: tools, databases: [] } });
  // Shortest name first, the identifiers last.
  const question = `${tools.map((tool) => tool.name).join(' ')} 10.1038/s43016-022-00658-w PRJNA123456`;
  const ranked = ['ds:gse169291', 'ds:cattlegtex', ...[...tools].reverse().map((tool) => tool.itemId)];

  expect(many.match(question)).toEqual(ranked.slice(0, MAX_NAMED_FETCHED));
});

// The lookup bounds what one question fetches from the index; retrieval, not the
// lookup, keeps MAX_NAMED of what the index holds (retrieval.test.ts).
it('returns at most MAX_NAMED_FETCHED ids, however many entries a question names', () => {
  const count = MAX_NAMED_FETCHED + 5;
  const many: LookupFiles = {
    ...FILES,
    catalog: {
      software: Array.from({ length: count }, (_, i) => ({ itemId: `sw:tool-${i}`, name: `Toolname${i}`, doi: null })),
      databases: [],
    },
  };
  const question = Array.from({ length: count }, (_, i) => `Toolname${i}`).join(' ');
  expect(buildLookup(many).match(question), 'ids returned').toHaveLength(MAX_NAMED_FETCHED);
});
