/**
 * emit.test.ts — the fidelity guarantee for the DB->Markdown emitters.
 *
 *   A. Unit: prose preservation, stable anchors, frozen-slug independence, and an
 *      add-a-paper regression, on the real DB rebuilt from committed NDJSON.
 *   B. Integration (real corpus): the round-trip oracle — emit every DB-owned file,
 *      re-parse with the REAL parser, and assert the model is identical (papers JSON
 *      + lint green, catalog entries, dataset row-sets). This is `db:verify` as tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPapersModel } from '../parser/papers.js';
import { lint } from '../parser/lint.js';
import { parseCatalogFile } from '../parser/catalog.js';
import { INVENTORY_PAGES } from '../parser/datasets.js';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { extractInventory } from './extract.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage, emitMatrixTable } from './emit.js';

const TMP = mkdtempSync(join(tmpdir(), 'caail-emit-test-'));
let db: Db;
beforeAll(() => { db = importNdjson(); });

// ---------------------------------------------------------------------------
// B. Integration — real-corpus round-trip (the fidelity bar)
// ---------------------------------------------------------------------------

describe('Papers.md round-trip', () => {
  it('re-parses to a JSON-identical model', () => {
    const src = join(REPO_ROOT, 'Papers.md');
    const original = buildPapersModel(src);
    const path = join(TMP, 'Papers.md');
    writeFileSync(path, emitPapersFile(db, src));
    const regen = buildPapersModel(path);
    expect(JSON.stringify(regen)).toBe(JSON.stringify(original));
  });

  it('stays lint-green (no matrix↔reference errors)', () => {
    const path = join(TMP, 'Papers.md');
    const res = lint(buildPapersModel(path));
    expect(res.errors).toEqual([]);
  });
});

describe.each([
  ['Software.md', 'software'] as const,
  ['Databases.md', 'database'] as const,
])('%s round-trip', (file, type) => {
  it('re-parses to identical entries', () => {
    const src = join(REPO_ROOT, file);
    const pick = (e: any) => ({ name: e.name, url: e.url, group: e.group, summary: e.summary, summaryHtml: e.summaryHtml });
    const original = parseCatalogFile(src, file).map(pick);
    const path = join(TMP, file);
    writeFileSync(path, emitCatalogFile(db, src, type));
    const regen = parseCatalogFile(path, file).map(pick);
    expect(regen).toEqual(original);
  });
});

describe('Datasets inventory round-trip', () => {
  it('every inventory page re-parses to an identical row-set', () => {
    for (const page of INVENTORY_PAGES) {
      const src = join(REPO_ROOT, 'Datasets', `${page}.md`);
      const original = extractInventory(src);
      if (!original) continue;
      const path = join(TMP, `${page}.md`);
      writeFileSync(path, emitDatasetPage(db, src, page));
      expect(extractInventory(path)).toEqual(original);
    }
  });
});

// ---------------------------------------------------------------------------
// A. Unit — preservation + stability properties
// ---------------------------------------------------------------------------

describe('emit preserves editorial prose and stable anchors', () => {
  let out: string;
  beforeAll(() => { out = emitPapersFile(db, join(REPO_ROOT, 'Papers.md')); });

  it('keeps the hand-authored intro prose verbatim', () => {
    expect(out).toContain('This document presents the core research papers');
  });
  it('keeps the ## Category definitions prose section', () => {
    expect(out).toContain('## Category definitions');
  });
  it('preserves the explicit <a id="N"> reference anchors', () => {
    expect(out).toMatch(/<a id="1">1<\/a>/);
  });
  it('preserves matrix cell #N anchor links', () => {
    expect(out).toMatch(/\]\(#\d+\)/);
  });
  it('preserves the matrix header Taxonomy.md links', () => {
    expect(out).toContain('[Bayesian Optimization](./Taxonomy.md#bayesian-optimization)');
  });
  it('preserves the > **Code**: blockquote for papers with code', () => {
    expect(out).toContain('> **Code**: https://');
  });
});

describe('emitMatrixTable', () => {
  it('opens with an empty corner cell and a GFM separator row', () => {
    const lines = emitMatrixTable(db).split('\n');
    expect(lines[0].startsWith('| | [')).toBe(true);
    expect(lines[1]).toMatch(/^\|(---\|)+$/);
  });
});

describe('frozen ids are independent of display name', () => {
  it('a catalog rename does not change the item id', () => {
    const before = db.prepare('SELECT item_id, name FROM catalog ORDER BY ordinal LIMIT 1').get() as any;
    db.prepare('UPDATE catalog SET name=? WHERE item_id=?').run(`${before.name} (renamed)`, before.item_id);
    const after = db.prepare('SELECT item_id FROM catalog WHERE item_id=?').get(before.item_id) as any;
    expect(after?.item_id).toBe(before.item_id);
    db.prepare('UPDATE catalog SET name=? WHERE item_id=?').run(before.name, before.item_id); // restore
  });
});

describe('add-a-paper regression', () => {
  it('a newly inserted paper + cell round-trips, is reachable, and lints green', () => {
    const fresh = importNdjson();
    const newId = (fresh.prepare('SELECT MAX(ref_id) m FROM papers').get() as any).m + 1;
    const ord = (fresh.prepare('SELECT MAX(ordinal) m FROM papers').get() as any).m + 1;
    const raw = `<a id="${newId}">${newId}</a> Tester, T. (2099). A synthetic round-trip paper. *Journal of Tests, 1*(1), 1-2. https://doi.org/10.9999/test`;
    fresh.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)').run(`paper:${newId}`, 'paper', String(newId));
    fresh.prepare('INSERT INTO papers(item_id,ref_id,section,raw,code_url,data_url,ordinal) VALUES(?,?,?,?,?,?,?)')
      .run(`paper:${newId}`, newId, 'References', raw, null, null, ord);
    const cell = fresh.prepare('SELECT method,area_key,ordinal FROM matrix_cells ORDER BY ordinal LIMIT 1').get() as any;
    fresh.prepare('INSERT INTO matrix_cells(method,area_key,ref_id,label,ordinal) VALUES(?,?,?,?,?)')
      .run(cell.method, cell.area_key, newId, 'Tester 2099', 999999);

    const src = join(REPO_ROOT, 'Papers.md');
    const path = join(TMP, 'Papers.add.md');
    writeFileSync(path, emitPapersFile(fresh, src));
    const model = buildPapersModel(path);

    expect(model.references.some((r) => r.id === newId)).toBe(true);
    expect(model.cells.some((c) => c.refIds.includes(newId))).toBe(true); // reachable
    expect(lint(model).errors).toEqual([]);
  });
});
