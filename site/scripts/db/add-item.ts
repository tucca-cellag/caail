/**
 * add-item.ts (db:add) — add one item to the catalog from a JSON descriptor.
 * Rebuilds the DB from committed NDJSON, inserts the item (auto frozen-id), runs the
 * integrity guards, and — only if clean — writes the updated NDJSON + canonical
 * Markdown. Review the diff and commit Markdown + NDJSON together.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:add <descriptor.json>
 *
 * Descriptor shape: see ItemAdd in mutate.ts. Examples:
 *   { "type":"software", "name":"CameoPy", "url":"https://…", "group":"Metabolic Modeling & Strain Design", "body":"Summary: …", "topics":["metabolic-modeling"] }
 *   { "type":"paper", "raw":"Author, A. (2026). Title. *Journal*. https://doi.org/…", "label":"Author 2026", "cells":[{"method":"Deep Learning","area":"Media Optimization"}] }
 */

import { readFileSync } from 'node:fs';
import { importNdjson, exportNdjson } from './lib.js';
import { addItem, type ItemAdd } from './mutate.js';
import { runChecks } from './check.js';
import { emitAll } from './emit-files.js';

function main(): void {
  const file = process.argv[2];
  if (!file) { console.error('usage: db:add <descriptor.json>'); process.exit(1); }
  const spec = JSON.parse(readFileSync(file, 'utf-8')) as ItemAdd;

  const db = importNdjson();
  const id = addItem(db, spec);

  const bad = runChecks(db).filter((r) => !r.ok);
  if (bad.length) {
    console.error(`db:add: integrity check failed after adding ${id} — nothing written:`);
    for (const r of bad) console.error(`  ✗ ${r.label}: ${r.detail}`);
    process.exit(1);
  }
  // Emit FIRST — it re-parses/validates and throws on a bad state (e.g. a section with no
  // source anchor) BEFORE any file is written, so a failure can't leave the committed
  // NDJSON out of sync with the untouched Markdown. Only export once emit has succeeded.
  const written = emitAll(db);
  exportNdjson(db);
  console.log(`Added ${id}. Regenerated ${written.length} canonical files + NDJSON.`);
  console.log('Review the diff, then commit Markdown + NDJSON together.');
}

main();
