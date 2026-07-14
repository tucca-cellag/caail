/**
 * emit-files.ts — write the DB-owned canonical Markdown back to the repo from the
 * committed NDJSON. This is the authoring "regenerate" step (and the cutover step):
 * after editing the DB and `db:export`, run `db:emit` to refresh the Markdown, then
 * commit the NDJSON + Markdown diff together. The CI sync guard runs this and
 * asserts `git diff` is empty (committed Markdown must match the DB).
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:emit
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INVENTORY_PAGES } from '../parser/datasets.js';
import { importNdjson, REPO_ROOT } from './lib.js';
import { emitPapersFile, emitCatalogFile, emitDatasetPage } from './emit.js';
import { extractInventory } from './extract.js';

function main(): void {
  const db = importNdjson();
  const written: string[] = [];
  const write = (rel: string, text: string) => { writeFileSync(join(REPO_ROOT, rel), text); written.push(rel); };

  write('Papers.md', emitPapersFile(db, join(REPO_ROOT, 'Papers.md')));
  write('Software.md', emitCatalogFile(db, join(REPO_ROOT, 'Software.md'), 'software'));
  write('Databases.md', emitCatalogFile(db, join(REPO_ROOT, 'Databases.md'), 'database'));
  for (const page of INVENTORY_PAGES) {
    const src = join(REPO_ROOT, 'Datasets', `${page}.md`);
    if (extractInventory(src)) write(`Datasets/${page}.md`, emitDatasetPage(db, src, page));
  }
  console.log(`db:emit wrote ${written.length} canonical files from the DB:`);
  for (const f of written) console.log(`  ${f}`);
}

main();
