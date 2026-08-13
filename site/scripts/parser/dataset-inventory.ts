/**
 * dataset-inventory.ts — build the per-species inventory rows for the agent API.
 *
 * These are the `## Complete data inventory` table rows: the per-study deposits carrying
 * accession, tissue, assay type and size. They are what a researcher would actually
 * combine their own run with, and until now they existed only as a COUNT in the site
 * model (`datasets.ts`) and as opaque cells in the DB, so an agent fetching
 * `api/datasets.json` saw 3 bovine datasets where a reader of `Datasets/Cow.md` sees 34.
 *
 * Two sources, each for the thing it owns:
 *   - the committed `dataset_rows` NDJSON gives the frozen `ds:` id and the cells, read
 *     offline like the topic model (the DB is the source of truth for catalog content);
 *   - the canonical Markdown gives the COLUMN HEADERS, which the DB does not store —
 *     `db:emit` reads them back from the page for the same reason.
 *
 * They cannot silently disagree: CI already runs `db:emit` and diffs the Markdown, so a
 * row whose cell count stopped matching its header would fail there. This module asserts
 * it anyway rather than emitting a row keyed by the wrong labels.
 *
 * Deliberately NOT part of `buildDatasetsModel` — see DatasetInventoryRowSchema for why
 * these stay out of the site's datasets.json.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toString as mdastToString } from 'mdast-util-to-string';

import { ACCESSION, idAccession } from '../db/lib.js';
import { extractInventory } from '../db/extract.js';
import { parseMarkdown } from './markdown.js';
import { topicsByItemId } from './topics.js';
import { INVENTORY_PAGES } from './datasets.js';
import {
  DatasetInventorySchema,
  type DatasetInventory,
  type DatasetInventoryRow,
} from './types.js';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

/** parser/ → scripts/ → site/ → repo root. */
const DEFAULT_REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

interface RowNdjson {
  item_id: string;
  page: string;
  cells_json: string;
  subseries: string | null;
  ordinal: number;
}

/**
 * Parse the `subseries` JSON-array column (a committed string) into member accessions.
 * Tolerates absent/malformed values by returning `[]` — `db:check` is what fails a bad
 * one, and a parse that threw here would take the whole build down for a curation typo.
 */
export function parseSubseries(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((a): a is string => typeof a === 'string') : [];
  } catch { return []; }
}

/** Re-exported so callers of this module get the id/deposit pair from one import. */
export { idAccession };

/**
 * The accession a row's deposit is actually filed under: the first accession in its **Data**
 * column, falling back to the one encoded in its id.
 *
 * The id alone is not trustworthy for this, which is the subtle part. `db:add` mints a `ds:`
 * id from the first accession found anywhere in the joined cells, so a row whose Data column
 * carries no accession — `unavailable`, `on request`, `none named`, or a non-NCBI badge — is
 * named after an accession merely MENTIONED in its Description. Five rows in the corpus are
 * like that today; `ds:prjeb41939` is the clearest, a bovine FAANG atlas row whose Data reads
 * `unavailable` and whose id comes from public data the study REUSED.
 *
 * Resolving members by id would therefore have pointed an agent at a row that is not the
 * deposit it asked for: the same class of silent wrongness the subseries axis exists to fix,
 * reintroduced by the fix. Reading the Data column keeps the claim and the mention apart,
 * which is what the id cannot do.
 *
 * @param dataCell The row's `Data` cell, located by header label rather than by index —
 *   multi-species pages insert a Species column and nothing guarantees a fixed position.
 */
export function rowDepositAccession(itemId: string, dataCell: string): string {
  return dataCell.toUpperCase().match(ACCESSION)?.[0] ?? idAccession(itemId);
}

/**
 * Every URL in a row, deduped, in document order.
 *
 * The cells are `inlineMd` output, so a link is `[text](target)` and a bare URL is plain
 * text; one pattern catches both. `)`, `]`, `<`, `>` and whitespace terminate a match so a
 * markdown link's closing paren is never swallowed, and trailing sentence punctuation is
 * trimmed because a cell often ends `…/dataset.`
 */
export function rowLinks(cells: readonly string[]): string[] {
  const out: string[] = [];
  for (const cell of cells) {
    for (const m of cell.matchAll(/https?:\/\/[^\s)\]<>]+/g)) {
      const url = m[0].replace(/[.,;:]+$/, '');
      if (!out.includes(url)) out.push(url);
    }
  }
  return out;
}

/**
 * Flatten a raw markdown cell to plain text — the same round-trip `catalogNameKey` uses,
 * so `` `GSE169291` `` and `[Title](url)` reduce to what a reader sees rather than to
 * markdown punctuation.
 */
export function cellText(cell: string): string {
  return mdastToString(parseMarkdown(cell)).trim();
}

function readRows(ndjsonDir: string): RowNdjson[] {
  const path = join(ndjsonDir, 'dataset_rows.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  return text ? text.split('\n').map((l) => JSON.parse(l) as RowNdjson) : [];
}

/**
 * Build the inventory model, in page order then table order.
 *
 * @param repoRoot  Repository root (override in tests to point at a fixture directory).
 * @param ndjsonDir Committed NDJSON directory (defaults to `site/db/ndjson`).
 */
export function buildDatasetInventory(
  repoRoot: string = DEFAULT_REPO_ROOT,
  ndjsonDir: string = NDJSON_DIR,
): DatasetInventory {
  const byId = topicsByItemId();
  const rows = readRows(ndjsonDir);

  const byPage = new Map<string, RowNdjson[]>();
  for (const r of rows) (byPage.get(r.page) ?? byPage.set(r.page, []).get(r.page)!).push(r);

  // Emit in the canonical page order, then by ordinal, so the output is a pure function
  // of the repo state and the committed API file does not churn on NDJSON row order.
  const pages = [
    ...INVENTORY_PAGES.filter((p) => byPage.has(p)),
    ...[...byPage.keys()].filter((p) => !INVENTORY_PAGES.includes(p)).sort(),
  ];

  const inventory: DatasetInventoryRow[] = [];
  /** item_id -> its raw member accessions, resolved once every page has been read. */
  const pending = new Map<string, string[]>();
  for (const page of pages) {
    const path = join(repoRoot, 'Datasets', `${page}.md`);
    // Check existence separately: extractInventory readFileSync's the path, so a page
    // recorded in the NDJSON whose Markdown is missing would surface as a bare ENOENT and
    // the actionable guidance below would never reach the operator. Same fault, two causes.
    const table = existsSync(path) ? extractInventory(path) : null;
    if (!table) {
      throw new Error(
        `dataset-inventory: ${byPage.get(page)!.length} row(s) are recorded for page ` +
          `"${page}" but Datasets/${page}.md ` +
          (existsSync(path)
            ? 'has no "## Complete data inventory" table.'
            : 'does not exist.') +
          ` Re-run \`pnpm db:bootstrap\` or restore the page.`,
      );
    }
    const header = table.header.map((h) => h.trim());
    if (new Set(header).size !== header.length) {
      throw new Error(
        `dataset-inventory: Datasets/${page}.md repeats a column label ` +
          `(${header.join(' | ')}). Keying columns by label would silently drop one; ` +
          `rename the duplicate.`,
      );
    }

    for (const r of [...byPage.get(page)!].sort((a, b) => a.ordinal - b.ordinal)) {
      const cells = JSON.parse(r.cells_json) as string[];
      if (cells.length !== header.length) {
        throw new Error(
          `dataset-inventory: ${r.item_id} has ${cells.length} cell(s) but ` +
            `Datasets/${page}.md declares ${header.length} column(s). The DB and the ` +
            `Markdown have diverged — re-run \`pnpm db:bootstrap\`.`,
        );
      }
      inventory.push({
        id: r.item_id,
        kind: 'inventory',
        page,
        name: cellText(cells[0] ?? ''),
        columns: Object.fromEntries(header.map((h, i) => [h, cells[i]!])),
        links: rowLinks(cells),
        topics: byId.get(r.item_id) ?? [],
        // Filled in below: resolution needs every page's rows to exist first.
        subseries: [],
      });
      pending.set(r.item_id, parseSubseries(r.subseries));
    }
  }

  /*
   * Accession -> the id of the row catalogueing it, so a SuperSeries member resolves to its
   * own row where one exists.
   *
   * Built over EVERY page rather than per page, because a multi-species SuperSeries has
   * members that surface on a different species page than its parent, and a per-page map
   * would report those as uncatalogued.
   *
   * Two properties this depends on. The accession comes from each row's DATA column, not
   * from its id (see rowDepositAccession). And it is built by walking `inventory`, which is
   * already in canonical page-then-ordinal order, keeping the FIRST claimant — so where one
   * accession legitimately has several rows (GSE158430 is fanned across three species pages,
   * PRJNA527944 across two) the winner is stable. Building it from the raw NDJSON would have
   * been last-write-wins over an unordered list, and since `db:add` assigns a GLOBAL
   * `MAX(ordinal)+1`, adding an unrelated row on any page could silently flip which species
   * row a member pointed at between two builds.
   */
  const dataOf = (r: DatasetInventoryRow): string => r.columns.Data ?? '';
  const rowByAccession = new Map<string, string>();
  for (const r of inventory) {
    const acc = rowDepositAccession(r.id, dataOf(r));
    if (!rowByAccession.has(acc)) rowByAccession.set(acc, r.id);
  }

  for (const r of inventory) {
    r.subseries = (pending.get(r.id) ?? []).map((accession) => ({
      accession,
      id: rowByAccession.get(accession) ?? null,
    }));
  }

  return DatasetInventorySchema.parse({ inventory });
}
