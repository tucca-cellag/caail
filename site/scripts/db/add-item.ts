/**
 * add-item.ts (db:add) — add one item to the catalog from a JSON descriptor.
 * New items are paused until CAAIL v2, and until then db:add refuses every descriptor
 * (NEW_ITEMS_PAUSED below). Otherwise it rebuilds the DB from committed NDJSON, inserts
 * the item (auto frozen-id), runs the integrity guards, and — only if clean — writes the
 * updated NDJSON + canonical Markdown. Review the diff and commit Markdown + NDJSON together.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:add <descriptor.json>
 *
 * Descriptor shape: see ItemAdd in mutate.ts. Examples:
 *   { "type":"software", "name":"CameoPy", "url":"https://…", "group":"Metabolic Modeling & Strain Design", "body":"Summary: …", "topics":["metabolic-modeling"] }
 *   { "type":"paper", "raw":"Author, A. (2026). Title. *Journal*. https://doi.org/…", "label":"Author 2026", "cells":[{"method":"Deep Learning","area":"Media Optimization"}] }
 */

import { readFileSync } from 'node:fs';
import { importNdjson, runsAsMain } from './lib.js';
import { addItem, type ItemAdd } from './mutate.js';
import { checkAndRegenerate, type RegeneratePaths } from './regenerate.js';

/**
 * New items are paused until CAAIL v2. Every item db:add can create is new, since `addItem`
 * mints a frozen id no held item has: a paper gets the ref id after every held and retired
 * one, and every other type a slug `nextFreeId` keeps clear of every id in `items`. So while
 * the pause holds, db:add refuses every descriptor, first, through `assertAddsOpen`: `main`
 * before it reads the descriptor file, and `dbAdd` before it reads the NDJSON or validates
 * the descriptor. Held items still change through the edit flow (db:build, edit, db:export,
 * db:emit), which this does not touch, and db:remove is unaffected.
 *
 * Three hand-written statements of the pause (the two skills it opens and the root
 * CLAUDE.md) are held to this constant by add-item.test.ts, so lifting it means removing
 * them in the same change.
 */
export const NEW_ITEMS_PAUSED = true;

export const NEW_ITEMS_PAUSED_MESSAGE =
  'db:add: new items are paused until CAAIL v2, so nothing was added or written. ' +
  'Edits to existing items still work: pnpm --dir site db:build, change the item in the DB, ' +
  'then db:export, db:emit, db:check and db:verify (the caail-db-authoring skill has the full flow). ' +
  'db:remove still works.';

/** Throws the pause message while new items are paused: the one place the code reads the flag. */
export function assertAddsOpen(): void {
  if (NEW_ITEMS_PAUSED) throw new Error(NEW_ITEMS_PAUSED_MESSAGE);
}

/**
 * Add one item and regenerate. Returns the frozen id it assigned and the canonical files
 * it wrote. Throws, writing nothing, while new items are paused and when a guard fails.
 */
export function dbAdd(spec: ItemAdd, paths: RegeneratePaths = {}): { id: string; written: string[] } {
  assertAddsOpen();

  const db = importNdjson(paths.ndjsonDir);
  const id = addItem(db, spec);
  const written = checkAndRegenerate(db, `db:add: integrity check failed after adding ${id}`, paths);
  return { id, written };
}

function main(): void {
  let result: { id: string; written: string[] };
  try {
    assertAddsOpen();
    const file = process.argv[2];
    if (!file) throw new Error('usage: db:add <descriptor.json>');
    result = dbAdd(JSON.parse(readFileSync(file, 'utf-8')) as ItemAdd);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  console.log(`Added ${result.id}. Regenerated ${result.written.length} canonical files + NDJSON.`);
  console.log('Review the diff, then commit Markdown + NDJSON together.');
}

if (runsAsMain(import.meta.url)) main();
