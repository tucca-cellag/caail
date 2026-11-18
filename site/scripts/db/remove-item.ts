/**
 * remove-item.ts (db:remove) — remove one item by its frozen id. Rebuilds the DB
 * from committed NDJSON, deletes the item and its dependent rows (a paper's id is
 * retired, never reused), runs the integrity guards, and — only if clean — writes
 * the updated NDJSON + canonical Markdown. Commit Markdown + NDJSON together.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:remove <id>
 *   e.g.  pnpm --dir site db:remove sw:oldtool
 */

import { fileURLToPath } from 'node:url';
import { importNdjson, NDJSON_DIR } from './lib.js';
import { removeItem } from './mutate.js';
import { checkAndRegenerate, type RegeneratePaths } from './regenerate.js';

/**
 * Remove one item and regenerate. Returns the canonical files written. Throws, writing
 * nothing, when the id is unknown or a guard fails.
 */
export function dbRemove(id: string, paths: RegeneratePaths = {}): string[] {
  const db = importNdjson(paths.ndjsonDir ?? NDJSON_DIR);
  removeItem(db, id);
  return checkAndRegenerate(db, `db:remove: integrity check failed after removing ${id}`, paths);
}

function main(): void {
  const id = process.argv[2];
  if (!id) { console.error('usage: db:remove <id>   (e.g. sw:oldtool, paper:123)'); process.exit(1); }

  let written: string[];
  try {
    written = dbRemove(id);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  console.log(`Removed ${id}. Regenerated ${written.length} canonical files + NDJSON.`);
  console.log('Review the diff, then commit Markdown + NDJSON together.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
