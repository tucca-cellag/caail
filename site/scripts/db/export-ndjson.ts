/**
 * export-ndjson.ts — dump the (edited) SQLite file back to committed NDJSON.
 * Run after editing site/caail.db so the git-tracked source reflects the change.
 * Commit the NDJSON diff together with the `db:emit` Markdown diff.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:export
 */

import { openExisting, exportNdjson, DB_PATH, NDJSON_DIR } from './lib.js';

function main(): void {
  const db = openExisting(DB_PATH);
  const counts = exportNdjson(db, NDJSON_DIR);
  db.close();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`Exported ${total} rows across ${Object.keys(counts).length} tables -> ${NDJSON_DIR}`);
}

main();
