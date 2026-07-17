/**
 * bootstrap.ts — one-time (and re-runnable) ETL: canonical Markdown -> in-memory
 * SQLite -> committed NDJSON source. This is how the DB is first populated from the
 * hand-authored files, and how the NDJSON is regenerated if the canonical files are
 * re-imported. After bootstrap the NDJSON (site/db/ndjson/) is the source of truth.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:bootstrap
 */

import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPapersModel } from '../parser/papers.js';
import { openDb, exportNdjson, REPO_ROOT, NDJSON_DIR, type Db } from './lib.js';
import { extractCatalogEntries } from './extract.js';
import { seedPapers, seedCatalog, seedDatasets, seedTopics, seedLicenses, seedDois, seedRelatedDois } from './seed.js';

/**
 * Preserve retired paper-id tombstones across a re-bootstrap. They aren't in the
 * canonical Markdown (a removed paper leaves no trace there), so re-deriving from the
 * files alone would silently drop them and let a removed anchor be reused — regressing
 * the retired-id guarantee. Fold the committed tombstone NDJSON back in.
 */
export function preserveRetiredPaperIds(db: Db, dir: string = NDJSON_DIR): number {
  const path = join(dir, 'retired_paper_ids.ndjson');
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf-8').trim();
  if (!text) return 0;
  const ins = db.prepare('INSERT OR IGNORE INTO retired_paper_ids(ref_id) VALUES(?)');
  let n = 0;
  for (const line of text.split('\n')) { ins.run((JSON.parse(line) as { ref_id: number }).ref_id); n += 1; }
  return n;
}

export function main(): void {
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
  const retired = preserveRetiredPaperIds(db);
  const licenseSummary = seedLicenses(db);
  const doiSummary = seedDois(db);
  const relatedDoiSummary = seedRelatedDois(db);

  const counts = exportNdjson(db, NDJSON_DIR);

  console.log('CAAIL DB bootstrap — canonical Markdown -> SQLite -> NDJSON');
  console.log(`  papers        ${papers.references.length} refs, ${papers.cells.length} cells, ${counts.matrix_cells} citations`);
  console.log(`  software      ${sw.length} entries`);
  console.log(`  databases     ${dbs.length} entries`);
  console.log(`  datasets      ${counts.dataset_rows} inventory rows across ${Object.keys(dsCounts.rows).length} pages`);
  console.log(`  dataset entr. ${counts.dataset_entries} curated entries (atlases / GEMs / reference)`);
  console.log(`  topics        ${topicSummary.topics} topics, ${topicSummary.tags} item-topic tags`);
  console.log(`  retired ids   ${retired} paper tombstone(s) preserved`);
  console.log(`  licenses      ${licenseSummary.manual} manual, ${licenseSummary.auto} auto (GitHub SPDX)`);
  console.log(`  dois          ${doiSummary.manual} manual (associated-publication DOIs)`);
  console.log(`  related dois  ${relatedDoiSummary.rows} sibling-version sets (#102)`);
  console.log(`  -> NDJSON written to ${NDJSON_DIR}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
