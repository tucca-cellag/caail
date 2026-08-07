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
  ordinal: number;
}

/**
 * Every URL in a row, deduped, in document order.
 *
 * The cells are `inlineMd` output, so a link is `[text](target)` and a bare URL is plain
 * text; one pattern catches both. `)`, `]`, `>` and whitespace terminate a match so a
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
  for (const page of pages) {
    const table = extractInventory(join(repoRoot, 'Datasets', `${page}.md`));
    if (!table) {
      throw new Error(
        `dataset-inventory: ${byPage.get(page)!.length} row(s) are recorded for page ` +
          `"${page}" but Datasets/${page}.md has no "## Complete data inventory" table. ` +
          `Re-run \`pnpm db:bootstrap\` or restore the table.`,
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
      });
    }
  }

  return DatasetInventorySchema.parse({ inventory });
}
