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
import { bareDoi, doiRelation } from './doi-relation.js';
import type { DoiRelation } from './types.js';
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
 * carries no accession — `unavailable`, `supplementary`, or a non-NCBI badge — is
 * named after an accession merely MENTIONED in its Description. Several rows in the corpus
 * are like that; `ds:prjeb41939` is the clearest, a bovine FAANG atlas row whose Data reads
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

/** The identity a row carries, read from its Paper and Data cells (tucca-cellag/caail-planning#367). */
export interface RowIdentity {
  /** bare lowercase DOI of the row's paper or preprint; null for "none named" or no Paper column */
  paperDoi: string | null;
  /** what the Data cell holds; null when the table has no Data column or the cell is off-schema */
  dataStatus: 'deposit' | 'supplementary' | 'unavailable' | null;
  /** the deposit's accession, as its badge names it; null for a named-repository link or no deposit */
  accession: string | null;
  /** the deposit's link; null when there is no deposit */
  dataUrl: string | null;
  /** the deposit's DOI where its link states one; never derived from a record URL */
  dataDoi: string | null;
}

const NO_IDENTITY: RowIdentity = { paperDoi: null, dataStatus: null, accession: null, dataUrl: null, dataDoi: null };

/**
 * A markdown link's destination. CommonMark allows balanced parentheses inside one, and
 * DOIs use them (`10.1016/S0092-8674(20)30001-1`), so `[^)]+` would cut such a DOI short
 * and the anchored match below would then fail silently.
 */
const DEST = String.raw`((?:[^()\s]|\([^()\s]*\))+)`;
const PAPER_LINK = new RegExp(String.raw`^\[(?:DOI|preprint)\]\(${DEST}\)$`);
const BADGE_LINK = new RegExp('^\\[`([^`]+)`\\]\\(' + DEST + '\\)$');
const NAMED_LINK = new RegExp('^\\[[^\\]`]+\\]\\(' + DEST + '\\)$');

/**
 * The DOI a link states outright: a doi.org link on any host form (its path, cut at any
 * query string or fragment, decoded once; `bareDoi`'s shape check rejects every other host,
 * so no host list is kept here), or a literal `doi:` token anywhere in the URL (Dataverse's
 * `persistentId=doi:…`, Dryad's `/dataset/doi:…`). Never derived from a DOI-shaped path that
 * carries no such token, such as bioRxiv's `/content/10.1101/…`: that would be a guess about
 * the host.
 */
function statedDoi(url: string): string | null {
  let base = url.split(/[?#]/)[0]!.replace(/\/+$/, '');
  try { base = decodeURIComponent(base); } catch { /* keep the raw text */ }
  const direct = bareDoi(base);
  if (direct) return direct;
  let whole = url;
  try { whole = decodeURIComponent(whole); } catch { /* keep the raw text */ }
  const token = whole.match(/\bdoi:\s*(10\.[^&#?\s]+)/i);
  return token ? bareDoi(token[1]!.replace(/\/+$/, '')) : null;
}

/** A stated DOI, only when its relation is the one asked for (`publication` for a paper, `own` for a deposit). */
function statedDoiAs(url: string, relation: DoiRelation): string | null {
  const doi = statedDoi(url);
  return doi && doiRelation(doi) === relation ? doi : null;
}

/**
 * Read a row's identity from its cells, by header label (multi-species pages insert a
 * Species column, so positions differ). The shapes are the ones Datasets/CLAUDE.md allows:
 *
 * - **Paper**: a `[DOI](https://doi.org/…)` or `[preprint](…)` link, or `none named`.
 * - **Data**: an accession badge (`` [`GSE…`](url) ``), a named-repository link
 *   (`[Zenodo](url)`), or one of the status words `supplementary` and `unavailable`.
 * - **DOI / URL** (CrossSpecies, which has neither column above): one link. A stated DOI
 *   whose registrant is a data host is the deposit itself; any other DOI is the paper, with
 *   the deposit left unstated; a link with no DOI is where the data sit.
 *
 * The accession comes from the Data cell ONLY, never from the row's id: an id can be
 * minted from data a row merely mentions (tucca-cellag/caail-planning#715), which is the claim this field
 * exists to keep apart. A `dataDoi` is served only when it is a data host's DOI, and a Data
 * cell that links a paper's DOI is treated as off-schema. A cell outside these shapes yields nulls rather than throwing, since a throw here
 * would take the build down for a curation typo. Nothing rejects such a cell yet: the
 * Data-cell guard is planned for db:check (tucca-cellag/caail-planning#740), and until it lands the corpus
 * tests in dataset-identity.test.ts are what catch a silent null.
 */
export function rowIdentity(columns: Readonly<Record<string, string>>): RowIdentity {
  const paperLink = (columns['Paper']?.trim() ?? '').match(PAPER_LINK);
  const paperDoi = paperLink ? statedDoiAs(paperLink[1]!, 'publication') : null;

  if ('Data' in columns) {
    const data = columns['Data']!.trim();
    if (data === 'supplementary' || data === 'unavailable') return { ...NO_IDENTITY, paperDoi, dataStatus: data };
    const badge = data.match(BADGE_LINK);
    const named = badge ? null : data.match(NAMED_LINK);
    const url = badge?.[2] ?? named?.[1];
    if (!url) return { ...NO_IDENTITY, paperDoi };
    // A Data cell linking a paper's DOI points at an article, not a deposit: off-schema (the
    // schema's word for that is `supplementary`), so it yields no deposit fields at all and
    // the corpus test that every Data column has a status flags it.
    const doi = statedDoi(url);
    if (doi && doiRelation(doi) === 'publication') return { ...NO_IDENTITY, paperDoi };
    return { paperDoi, dataStatus: 'deposit', accession: badge ? badge[1]!.trim() : null, dataUrl: url, dataDoi: doi };
  }

  if ('DOI / URL' in columns) {
    const link = columns['DOI / URL']!.trim().match(NAMED_LINK);
    if (!link) return { ...NO_IDENTITY, paperDoi };
    const doi = statedDoi(link[1]!);
    if (doi && doiRelation(doi) === 'publication') return { ...NO_IDENTITY, paperDoi: paperDoi ?? doi };
    return { paperDoi, dataStatus: 'deposit', accession: null, dataUrl: link[1]!, dataDoi: doi };
  }

  return { ...NO_IDENTITY, paperDoi };
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
      const columns = Object.fromEntries(header.map((h, i) => [h, cells[i]!]));
      inventory.push({
        id: r.item_id,
        kind: 'inventory',
        page,
        name: cellText(cells[0] ?? ''),
        columns,
        links: rowLinks(cells),
        ...rowIdentity(columns),
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
   * accession legitimately has several rows (GSE158430 is fanned across three species pages)
   * the winner is stable. Building it from the raw NDJSON would have
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
