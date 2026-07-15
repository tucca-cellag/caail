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

import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INVENTORY_PAGES, REFERENCE_PAGES, BENCHMARKS_PAGE } from '../parser/datasets.js';
import { importNdjson, REPO_ROOT, type Db } from './lib.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage } from './emit.js';
import { extractInventory, extractDatasetEntries } from './extract.js';

/**
 * Write every DB-owned canonical file from `db`. Returns the repo-relative paths.
 * `root` defaults to the repo root; it's injectable so tests can run against a fixture
 * dir. Each emit computes its string (and throws on a bad state) BEFORE its `writeFileSync`,
 * and Papers.md is emitted first — so a failure writes nothing, which is why the db:add /
 * db:remove CLIs call emitAll BEFORE exportNdjson (a throw can't desync NDJSON vs Markdown).
 */
export function emitAll(db: Db, root: string = REPO_ROOT): string[] {
  // Compute EVERY file's content first — any emitter that throws (a bad state) aborts here,
  // before a single write — then write them all. So a failure genuinely leaves nothing on
  // disk (not just when the failing emitter happens to run first), which is why the db:add /
  // db:remove CLIs run emitAll before exportNdjson: a throw can't desync NDJSON vs Markdown.
  const files: Array<{ rel: string; text: string }> = [
    { rel: 'Papers.md', text: emitPapersFile(db, join(root, 'Papers.md')) },
    { rel: 'Software.md', text: emitCatalogFile(db, join(root, 'Software.md'), 'software') },
    { rel: 'Databases.md', text: emitCatalogFile(db, join(root, 'Databases.md'), 'database') },
  ];
  // A dataset page is DB-owned if it has an inventory table OR curated `### …` entries —
  // so reference pages (no inventory, entries only) are emitted too. Mirror seed.ts's
  // ENTRY_PAGES exactly (incl. BENCHMARKS_PAGE) so a page that ever gains H3 entries can't
  // be seeded-but-never-emitted (which would pass the sync guard for the wrong reason).
  for (const page of [...INVENTORY_PAGES, ...REFERENCE_PAGES, BENCHMARKS_PAGE]) {
    const src = join(root, 'Datasets', `${page}.md`);
    if (existsSync(src) && (extractInventory(src) || extractDatasetEntries(src).length > 0)) {
      files.push({ rel: `Datasets/${page}.md`, text: emitDatasetPage(db, src, page) });
    }
  }
  for (const f of files) writeFileSync(join(root, f.rel), f.text);
  return files.map((f) => f.rel);
}

function main(): void {
  const written = emitAll(importNdjson());
  console.log(`db:emit wrote ${written.length} canonical files from the DB:`);
  for (const f of written) console.log(`  ${f}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
