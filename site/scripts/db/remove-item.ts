/**
 * remove-item.ts (db:remove) — remove one item by its frozen id. Rebuilds the DB
 * from committed NDJSON, deletes the item and its dependent rows (a paper's id is
 * retired, never reused), runs the integrity guards, and — only if clean — writes
 * the updated NDJSON + canonical Markdown. Commit Markdown + NDJSON together.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:remove <id>
 *   e.g.  pnpm --dir site db:remove sw:oldtool
 */

import { exitOnRefusal, importNdjson, RefusalError, runsAsMain } from './lib.js';
import { removeItem } from './mutate.js';
import { checkAndRegenerate, type RegeneratePaths } from './regenerate.js';

/**
 * Remove one item and regenerate. Returns the canonical files written. Throws, writing
 * nothing, when the id is unknown or a guard fails.
 */
export function dbRemove(id: string, paths: RegeneratePaths = {}): string[] {
  const db = importNdjson(paths.ndjsonDir);
  removeItem(db, id);
  return checkAndRegenerate(db, `db:remove: integrity check failed after removing ${id}`, paths);
}

function main(): void {
  const id = process.argv[2];
  let written: string[];
  try {
    if (!id) throw new RefusalError('usage: db:remove <id>   (e.g. sw:oldtool, paper:123)');
    written = dbRemove(id);
  } catch (err) {
    exitOnRefusal(err);
  }
  console.log(`Removed ${id}. Regenerated ${written.length} canonical files + NDJSON.`);
  console.log('Review the diff, then commit Markdown + NDJSON together.');
}

if (runsAsMain(import.meta.url)) main();
