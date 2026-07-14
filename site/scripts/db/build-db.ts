/**
 * build-db.ts — materialize the gitignored SQLite file from the committed NDJSON,
 * for interactive authoring/querying. `db:emit`/`db:check`/`db:verify` read the
 * NDJSON directly (in memory), so this file is only needed to open and edit the DB.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:build
 */

import { importNdjson, DB_PATH, NDJSON_DIR, TABLES_PK } from './lib.js';

function main(): void {
  const db = importNdjson(NDJSON_DIR, DB_PATH);
  const rows = Object.keys(TABLES_PK).reduce((n, t) => {
    return n + (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c;
  }, 0);
  db.close();
  console.log(`CAAIL DB built from NDJSON -> ${DB_PATH} (${rows} rows). It is gitignored; edit here, then \`pnpm db:export\`.`);
}

main();
