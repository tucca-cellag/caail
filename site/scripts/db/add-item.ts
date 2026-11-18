/**
 * add-item.ts (db:add) — add one item to the catalog from a JSON descriptor.
 * New items are paused until CAAIL v2, and until then db:add refuses every descriptor
 * (NEW_ITEMS_PAUSED below). Otherwise it
 * rebuilds the DB from committed NDJSON, inserts the item (auto frozen-id), runs the
 * integrity guards, and — only if clean — writes the updated NDJSON + canonical
 * Markdown. Review the diff and commit Markdown + NDJSON together.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:add <descriptor.json>
 *
 * Descriptor shape: see ItemAdd in mutate.ts. Examples:
 *   { "type":"software", "name":"CameoPy", "url":"https://…", "group":"Metabolic Modeling & Strain Design", "body":"Summary: …", "topics":["metabolic-modeling"] }
 *   { "type":"paper", "raw":"Author, A. (2026). Title. *Journal*. https://doi.org/…", "label":"Author 2026", "cells":[{"method":"Deep Learning","area":"Media Optimization"}] }
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { importNdjson, exportNdjson, NDJSON_DIR, REPO_ROOT } from './lib.js';
import { addItem, type ItemAdd } from './mutate.js';
import { runChecks } from './check.js';
import { emitAll } from './emit-files.js';

/**
 * Where `dbAdd` reads and writes. `ndjsonDir` is the NDJSON it rebuilds the DB from and
 * exports back to; `root` is where it writes the canonical Markdown. Both default to the
 * repo, and are injectable so a test can point them at fixture copies. The integrity checks
 * read the repo either way, as `db:check` does.
 */
export interface DbAddPaths {
  ndjsonDir?: string;
  root?: string;
}

/**
 * New items are paused until CAAIL v2. Every item db:add can create is new, since `addItem`
 * mints a frozen id that no held item has (`nextFreeId` skips every id already in
 * `items.ndjson`). So while the pause holds, db:add refuses every descriptor, first, before
 * it reads the NDJSON or validates the descriptor. Held items still change through the edit
 * flow (db:build, edit, db:export, db:emit), which this does not touch, and db:remove is
 * unaffected.
 */
export const NEW_ITEMS_PAUSED = true;

export const NEW_ITEMS_PAUSED_MESSAGE =
  'db:add: new items are paused until CAAIL v2, so nothing was added or written. ' +
  'Edits to existing items still work: run db:build, change the item in the DB, then db:export and db:emit. ' +
  'db:remove still works.';

/**
 * Add one item and regenerate. Returns the frozen id it assigned and the canonical files
 * it wrote. Throws, writing nothing, when a guard fails, and while new items are paused.
 */
export function dbAdd(spec: ItemAdd, paths: DbAddPaths = {}): { id: string; written: string[] } {
  if (NEW_ITEMS_PAUSED) throw new Error(NEW_ITEMS_PAUSED_MESSAGE);

  const ndjsonDir = paths.ndjsonDir ?? NDJSON_DIR;
  const root = paths.root ?? REPO_ROOT;

  const db = importNdjson(ndjsonDir);
  const id = addItem(db, spec);

  const bad = runChecks(db).filter((r) => !r.ok);
  if (bad.length) {
    throw new Error(
      `db:add: integrity check failed after adding ${id} — nothing written:\n` +
      bad.map((r) => `  ✗ ${r.label}: ${r.detail}`).join('\n'),
    );
  }
  // Emit FIRST — it re-parses/validates and throws on a bad state (e.g. a section with no
  // source anchor) BEFORE any file is written, so a failure can't leave the committed
  // NDJSON out of sync with the untouched Markdown. Only export once emit has succeeded.
  const written = emitAll(db, root);
  exportNdjson(db, ndjsonDir);
  return { id, written };
}

function main(): void {
  const file = process.argv[2];
  if (!file) { console.error('usage: db:add <descriptor.json>'); process.exit(1); }
  const spec = JSON.parse(readFileSync(file, 'utf-8')) as ItemAdd;

  let result: { id: string; written: string[] };
  try {
    result = dbAdd(spec);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  console.log(`Added ${result.id}. Regenerated ${result.written.length} canonical files + NDJSON.`);
  console.log('Review the diff, then commit Markdown + NDJSON together.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
