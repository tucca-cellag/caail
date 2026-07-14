/**
 * emit-files.ts — write the DB-owned canonical Markdown back to the repo from a DB.
 * `emitAll` is the reusable core (used by db:emit, db:add, db:remove); the CLI
 * rebuilds the DB from committed NDJSON and calls it. This is the authoring
 * "regenerate" step (and the cutover step): after editing the DB, refresh the
 * Markdown, then commit the NDJSON + Markdown diff together. The CI sync guard runs
 * db:emit and asserts `git diff` is empty (committed Markdown must match the DB).
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:emit
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INVENTORY_PAGES } from '../parser/datasets.js';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage } from './emit.js';
import { extractInventory } from './extract.js';

/** Write every DB-owned canonical file from `db`. Returns the repo-relative paths. */
export function emitAll(db: Db): string[] {
  const written: string[] = [];
  const write = (rel: string, text: string) => { writeFileSync(join(REPO_ROOT, rel), text); written.push(rel); };
  write('Papers.md', emitPapersFile(db, join(REPO_ROOT, 'Papers.md')));
  write('Software.md', emitCatalogFile(db, join(REPO_ROOT, 'Software.md'), 'software'));
  write('Databases.md', emitCatalogFile(db, join(REPO_ROOT, 'Databases.md'), 'database'));
  for (const page of INVENTORY_PAGES) {
    const src = join(REPO_ROOT, 'Datasets', `${page}.md`);
    if (extractInventory(src)) write(`Datasets/${page}.md`, emitDatasetPage(db, src, page));
  }
  return written;
}

function main(): void {
  const written = emitAll(importNdjson());
  console.log(`db:emit wrote ${written.length} canonical files from the DB:`);
  for (const f of written) console.log(`  ${f}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
