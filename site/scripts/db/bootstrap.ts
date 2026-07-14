/**
 * bootstrap.ts — one-time (and re-runnable) ETL: canonical Markdown -> in-memory
 * SQLite -> committed NDJSON source. This is how the DB is first populated from the
 * hand-authored files, and how the NDJSON is regenerated if the canonical files are
 * re-imported. After bootstrap the NDJSON (site/db/ndjson/) is the source of truth.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:bootstrap
 */

import { join } from 'node:path';
import { buildPapersModel } from '../parser/papers.js';
import { openDb, exportNdjson, REPO_ROOT, NDJSON_DIR } from './lib.js';
import { extractCatalogEntries } from './extract.js';
import { seedPapers, seedCatalog, seedDatasets, seedTopics } from './seed.js';

function main(): void {
  const db = openDb(); // :memory:

  const papersPath = join(REPO_ROOT, 'Papers.md');
  const papers = buildPapersModel(papersPath);
  seedPapers(db, papers, papersPath);

  const sw = extractCatalogEntries(join(REPO_ROOT, 'Software.md'));
  const dbs = extractCatalogEntries(join(REPO_ROOT, 'Databases.md'));
  seedCatalog(db, sw, 'software');
  seedCatalog(db, dbs, 'database');

  const dsCounts = seedDatasets(db);
  const topicSummary = seedTopics(db);

  const counts = exportNdjson(db, NDJSON_DIR);

  console.log('CAAIL DB bootstrap — canonical Markdown -> SQLite -> NDJSON');
  console.log(`  papers        ${papers.references.length} refs, ${papers.cells.length} cells, ${counts.matrix_cells} citations`);
  console.log(`  software      ${sw.length} entries`);
  console.log(`  databases     ${dbs.length} entries`);
  console.log(`  datasets      ${counts.dataset_rows} inventory rows across ${Object.keys(dsCounts).length} pages`);
  console.log(`  topics        ${topicSummary.topics} topics, ${topicSummary.tags} item-topic tags`);
  console.log(`  -> NDJSON written to ${NDJSON_DIR}`);
}

main();
