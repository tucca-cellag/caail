/**
 * remove-item.ts (db:remove) — remove one item by its frozen id. Rebuilds the DB
 * from committed NDJSON, deletes the item and its dependent rows (a paper's id is
 * retired, never reused), runs the integrity guards, and — only if clean — writes
 * the updated NDJSON + canonical Markdown. Commit Markdown + NDJSON together.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:remove <id>
 *   e.g.  pnpm --dir site db:remove sw:oldtool
 */

import { importNdjson, exportNdjson } from './lib.js';
import { removeItem } from './mutate.js';
import { runChecks } from './check.js';
import { emitAll } from './emit-files.js';

function main(): void {
  const id = process.argv[2];
  if (!id) { console.error('usage: db:remove <id>   (e.g. sw:oldtool, paper:123)'); process.exit(1); }

  const db = importNdjson();
  removeItem(db, id);

  const bad = runChecks(db).filter((r) => !r.ok);
  if (bad.length) {
    console.error(`db:remove: integrity check failed after removing ${id} — nothing written:`);
    for (const r of bad) console.error(`  ✗ ${r.label}: ${r.detail}`);
    process.exit(1);
  }
  // Emit first (throws before writing anything on a bad state), then export — so a
  // failure can't leave the committed NDJSON out of sync with the untouched Markdown.
  const written = emitAll(db);
  exportNdjson(db);
  console.log(`Removed ${id}. Regenerated ${written.length} canonical files + NDJSON.`);
  console.log('Review the diff, then commit Markdown + NDJSON together.');
}

main();
