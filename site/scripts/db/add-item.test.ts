/**
 * add-item.test.ts: db:add while new items are paused until CAAIL v2, and the paths that
 * stay open around it.
 *
 * Every case that writes runs against fixture copies of the committed NDJSON and of the
 * repo files the checks and the emit read, so nothing here can write to the repo. Covered
 * in both directions: db:add refuses a new item of every type and writes nothing, while the
 * edit flow and db:remove still regenerate a held item; the shared check-emit-export tail
 * the pause will be lifted onto is exercised directly; and the hand-written statements of
 * the pause are held to the constant that enforces it.
 */

import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseCatalogFile } from '../parser/catalog.js';
import { importNdjson, exportNdjson, runsAsMain, NDJSON_DIR, REPO_ROOT, SITE_ROOT, type Db } from './lib.js';
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
const scratch: string[] = [];
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

function fixture(): { ndjsonDir: string; root: string } {
  const base = mkdtempSync(join(tmpdir(), 'caail-add-item-'));
  scratch.push(base);
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

/** The live NDJSON, imported once and only read: descriptors are built from it. */
let liveDb: Db | undefined;
const live = (): Db => (liveDb ??= importNdjson());

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
  const db = live();
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
  const db = live();
  const page = (db.prepare('SELECT page FROM dataset_rows LIMIT 1').get() as { page: string }).page;
  const header = extractInventory(join(REPO_ROOT, 'Datasets', `${page}.md`))!.header;
  return { type: 'dataset', page, cells: header.map((_, i) => (i === 0 ? 'Paused test study GSE999998' : `c${i}`)) };
}

describe.runIf(NEW_ITEMS_PAUSED)('db:add refuses a new item while new items are paused', () => {
  // One fixture for every refusal: a refusal writes nothing, so the cases cannot disturb
  // each other, and the first one that did write would fail on the shared snapshot.
  let paths: { ndjsonDir: string; root: string };
  let before: Map<string, string>;
  beforeAll(() => {
    paths = fixture();
    before = snapshot(paths.ndjsonDir, paths.root);
  });

  it.each([...validDescriptors(), ['dataset row with invalid cells', invalidDatasetRow()] as [string, ItemAdd]])(
    'refuses a new %s and writes nothing',
    (_type, spec) => {
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

describe.runIf(!NEW_ITEMS_PAUSED)('db:add adds a new item once the pause is lifted', () => {
  it.each(validDescriptors())('adds a new %s and regenerates', (_type, spec) => {
    const paths = fixture();
    const { id, written } = dbAdd(spec, paths);

    expect(written.length).toBeGreaterThan(0);
    expect(importNdjson(paths.ndjsonDir).prepare('SELECT 1 FROM items WHERE id = ?').get(id)).toBeDefined();
  });
});

describe('the db CLIs run when executed, however they are named', () => {
  /** runsAsMain for a module at `<dir>/cli.ts`, with `entry` as process.argv[1]. */
  function asMain(entry: (dir: string) => string, siblings: string[] = []): boolean {
    const dir = mkdtempSync(join(tmpdir(), 'caail-db-link-'));
    scratch.push(dir);
    for (const f of ['cli.ts', ...siblings]) writeFileSync(join(dir, f), '');
    const saved = process.argv[1];
    process.argv[1] = entry(dir);
    try {
      return runsAsMain(pathToFileURL(join(dir, 'cli.ts')).href);
    } finally {
      process.argv[1] = saved;
    }
  }

  it('says main for the module itself, and for it named without its extension', () => {
    expect(asMain((d) => join(d, 'cli.ts'))).toBe(true);
    expect(asMain((d) => join(d, 'cli'))).toBe(true);
  });

  it('says not main, rather than throwing, for an entry that is no path at all', () => {
    expect(asMain(() => join(tmpdir(), 'caail-no-such-dir', 'x'))).toBe(false);
  });

  it('says not main for a sibling sharing the module name with another extension', () => {
    expect(asMain((d) => join(d, 'cli.js'), ['cli.js'])).toBe(false);
  });

  it('says main for the module named with the .js extension it does not have', () => {
    // tsx resolves `cli.js` to `cli.ts` (the ESM convention), so an entry naming a .js
    // file that is not there is this module.
    expect(asMain((d) => join(d, 'cli.js'))).toBe(true);
  });

  it('runs the CLI when the checkout is reached through a symlink, rather than exiting 0', () => {
    const link = join(mkdtempSync(join(tmpdir(), 'caail-db-link-')), 'db');
    scratch.push(dirname(link));
    symlinkSync(fileURLToPath(new URL('.', import.meta.url)), link, 'dir');
    const run = spawnSync(join(SITE_ROOT, 'node_modules', '.bin', 'tsx'), [join(link, 'remove-item.ts'), 'sw:zz-no-such-item'], {
      encoding: 'utf-8',
      env: { ...process.env, NODE_OPTIONS: '--experimental-sqlite --no-warnings' },
    });
    expect(run.status, 'db:remove run through a symlink exited without running').toBe(1);
    expect(run.stderr).toMatch(/no item 'sw:zz-no-such-item'/);
  });

  it('runs the CLI when it is named without its extension, rather than exiting 0', () => {
    const bare = fileURLToPath(new URL('./remove-item', import.meta.url));
    const run = spawnSync(join(SITE_ROOT, 'node_modules', '.bin', 'tsx'), [bare, 'sw:zz-no-such-item'], {
      encoding: 'utf-8',
      env: { ...process.env, NODE_OPTIONS: '--experimental-sqlite --no-warnings' },
    });
    expect(run.status, 'db:remove named without its extension exited without running').toBe(1);
    expect(run.stderr).toMatch(/no item 'sw:zz-no-such-item'/);
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
    // Whitespace is flattened first, in both directions, since a hard-wrapped statement can
    // break anywhere in a phrase.
    const flat = readFileSync(join(REPO_ROOT, file), 'utf-8').replace(/\s+/g, ' ');
    if (NEW_ITEMS_PAUSED) {
      expect(flat.includes('paused until CAAIL v2'), `${file} does not say new items are paused until CAAIL v2, while db:add refuses them`).toBe(true);
    } else {
      // Every statement of the pause, in whatever words, says items "are paused" or that
      // something waits for v2, so the lifted direction looks for those rather than for the
      // one phrase the top note uses.
      const left = [...flat.matchAll(/.{0,40}(?:items are paused|until CAAIL v2|wait for v2).{0,40}/gi)].map((m) => m[0]);
      expect(left, `${file} still states the pause after db:add stopped refusing`).toEqual([]);
    }
  });
});
