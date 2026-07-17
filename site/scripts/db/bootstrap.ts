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

/**
 * Preserve curated item↔topic tags across a re-bootstrap (#100 option b). `seedTopics`
 * re-derives every assignment from keyword classifiers, but the committed
 * `item_topics.ndjson` is authored by `db:add` (descriptor topics) and is the source of
 * truth once the DB exists — so a plain re-derive silently reverts that curation (e.g.
 * `sw:bridgedb` flipping metabolic-modeling -> ai-methods-tooling). When a committed file
 * is present, REPLACE the classifier-derived assignments with it (the committed tags win);
 * on a genuine first import (no committed file) keep the classifier output as the seed. The
 * topic *vocabulary* (themes + fine tags) is always freshly created by seedTopics either way.
 *
 * Replacement is scoped PER COMMITTED ITEM (not a whole-table wipe): the committed tags win
 * for items the curator has tagged, while an item ABSENT from the snapshot — e.g. a new
 * `db:add` entry without explicit topics — keeps its classifier-derived seed instead of being
 * silently zeroed. Every committed tag is validated against the freshly seeded vocabulary +
 * items BEFORE any mutation (a tag referencing an unknown topic/item — vocabulary drift since
 * it was written — fails loudly, leaving the DB untouched), and the replace runs inside a
 * savepoint. An empty/absent file is a genuine first import and keeps the classifier seed
 * (never wipe on an empty or corrupt snapshot). Returns the number of tags restored.
 */
export function preserveCuratedItemTopics(db: Db, dir: string = NDJSON_DIR): number {
  const path = join(dir, 'item_topics.ndjson');
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf-8').trim();
  if (!text) return 0;
  const topicIds = new Set((db.prepare("SELECT id FROM items WHERE type='topic'").all() as { id: string }[]).map((r) => r.id));
  const itemIds = new Set((db.prepare('SELECT id FROM items').all() as { id: string }[]).map((r) => r.id));

  // Parse + validate the whole snapshot BEFORE touching the table (no half-applied state).
  const byItem = new Map<string, string[]>();
  const bad: string[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue; // tolerate a stray blank line (e.g. a hand-resolved merge)
    const r = JSON.parse(line) as { item_id: string; topic_id: string };
    if (!itemIds.has(r.item_id) || !topicIds.has(r.topic_id)) { bad.push(`${r.item_id} -> ${r.topic_id}`); continue; }
    (byItem.get(r.item_id) ?? byItem.set(r.item_id, []).get(r.item_id)!).push(r.topic_id);
  }
  if (bad.length) {
    throw new Error(
      `preserveCuratedItemTopics: ${bad.length} committed tag(s) reference an unknown item/topic ` +
        `(vocabulary drift?): ${bad.slice(0, 5).join('; ')}`,
    );
  }

  db.exec('SAVEPOINT preserve_item_topics');
  try {
    const del = db.prepare('DELETE FROM item_topics WHERE item_id=?');
    const ins = db.prepare('INSERT INTO item_topics(item_id,topic_id) VALUES(?,?)');
    let n = 0;
    for (const [itemId, topics] of byItem) {
      del.run(itemId); // replace only THIS item's tags — items absent from the snapshot are untouched
      for (const t of topics) { ins.run(itemId, t); n += 1; }
    }
    db.exec('RELEASE preserve_item_topics');
    return n;
  } catch (e) {
    db.exec('ROLLBACK TO preserve_item_topics');
    db.exec('RELEASE preserve_item_topics');
    throw e;
  }
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
  const preservedTags = preserveCuratedItemTopics(db);
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
  console.log(
    `  topics        ${topicSummary.topics} topics, ` +
      `${preservedTags || topicSummary.tags} item-topic tags ` +
      `(${preservedTags ? 'curated, preserved from committed NDJSON' : 'classifier-derived — first import'})`,
  );
  console.log(`  retired ids   ${retired} paper tombstone(s) preserved`);
  console.log(`  licenses      ${licenseSummary.manual} manual, ${licenseSummary.auto} auto (GitHub SPDX)`);
  console.log(`  dois          ${doiSummary.manual} manual (associated-publication DOIs)`);
  console.log(`  related dois  ${relatedDoiSummary.rows} sibling-version sets (#102)`);
  console.log(`  -> NDJSON written to ${NDJSON_DIR}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
