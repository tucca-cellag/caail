/**
 * reseed-axes.ts — fold ONLY the DB-owned side axes (license + DOI) from their
 * committed inputs into the NDJSON, without going through `db:bootstrap`.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:reseed-axes
 *
 * Why this exists (issue #100): `db:bootstrap` re-derives EVERYTHING from the canonical
 * Markdown — including `item_topics` (from keyword classifiers, which overwrites the
 * topics `db:add` assigned from a descriptor) and catalog `ordinal`s. So using bootstrap
 * to fold a new license or DOI silently reverts curated topics and renumbers ordinals.
 *
 * This command instead materializes the committed NDJSON as-is and re-runs only
 * `seedLicenses` + `seedDois` (idempotent UPDATEs keyed by url / ds: id), then exports.
 * The diff is confined to `license` / `doi` (and their `_source`) columns — topics,
 * ordinals, and all Markdown are untouched. This is the fold step for the license/DOI
 * curation workflow (see the `caail-db-authoring` skill).
 *
 * The testable core (`reseedAxes`) takes an already-imported DB and is side-effect-free;
 * the NDJSON write happens only under the isMain CLI guard.
 */

import { fileURLToPath } from 'node:url';
import { importNdjson, exportNdjson, NDJSON_DIR, type Db } from './lib.js';
import { seedLicenses, seedDois } from './seed.js';

export interface ReseedSummary {
  licenses: { auto: number; manual: number };
  dois: { manual: number };
}

/**
 * Re-seed the license + DOI axes onto an already-imported DB. In-place, returns counts.
 *
 * Clears the four side-axis columns first, THEN re-seeds. This makes a reseed a pure
 * function of the current committed inputs (`licenses-manual.json` + `license-cache.json`
 * + `dois-manual.json`), so removing a manual override reconciles — the underlying
 * `seedLicenses`/`seedDois` only UPDATE keys still present, so without the clear a
 * retracted value would persist stale (the DB here is already populated, unlike the
 * fresh rows `db:bootstrap` seeds onto). Every license/DOI is reproducible from those
 * inputs (DOIs are all `manual`; licenses are `manual` or the auto SPDX cache), so the
 * clear loses nothing and stays a no-op on a clean tree.
 */
export function reseedAxes(db: Db): ReseedSummary {
  db.exec(
    'UPDATE catalog SET license=NULL, license_source=NULL, doi=NULL, doi_source=NULL;' +
      'UPDATE dataset_entries SET license=NULL, license_source=NULL, doi=NULL, doi_source=NULL;',
  );
  const licenses = seedLicenses(db);
  const dois = seedDois(db);
  return { licenses, dois };
}

function main(): void {
  const db = importNdjson(NDJSON_DIR);
  const { licenses, dois } = reseedAxes(db);
  exportNdjson(db, NDJSON_DIR);
  db.close();
  console.log(
    `db:reseed-axes — folded side axes into NDJSON: ` +
      `licenses ${licenses.manual} manual + ${licenses.auto} auto (GitHub SPDX); ` +
      `dois ${dois.manual} manual.`,
  );
  console.log(
    `  Only license/doi columns change; topics + ordinals are left intact. ` +
      `Review the diff and commit the NDJSON with its input file(s).`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
