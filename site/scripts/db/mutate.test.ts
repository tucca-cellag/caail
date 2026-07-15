/**
 * mutate.test.ts — the ergonomic add/remove layer, exercised end-to-end for every
 * content type: addItem assigns a frozen id and inserts correctly, the result
 * round-trips through emit + the real parser and stays lint-green, removeItem
 * deletes cleanly (paper ids retired), and bad input is rejected.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPapersModel } from '../parser/papers.js';
import { lint } from '../parser/lint.js';
import { parseCatalogFile } from '../parser/catalog.js';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { extractInventory } from './extract.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage } from './emit.js';
import { addItem, removeItem } from './mutate.js';

const TMP = mkdtempSync(join(tmpdir(), 'caail-mutate-test-'));
const anyMethod = (db: Db) => (db.prepare('SELECT label FROM methods ORDER BY ordinal LIMIT 1').get() as any).label;
const anyArea = (db: Db) => (db.prepare('SELECT label FROM areas ORDER BY ordinal LIMIT 1').get() as any).label;
const emitPapers = (db: Db, name: string) => {
  const p = join(TMP, name);
  writeFileSync(p, emitPapersFile(db, join(REPO_ROOT, 'Papers.md')));
  return buildPapersModel(p);
};

describe('addItem — paper', () => {
  it('assigns the next ref id, wires a matrix cell, round-trips reachable + lint-green', () => {
    const db = importNdjson();
    const expected = (db.prepare('SELECT MAX(ref_id) m FROM papers').get() as any).m + 1;
    const id = addItem(db, {
      type: 'paper',
      raw: 'Tester, T. (2099). A synthetic add. *Journal of Tests, 1*(1), 1-2. https://doi.org/10.9999/add',
      label: 'Tester 2099',
      cells: [{ method: anyMethod(db), area: anyArea(db) }],
    });
    expect(id).toBe(`paper:${expected}`);
    const model = emitPapers(db, 'paper-add.md');
    expect(model.references.some((r) => r.id === expected)).toBe(true);
    expect(model.cells.some((c) => c.refIds.includes(expected))).toBe(true);
    expect(lint(model).errors).toEqual([]);
  });

  it('adds the <a id> anchor when the raw citation omits it', () => {
    const db = importNdjson();
    const id = addItem(db, { type: 'paper', raw: 'No, Anchor. (2099). X. *J*. https://doi.org/10.9/x', label: 'No 2099', cells: [{ method: anyMethod(db), area: anyArea(db) }] });
    const raw = (db.prepare('SELECT raw FROM papers WHERE item_id=?').get(id) as any).raw;
    expect(raw).toMatch(/^<a id="\d+">\d+<\/a> No, Anchor\./);
  });
  it('does not add a SECOND anchor to a raw already anchored with odd whitespace (C4)', () => {
    const db = importNdjson();
    const id = addItem(db, { type: 'paper', raw: '<a  id="999">999</a> Weird, W. (2099). X. *J*.', label: 'Weird 2099', cells: [{ method: anyMethod(db), area: anyArea(db) }] });
    const raw = (db.prepare('SELECT raw FROM papers WHERE item_id=?').get(id) as any).raw;
    expect((raw.match(/<a\s+id=/g) ?? []).length).toBe(1); // exactly one anchor, not two
  });
  it('accepts extra blockquote labels beyond Code/Data (e.g. Models) (C4)', () => {
    const db = importNdjson();
    const id = addItem(db, {
      type: 'paper', raw: 'Mod, M. (2099). X. *J*.', label: 'Mod 2099',
      codeUrl: 'https://github.com/x/y', blockquotes: ['> **Models**: https://hf.co/x/model'],
      cells: [{ method: anyMethod(db), area: anyArea(db) }],
    });
    const bq = (db.prepare('SELECT blockquotes_md FROM papers WHERE item_id=?').get(id) as any).blockquotes_md as string;
    expect(bq).toContain('> **Code**: https://github.com/x/y');
    expect(bq).toContain('> **Models**: https://hf.co/x/model');
  });
});

describe.each([
  ['software', 'sw', 'Software.md'] as const,
  ['database', 'db', 'Databases.md'] as const,
])('addItem — %s', (type, prefix, file) => {
  it('assigns a frozen slug and round-trips as a parsed entry', () => {
    const db = importNdjson();
    const group = (db.prepare('SELECT grp FROM catalog WHERE item_id IN (SELECT id FROM items WHERE type=?) LIMIT 1').get(type) as any).grp;
    const id = addItem(db, { type, name: 'ZzTestTool', url: 'https://example.org/zztest', group, body: 'Summary: A synthetic catalog entry for testing.' });
    expect(id).toBe(`${prefix}:zztesttool`);
    const path = join(TMP, `${type}.md`);
    writeFileSync(path, emitCatalogFile(db, join(REPO_ROOT, file), type));
    const entry = parseCatalogFile(path, file).find((e) => e.url === 'https://example.org/zztest');
    expect(entry?.name).toBe('ZzTestTool');
    expect(entry?.group).toBe(group);
  });

  it('disambiguates a colliding slug with -2', () => {
    const db = importNdjson();
    const group = (db.prepare('SELECT grp FROM catalog WHERE item_id IN (SELECT id FROM items WHERE type=?) LIMIT 1').get(type) as any).grp;
    addItem(db, { type, name: 'DupName', url: 'https://example.org/a', group, body: 'Summary: a.' });
    const second = addItem(db, { type, name: 'DupName', url: 'https://example.org/b', group, body: 'Summary: b.' });
    expect(second).toBe(`${prefix}:dupname-2`);
  });

  it('disambiguates a THIRD collision with -3 (no UNIQUE crash on an existing -2)', () => {
    const db = importNdjson();
    const group = (db.prepare('SELECT grp FROM catalog WHERE item_id IN (SELECT id FROM items WHERE type=?) LIMIT 1').get(type) as any).grp;
    addItem(db, { type, name: 'TripName', url: 'https://example.org/1', group, body: 'Summary: 1.' });
    addItem(db, { type, name: 'TripName', url: 'https://example.org/2', group, body: 'Summary: 2.' });
    const third = addItem(db, { type, name: 'TripName', url: 'https://example.org/3', group, body: 'Summary: 3.' });
    expect(third).toBe(`${prefix}:tripname-3`);
  });
});

describe('addItem — dataset', () => {
  it('promotes a row with a stable ds: id and round-trips into the inventory', () => {
    const db = importNdjson();
    const page = (db.prepare('SELECT page FROM dataset_rows LIMIT 1').get() as any).page;
    const header = extractInventory(join(REPO_ROOT, 'Datasets', `${page}.md`))!.header;
    const cells = header.map((_, i) => (i === 0 ? 'Synthetic test study GSE999999' : `c${i}`));
    const id = addItem(db, { type: 'dataset', page, cells });
    expect(id).toBe('ds:gse999999');
    const path = join(TMP, `${page}.md`);
    writeFileSync(path, emitDatasetPage(db, join(REPO_ROOT, 'Datasets', `${page}.md`), page));
    expect(extractInventory(path)!.rows.some((r) => r.join(' ').includes('GSE999999'))).toBe(true);
  });
});

describe('addItem — validation', () => {
  it('rejects an unknown matrix method', () => {
    const db = importNdjson();
    expect(() => addItem(db, { type: 'paper', raw: 'X. (2099). Y. *J*.', label: 'X 2099', cells: [{ method: 'Nonexistent Method', area: anyArea(db) }] }))
      .toThrow(/no matrix method/);
  });
  it('rejects an unknown topic', () => {
    const db = importNdjson();
    expect(() => addItem(db, { type: 'software', name: 'T', url: 'u', group: 'g', body: 'b', topics: ['no-such-topic'] }))
      .toThrow(/unknown topic/);
  });
  it('rejects a paper in an unknown section (C3-2: would be dropped on emit)', () => {
    const db = importNdjson();
    expect(() => addItem(db, { type: 'paper', raw: 'X. (2099). Y. *J*.', label: 'X 2099', section: 'Totally New Section', cells: [{ method: anyMethod(db), area: anyArea(db) }] }))
      .toThrow(/unknown paper section/);
  });
});

describe('removeItem', () => {
  it('removes a software entry cleanly and stays lint-green', () => {
    const db = importNdjson();
    const id = addItem(db, { type: 'software', name: 'RemoveMe', url: 'https://example.org/rm', group: (db.prepare("SELECT grp FROM catalog LIMIT 1").get() as any).grp, body: 'Summary: x.' });
    removeItem(db, id);
    expect(db.prepare('SELECT 1 FROM items WHERE id=?').get(id)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM catalog WHERE item_id=?').get(id)).toBeUndefined();
  });

  it('retires a paper id: item, detail, and matrix cells all removed', () => {
    const db = importNdjson();
    const id = addItem(db, { type: 'paper', raw: 'Gone, G. (2099). Z. *J*. https://doi.org/10.9/z', label: 'Gone 2099', cells: [{ method: anyMethod(db), area: anyArea(db) }] });
    const refId = (db.prepare('SELECT ref_id FROM papers WHERE item_id=?').get(id) as any).ref_id;
    removeItem(db, id);
    expect(db.prepare('SELECT 1 FROM items WHERE id=?').get(id)).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM papers WHERE ref_id=?').get(refId)).toBeUndefined();
    expect(db.prepare('SELECT COUNT(*) n FROM matrix_cells WHERE ref_id=?').get(refId) as any).toMatchObject({ n: 0 });
    expect(lint(emitPapers(db, 'paper-remove.md')).errors).toEqual([]);
  });

  it('throws on an unknown id', () => {
    expect(() => removeItem(importNdjson(), 'sw:does-not-exist')).toThrow(/no item/);
  });

  it('refuses to remove a topic theme with child fine-tags, leaving no partial state (C3-4)', () => {
    const db = importNdjson();
    const taggings = (db.prepare("SELECT COUNT(*) n FROM item_topics WHERE topic_id='topic:ai-methods-tooling'").get() as any).n;
    expect(() => removeItem(db, 'topic:ai-methods-tooling')).toThrow(/child fine-tag/);
    // the guard fires before any delete — theme + its taggings are intact
    expect(db.prepare("SELECT 1 FROM topics WHERE item_id='topic:ai-methods-tooling'").get()).toBeTruthy();
    expect((db.prepare("SELECT COUNT(*) n FROM item_topics WHERE topic_id='topic:ai-methods-tooling'").get() as any).n).toBe(taggings);
  });

  it('bootstrap preserves the retired tombstone across a re-derive (C2-2)', async () => {
    const { openDb, exportNdjson } = await import('./lib.js');
    const { preserveRetiredPaperIds } = await import('./bootstrap.js');
    // Remove a paper in one DB and export the tombstone to a scratch dir.
    const a = importNdjson();
    const cells = [{ method: anyMethod(a), area: anyArea(a) }];
    const id = addItem(a, { type: 'paper', raw: 'Bye, B. (2099). C. *J*. https://doi.org/10.9/c', label: 'Bye 2099', cells });
    const ref = (a.prepare('SELECT ref_id FROM papers WHERE item_id=?').get(id) as any).ref_id;
    removeItem(a, id);
    const scratch = mkdtempSync(join(tmpdir(), 'caail-retired-'));
    exportNdjson(a, scratch);
    // A FRESH DB (as a re-bootstrap would build) has no tombstone until we fold it back.
    const fresh = openDb();
    expect((fresh.prepare('SELECT COUNT(*) n FROM retired_paper_ids').get() as any).n).toBe(0);
    const n = preserveRetiredPaperIds(fresh, scratch);
    expect(n).toBeGreaterThan(0);
    expect(fresh.prepare('SELECT 1 FROM retired_paper_ids WHERE ref_id=?').get(ref)).toBeTruthy();
  });

  it('retires a paper ref_id so a later add NEVER reuses it', () => {
    const db = importNdjson();
    const cells = [{ method: anyMethod(db), area: anyArea(db) }];
    // Add a paper (takes the current max+1), then remove it.
    const first = addItem(db, { type: 'paper', raw: 'One, O. (2099). A. *J*. https://doi.org/10.9/1', label: 'One 2099', cells });
    const firstRef = (db.prepare('SELECT ref_id FROM papers WHERE item_id=?').get(first) as any).ref_id;
    removeItem(db, first);
    expect(db.prepare('SELECT 1 FROM retired_paper_ids WHERE ref_id=?').get(firstRef)).toBeTruthy();
    // The next add must skip the freed number, not reuse it.
    const second = addItem(db, { type: 'paper', raw: 'Two, T. (2099). B. *J*. https://doi.org/10.9/2', label: 'Two 2099', cells });
    const secondRef = (db.prepare('SELECT ref_id FROM papers WHERE item_id=?').get(second) as any).ref_id;
    expect(secondRef).toBeGreaterThan(firstRef);
    expect(second).not.toBe(first);
  });
});
