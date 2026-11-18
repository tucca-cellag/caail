/**
 * add-item.test.ts — db:add while new items are paused until CAAIL v2, and the paths that
 * stay open around it.
 *
 * Every case that writes runs against fixture copies of the committed NDJSON and of the
 * repo files the checks and the emit read, so nothing here can write to the repo. Covered
 * in both directions: db:add refuses a new item of every type and writes nothing, while the
 * edit flow and db:remove still regenerate a held item; the shared check-emit-export tail
 * the pause will be lifted onto is exercised directly; and the hand-written statements of
 * the pause are held to the constant that enforces it.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCatalogFile } from '../parser/catalog.js';
import { importNdjson, exportNdjson, NDJSON_DIR, REPO_ROOT, SITE_ROOT, type Db } from './lib.js';
import { extractInventory } from './extract.js';
import { runChecks } from './check.js';
import { emitAll } from './emit-files.js';
import { addItem, type ItemAdd } from './mutate.js';
import { checkAndRegenerate } from './regenerate.js';
import { dbAdd, NEW_ITEMS_PAUSED, NEW_ITEMS_PAUSED_MESSAGE } from './add-item.js';
import { dbRemove } from './remove-item.js';

/**
 * A fresh copy of what db:add and db:remove read and write: the NDJSON, every root-level
 * Markdown file (the DB-owned pages, and CLAUDE.md, CONTRIBUTING.md and Taxonomy.md, which
 * the checks read), and the two directories the checks and the emit walk.
 */
function fixture(): { ndjsonDir: string; root: string } {
  const base = mkdtempSync(join(tmpdir(), 'caail-add-item-'));
  const ndjsonDir = join(base, 'ndjson');
  const root = join(base, 'root');
  cpSync(NDJSON_DIR, ndjsonDir, { recursive: true });
  mkdirSync(root);
  for (const f of readdirSync(REPO_ROOT)) {
    if (f.endsWith('.md')) cpSync(join(REPO_ROOT, f), join(root, f));
  }
  for (const d of ['Datasets', 'ResearchAreas']) cpSync(join(REPO_ROOT, d), join(root, d), { recursive: true });
  return { ndjsonDir, root };
}

/** Every file under `dirs`, keyed by path, so a before/after diff names what changed. */
function snapshot(...dirs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string, top: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, top);
      else out.set(`${relative(tmpdir(), top)}/${relative(top, p)}`, readFileSync(p, 'utf-8'));
    }
  };
  for (const d of dirs) walk(d, d);
  return out;
}

function changed(before: Map<string, string>, after: Map<string, string>): string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return [...keys].filter((k) => before.get(k) !== after.get(k)).sort();
}

const anyGroup = (db: Db, type: 'software' | 'database') =>
  (db.prepare('SELECT grp FROM catalog WHERE item_id IN (SELECT id FROM items WHERE type=?) LIMIT 1').get(type) as { grp: string }).grp;
const anyMethod = (db: Db) => (db.prepare('SELECT label FROM methods ORDER BY ordinal LIMIT 1').get() as { label: string }).label;
const anyArea = (db: Db) => (db.prepare('SELECT label FROM areas ORDER BY ordinal LIMIT 1').get() as { label: string }).label;

/**
 * A held software entry that no curated input names (no DOI, no sibling DOIs, no manual
 * licence), so removing it leaves no dangling key in `dois-manual.json`, `dois-related.json`
 * or `licenses-manual.json` for db:check to report.
 */
const heldTool = (db: Db) => db.prepare(
  "SELECT c.item_id AS id, c.url AS url FROM catalog c JOIN items i ON i.id = c.item_id"
  + " WHERE i.type = 'software' AND c.doi IS NULL AND c.related_dois IS NULL"
  + " AND (c.license_source IS NULL OR c.license_source = 'auto') ORDER BY c.item_id LIMIT 1",
).get() as { id: string; url: string };

/**
 * One well-formed new item per catalog type, built from the live DB. "Add the same
 * descriptors through the shared tail" below shows each is valid, so their refusal is the
 * pause and not a validation error.
 */
function validDescriptors(): Array<[string, ItemAdd]> {
  const db = importNdjson();
  return [
    ['software', { type: 'software', name: 'ZzPausedTool', url: 'https://example.org/zz-paused-tool', group: anyGroup(db, 'software'), body: 'Summary: a new tool the pause refuses.' }],
    ['database', { type: 'database', name: 'ZzPausedDb', url: 'https://example.org/zz-paused-db', group: anyGroup(db, 'database'), body: 'Summary: a new database the pause refuses.' }],
    ['paper', { type: 'paper', raw: 'Paused, P. (2099). A new paper the pause refuses. *Journal of Tests, 1*(1), 1-2. https://doi.org/10.9999/paused', label: 'Paused 2099', cells: [{ method: anyMethod(db), area: anyArea(db) }] }],
  ];
}

/**
 * A dataset row whose synthetic Data cells fail db:check's vocabulary. Refused with the
 * pause message rather than the check's, it shows the pause comes before validation.
 */
function invalidDatasetRow(): ItemAdd {
  const db = importNdjson();
  const page = (db.prepare('SELECT page FROM dataset_rows LIMIT 1').get() as { page: string }).page;
  const header = extractInventory(join(REPO_ROOT, 'Datasets', `${page}.md`))!.header;
  return { type: 'dataset', page, cells: header.map((_, i) => (i === 0 ? 'Paused test study GSE999998' : `c${i}`)) };
}

describe('db:add refuses a new item while new items are paused', () => {
  it.each([...validDescriptors(), ['dataset row with invalid cells', invalidDatasetRow()] as [string, ItemAdd]])(
    'refuses a new %s and writes nothing',
    (_type, spec) => {
      const paths = fixture();
      const before = snapshot(paths.ndjsonDir, paths.root);

      let err: unknown;
      try { dbAdd(spec, paths); } catch (e) { err = e; }

      expect(err, 'db:add added a new item while new items are paused').toBeInstanceOf(Error);
      const message = (err as Error).message;
      expect(message).toMatch(/new items are paused until CAAIL v2/);
      expect(message).toMatch(/edits to existing items still work/i);
      expect(changed(before, snapshot(paths.ndjsonDir, paths.root)), 'db:add wrote files while refusing').toEqual([]);
    },
  );

  it('names no system outside this repository in its message', () => {
    expect(NEW_ITEMS_PAUSED_MESSAGE).not.toMatch(/radar|pipeline|board|intake|planning|zotero/i);
  });

  it('refuses from the command line before it reads the descriptor file', () => {
    const cli = fileURLToPath(new URL('./add-item.ts', import.meta.url));
    const run = spawnSync(join(SITE_ROOT, 'node_modules', '.bin', 'tsx'), [cli, join(tmpdir(), 'caail-no-such-descriptor.json')], {
      encoding: 'utf-8',
      env: { ...process.env, NODE_OPTIONS: '--experimental-sqlite --no-warnings' },
    });
    expect(run.status).toBe(1);
    expect(run.stderr.trim(), 'db:add read the descriptor before refusing').toBe(NEW_ITEMS_PAUSED_MESSAGE);
  });
});

describe('the check-emit-export tail the pause will be lifted onto', () => {
  it.each(validDescriptors())('adds the same new %s into the fixture, so the descriptor is valid', (_type, spec) => {
    const paths = fixture();
    const db = importNdjson(paths.ndjsonDir);
    const id = addItem(db, spec);

    const written = checkAndRegenerate(db, `adding ${id}`, paths);

    expect(written.length).toBeGreaterThan(0);
    expect(importNdjson(paths.ndjsonDir).prepare('SELECT 1 FROM items WHERE id = ?').get(id)).toBeDefined();
  });

  it('throws, writing nothing, when a check fails', () => {
    const paths = fixture();
    const before = snapshot(paths.ndjsonDir, paths.root);
    const db = importNdjson(paths.ndjsonDir);
    const id = addItem(db, invalidDatasetRow());

    expect(() => checkAndRegenerate(db, `db:add: integrity check failed after adding ${id}`, paths))
      .toThrow(/integrity check failed after adding ds:gse999998 — nothing written:\n {2}✗ dataset_rows/);
    expect(changed(before, snapshot(paths.ndjsonDir, paths.root))).toEqual([]);
  });
});

describe('changes to held items stay open while new items are paused', () => {
  it('the edit flow regenerates an edited held entry and passes the checks', () => {
    const paths = fixture();
    const db = importNdjson(paths.ndjsonDir);
    const held = heldTool(db);
    db.prepare('UPDATE catalog SET body_md = ? WHERE item_id = ?').run('Summary: an edited description of a held tool.', held.id);

    expect(runChecks(db, paths.root).filter((r) => !r.ok)).toEqual([]);
    emitAll(db, paths.root);
    exportNdjson(db, paths.ndjsonDir);

    const again = importNdjson(paths.ndjsonDir);
    expect((again.prepare('SELECT body_md FROM catalog WHERE item_id = ?').get(held.id) as { body_md: string }).body_md)
      .toBe('Summary: an edited description of a held tool.');
    const entry = parseCatalogFile(join(paths.root, 'Software.md'), 'Software.md').find((e) => e.url === held.url);
    expect(entry?.summary).toContain('an edited description of a held tool');
  });

  it('db:remove removes a held item and regenerates', () => {
    const paths = fixture();
    const held = heldTool(importNdjson(paths.ndjsonDir));

    const written = dbRemove(held.id, paths);

    expect(written).toContain('Software.md');
    expect(importNdjson(paths.ndjsonDir).prepare('SELECT 1 FROM items WHERE id = ?').get(held.id)).toBeUndefined();
    expect(parseCatalogFile(join(paths.root, 'Software.md'), 'Software.md').some((e) => e.url === held.url)).toBe(false);
  });
});

describe('the hand-written statements of the pause agree with NEW_ITEMS_PAUSED', () => {
  it.each([
    '.claude/skills/caail-db-authoring/SKILL.md',
    '.claude/skills/zotero-to-caail-sync/SKILL.md',
    'CLAUDE.md',
  ])('%s', (file) => {
    const says = readFileSync(join(REPO_ROOT, file), 'utf-8').includes('paused until CAAIL v2');
    expect(says, NEW_ITEMS_PAUSED
      ? `${file} does not say new items are paused until CAAIL v2, while db:add refuses them`
      : `${file} still says new items are paused until CAAIL v2, after db:add stopped refusing them`).toBe(NEW_ITEMS_PAUSED);
  });
});
