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
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildPapersModel } from '../parser/papers.js';
import { lint } from '../parser/lint.js';
import { parseCatalogFile } from '../parser/catalog.js';
import { INVENTORY_PAGES, REFERENCE_PAGES } from '../parser/datasets.js';
import { existsSync } from 'node:fs';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { extractInventory, extractDatasetEntries } from './extract.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage, emitMatrixTable } from './emit.js';
import { emitAll } from './emit-files.js';
import { removeItem } from './mutate.js';

describe('emitAll is fail-safe (writes nothing on a bad state — db:add/db:remove order it before export)', () => {
  it('throws and writes NO file when a paper section cannot be emitted', () => {
    const db = importNdjson();
    // A paper in a section with no anchor in Papers.md — emitPapersFile (first, before any
    // write) throws. Point emitAll at a temp root seeded with the real Papers.md.
    db.prepare("INSERT INTO items(id,type,slug) VALUES('paper:88888','paper','88888')").run();
    db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)')
      .run('paper:88888', 88888, 'Ghost Section', '<a id="88888">88888</a> x', null, 88888);
    const root = mkdtempSync(join(tmpdir(), 'caail-emitall-'));
    const before = readFileSync(join(REPO_ROOT, 'Papers.md'), 'utf-8');
    writeFileSync(join(root, 'Papers.md'), before);
    expect(() => emitAll(db, root)).toThrow(/Ghost Section/);
    // Papers.md in the temp root is untouched — the emit computed-and-threw before writing.
    expect(readFileSync(join(root, 'Papers.md'), 'utf-8')).toBe(before);
  });
});

const TMP = mkdtempSync(join(tmpdir(), 'caail-emit-test-'));

describe('emit robustness (cycle 3)', () => {
  it('keeps an emptied catalog group’s heading + prose when its last entry is removed (C3-1)', () => {
    const db = importNdjson();
    removeItem(db, 'db:addgene'); // the sole entry of "## Plasmid & Reagent Repositories"
    const out = emitCatalogFile(db, join(REPO_ROOT, 'Databases.md'), 'database');
    expect(out).toContain('Plasmid & Reagent Repositories'); // heading survives the removal
  });
  it('throws rather than silently dropping a paper whose section has no source anchor (C3-2)', () => {
    const db = importNdjson();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('paper:99999','paper','99999')").run();
    db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)')
      .run('paper:99999', 99999, 'Ghost Section', '<a id="99999">99999</a> x', null, 99999);
    expect(() => emitPapersFile(db, join(REPO_ROOT, 'Papers.md'))).toThrow(/Ghost Section/);
  });
  it('throws a clear, actionable error when the source H3 count and DB entry count disagree', () => {
    // Regression: the positional entry splice requires source non-inventory H3 count ==
    // DB entry count. A mismatch (here 2 source H3s vs 1 DB entry — e.g. an interior entry
    // removed from the DB but not the Markdown) must fail LOUD with counts + a fix hint,
    // not crash on `undefined.heading_md` (old) nor silently mis-slice the wrong entry
    // under a heading (the earlier per-item verbatim guard).
    const src = join(TMP, 'ExtraH3.md');
    writeFileSync(src, '## Featured atlases\n\n### [Known Atlas](https://example.com/known)\n\nKnown body.\n\n### [Unknown Extra Atlas](https://example.com/extra)\n\nExtra body.\n');
    const fresh = importNdjson();
    fresh.exec('PRAGMA foreign_keys=OFF');
    fresh.prepare("INSERT INTO items(id,type,slug) VALUES('ds:known-atlas-xyz','dataset','known-atlas-xyz')").run();
    fresh.prepare("INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,ordinal) VALUES('ds:known-atlas-xyz','Known Atlas','https://example.com/known','ExtraTestPage','Featured atlases','atlas','[Known Atlas](https://example.com/known)','Known body.',0)").run();
    expect(() => emitDatasetPage(fresh, src, 'ExtraTestPage'))
      .toThrow(/source has 2 curated H3 entr\(ies\) but the DB has 1/);
  });
});
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

describe.each([
  ['Software.md', 'software'] as const,
  ['Databases.md', 'database'] as const,
])('%s heading fidelity', (file, type) => {
  // Guards the GNPS "(cross-listed)" class of bug: the parser ignores trailing
  // heading text, so JSON-identity alone would miss a dropped annotation.
  it('emits every ### heading line verbatim, including trailing annotations', () => {
    const src = readFileSync(join(REPO_ROOT, file), 'utf-8');
    const out = emitCatalogFile(db, join(REPO_ROOT, file), type);
    for (const heading of src.split('\n').filter((l) => l.startsWith('### '))) {
      expect(out, `${file} lost heading: ${heading}`).toContain(heading);
    }
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

describe('Datasets curated-entry round-trip', () => {
  it('every dataset page re-parses to an identical curated `### …` entry-set', () => {
    let total = 0;
    for (const page of [...INVENTORY_PAGES, ...REFERENCE_PAGES]) {
      const src = join(REPO_ROOT, 'Datasets', `${page}.md`);
      if (!existsSync(src)) continue;
      const original = extractDatasetEntries(src);
      total += original.length;
      const path = join(TMP, `entries-${page}.md`);
      writeFileSync(path, emitDatasetPage(db, src, page));
      expect(extractDatasetEntries(path), `${page}.md entries drifted`).toEqual(original);
    }
    expect(total).toBeGreaterThan(0); // sanity: we actually exercised entries
  });

  it('emits every non-inventory ### heading line verbatim (GNPS fidelity lesson)', () => {
    const src = join(REPO_ROOT, 'Datasets', 'Chicken.md');
    const out = emitDatasetPage(db, src, 'Chicken');
    // '### iES1300 — *Gallus gallus* (chicken)' — emphasis + em dash must survive.
    expect(out).toContain('### iES1300 — *Gallus gallus* (chicken)');
    expect(out).toContain('### [ChickenGTEx-Portal](https://chicken.farmgtex.org/)');
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
    fresh.prepare('INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)')
      .run(`paper:${newId}`, newId, 'References', raw, null, ord);
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

    // C2-1: the `> **Models**:` blockquote on #277 stays attached to #277, not floated
    // onto the newly-added last-ordinal paper (the emit reads it from blockquotes_md).
    const emitted = readFileSync(path, 'utf-8');
    const modelsIdx = emitted.indexOf('Stack-CellxGene45M'); // a Models-blockquote URL
    const newPaperIdx = emitted.indexOf('A synthetic round-trip paper');
    expect(modelsIdx).toBeGreaterThan(0);
    expect(modelsIdx).toBeLessThan(newPaperIdx);
  });

  it('captures a reference’s full trailing blockquote run (Code + Models) on the right paper', () => {
    const db = importNdjson();
    const bq = (db.prepare('SELECT blockquotes_md FROM papers WHERE ref_id=277').get() as any).blockquotes_md as string;
    expect(bq).toContain('> **Code**:');
    expect(bq).toContain('> **Models**:'); // the label the old typed columns dropped
  });
});
