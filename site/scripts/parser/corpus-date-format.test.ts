/**
 * What a corpus date dates, checked against what the corpus stamp actually hashes
 * (tucca-cellag/caail-planning#153). The stamp hashes every table in `TABLES_PK`, so the served
 * wording has to cover each one, or say why a table needs no word of its own.
 */

import { describe, expect, it } from 'vitest';

import { TABLES_PK } from '../db/lib.js';
import { CORPUS_DATE_COVERS, CORPUS_DATE_EXCLUDES } from './corpus-date-format.js';

/**
 * Each stamped table and the words in `CORPUS_DATE_COVERS` that cover it, or null with the reason
 * it needs none. A table added to `TABLES_PK` fails the first test until it is placed here, which is
 * the moment to decide whether the served wording still says what the date covers.
 */
const COVERAGE: Record<string, readonly string[] | { none: string }> = {
  items: { none: 'the id registry behind every record below' },
  papers: ['papers'],
  retired_paper_ids: { none: 'tombstones for retired paper ids, part of the papers' },
  areas: ['matrix axes'],
  methods: ['matrix axes'],
  matrix_cells: ['matrix axes'],
  catalog: ['software', 'databases'],
  dataset_rows: ['datasets'],
  dataset_entries: ['datasets'],
  datasets_on_request: ['datasets'],
  reports: ['field reports'],
  topics: ['topics'],
  item_topics: ['topics'],
  aliases: { none: 'alternative ids for the records above' },
};

describe('CORPUS_DATE_COVERS', () => {
  it('places every table the corpus stamp hashes, and no other', () => {
    expect(Object.keys(COVERAGE).sort()).toEqual(Object.keys(TABLES_PK).sort());
  });

  it('names a word for every table that needs one', () => {
    for (const [table, words] of Object.entries(COVERAGE)) {
      if (!Array.isArray(words)) continue;
      for (const word of words) expect(CORPUS_DATE_COVERS, `${table}: "${word}"`).toContain(word);
    }
  });

  it('names what it does not date', () => {
    expect(CORPUS_DATE_EXCLUDES).toMatch(/citation counts/);
    expect(CORPUS_DATE_EXCLUDES).toMatch(/taxonomy definitions/);
  });
});
