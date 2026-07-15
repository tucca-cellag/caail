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

/**
 * Write every DB-owned canonical file from `db`. Returns the repo-relative paths.
 * `root` defaults to the repo root; it's injectable so tests can run against a fixture
 * dir. Each emit computes its string (and throws on a bad state) BEFORE its `writeFileSync`,
 * and Papers.md is emitted first — so a failure writes nothing, which is why the db:add /
 * db:remove CLIs call emitAll BEFORE exportNdjson (a throw can't desync NDJSON vs Markdown).
 */
export function emitAll(db: Db, root: string = REPO_ROOT): string[] {
  const written: string[] = [];
  const write = (rel: string, text: string) => { writeFileSync(join(root, rel), text); written.push(rel); };
  write('Papers.md', emitPapersFile(db, join(root, 'Papers.md')));
  write('Software.md', emitCatalogFile(db, join(root, 'Software.md'), 'software'));
  write('Databases.md', emitCatalogFile(db, join(root, 'Databases.md'), 'database'));
  for (const page of INVENTORY_PAGES) {
    const src = join(root, 'Datasets', `${page}.md`);
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
