/**
 * subseries-seed.test.ts — the SuperSeries membership fold (CAAIL-258): curator-supplied
 * member accessions seeded onto dataset_rows from the committed subseries.json, keyed by
 * `ds:` id and stored bare + uppercase. The subseries analog of dois-seed.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, type Db } from './lib.js';
import { seedSubseries } from './seed.js';

/** A DB holding one inventory row, enough for the seeder's keyed UPDATE. */
function dbWithRow(id = 'ds:gse173199'): Db {
  const db = openDb();
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset',?)").run(id, id.slice(3));
  db.prepare('INSERT INTO dataset_rows(item_id,page,cells_json,ordinal) VALUES(?,?,?,0)')
    .run(id, 'Cow', '["a"]');
  return db;
}

function fileWith(datasets: Record<string, string[]>): string {
  const path = join(mkdtempSync(join(tmpdir(), 'caail-subseries-seed-')), 'subseries.json');
  writeFileSync(path, JSON.stringify({ datasets }));
  return path;
}

const stored = (db: Db, id: string): string | null =>
  (db.prepare('SELECT subseries FROM dataset_rows WHERE item_id=?').get(id) as { subseries: string | null }).subseries;

describe('seedSubseries', () => {
  it('stores members as a bare uppercase JSON array', () => {
    const db = dbWithRow();
    const n = seedSubseries(db, fileWith({ 'ds:gse173199': ['GSE173196', 'GSE173198'] }));
    expect(n.rows).toBe(1);
    expect(JSON.parse(stored(db, 'ds:gse173199')!)).toEqual(['GSE173196', 'GSE173198']);
  });

  it('normalises case and whitespace, and de-duplicates', () => {
    const db = dbWithRow();
    seedSubseries(db, fileWith({ 'ds:gse173199': [' gse173198 ', 'GSE173198', 'gse173196'] }));
    expect(JSON.parse(stored(db, 'ds:gse173199')!)).toEqual(['GSE173198', 'GSE173196']);
  });

  it('leaves a row with no entry NULL', () => {
    const db = dbWithRow();
    seedSubseries(db, fileWith({}));
    expect(stored(db, 'ds:gse173199')).toBeNull();
  });

  /*
   * An empty list used to be skipped silently. That is the worst possible handling: the
   * column stays NULL, and checkSubseries only inspects rows WHERE subseries IS NOT NULL,
   * so the one shape the guard explicitly rejects was the one shape nothing could observe.
   * A curator who typed the key and had not yet filled it in got a green build.
   */
  it('throws on an empty member list rather than silently recording nothing', () => {
    const db = dbWithRow();
    expect(() => seedSubseries(db, fileWith({ 'ds:gse173199': [] })))
      .toThrow(/no members/);
  });

  it('is idempotent', () => {
    const db = dbWithRow();
    const path = fileWith({ 'ds:gse173199': ['GSE173198'] });
    seedSubseries(db, path);
    const first = stored(db, 'ds:gse173199');
    seedSubseries(db, path);
    expect(stored(db, 'ds:gse173199')).toBe(first);
  });
});
