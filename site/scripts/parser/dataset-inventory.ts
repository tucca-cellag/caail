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

/**
 * Every markdown link destination in a cell, in order, read with `DEST` so a DOI holding
 * balanced parentheses comes back whole.
 */
export function linkDestinations(cell: string): string[] {
  return [...cell.matchAll(new RegExp(String.raw`\]\(${DEST}\)`, 'g'))].map((m) => m[1]!);
}
const BADGE_LINK = new RegExp('^\\[`([^`]+)`\\]\\(' + DEST + '\\)$');
/** A link whose text is plain words: group 1 is the text, group 2 the destination. */
const NAMED_LINK = new RegExp('^\\[([^\\]`]+)\\]\\(' + DEST + '\\)$');

/**
 * The DOI a link states outright: a doi.org link on any host form (its path, cut at any
 * query string or fragment, decoded once; `bareDoi`'s shape check rejects every other host,
 * so no host list is kept here), or a literal `doi:` token anywhere in the URL (Dataverse's
 * `persistentId=doi:…`, Dryad's `/dataset/doi:…`). Never derived from a DOI-shaped path that
 * carries no such token, such as bioRxiv's `/content/10.1101/…`: that would be a guess about
 * the host.
 */
export function statedDoi(url: string): string | null {
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

/** The words a Data cell may hold in place of a deposit link (Datasets/CLAUDE.md). */
export const STATUS_WORDS = ['supplementary', 'unavailable'] as const;
type StatusWord = (typeof STATUS_WORDS)[number];
const isStatusWord = (s: string): s is StatusWord => (STATUS_WORDS as readonly string[]).includes(s);

/** The forms a Data cell may take, worded for a check's label and a curator's reason; the words are quoted as literals. */
export const DATA_CELL_FORMS = ['a deposit link', ...STATUS_WORDS.map((w) => `"${w}"`)].join(', ').replace(/, (?=[^,]*$)/, ' or ');

/** An http(s) address with a host. */
const WEB_ADDRESS = /^https?:\/\/[^\s/?#]+/i;

/**
 * Whole labels from the schema's own vocabulary that name no deposit: `none named` (the Paper
 * cell's word for no DOI) and `see paper` (a Data status word retired in tucca-cellag/caail#56).
 * Matched against the whole label, never as words inside one: a word rule refused a real
 * controlled-access label ("request via DAC") while still passing "Embargoed", because no list
 * of words tells a deposit from a non-deposit by its label.
 */
export const NON_DEPOSIT_LABELS: readonly string[] = ['none named', 'see paper'];

/** A Data-cell label starting with this names a supplement, which is written as the bare word "supplementary". */
export const SUPPLEMENT_PREFIX = 'supplement';

/**
 * Why a link's text names no deposit, or null when it may name one. In any link cell: blank
 * text, or a whole label in NON_DEPOSIT_LABELS. In a Data cell only, where the status words
 * exist: a whole label that is a status word (which stands alone), and a label starting with
 * SUPPLEMENT_PREFIX (written as the bare word "supplementary", with the file named in
 * Description). A CrossSpecies DOI / URL cell has no status word, so a link to a supplement
 * there may be exactly where the data sit. Any other label passes, including one like
 * "Embargoed" or "upon request" that a curator should have written another way: the guard does
 * not check that a link reaches the deposit it names.
 */
function nonDepositLabel(raw: string, cell: 'data' | 'link'): string | null {
  const text = raw.trim();
  if (text === '') return 'is a link with no text';
  const lower = text.toLowerCase();
  if (cell === 'data' && isStatusWord(lower)) return `writes the status word "${lower}" as a link; a status word stands alone`;
  if (cell === 'data' && lower.startsWith(SUPPLEMENT_PREFIX)) {
    return `is a link labelled "${text}": a supplementary results table is written as the bare word "supplementary", with the file named in Description`;
  }
  if (NON_DEPOSIT_LABELS.includes(lower)) return `is a link labelled "${text}", which names no deposit`;
  return null;
}

/** A cell that starts like a link and ends like one, but which the strict patterns cannot read. */
const LINK_LIKE = /^\[[^\]]*\]\(.*\)$/;
const EMPTY_LABEL = /^\[\s*\]\(/;

/** Why a link-shaped cell the strict patterns cannot read is off-schema, naming the form they accept. */
function unreadableLink(cell: string, forms: string): string {
  if (EMPTY_LABEL.test(cell)) return 'is a link with no text';
  return `is not one link in a form the parser reads: ${forms} and nothing else, with any space in the address percent-encoded`;
}

/** What a Data cell holds, or why it is outside the schema. */
export type DataCellReading =
  | { kind: 'status'; status: StatusWord }
  | { kind: 'deposit'; accession: string | null; url: string; doi: string | null }
  | { kind: 'off-schema'; reason: string };

/**
 * Read one Data cell against the shapes Datasets/CLAUDE.md allows: an accession badge
 * (`` [`GSE…`](url) ``), a named-repository link (`[Zenodo](url)`), or a bare status word.
 * Off-schema, each with the reason a curator needs: anything that is not a link; a status
 * word in the wrong case; a link whose target is not an http(s) address (`mailto:`, `#`, a
 * relative path, an address with no host) or cannot be read; a badge whose text is not one
 * identifier; a link whose text names no deposit (see `nonDepositLabel`); and a link to a DOI
 * whose registrant is not a data host, which is
 * either a paper (it belongs in the Paper cell) or a deposit on a host the registrant list
 * lacks. It judges a link by its form and, for a DOI, by the DOI's registrant; it does not
 * check that the link reaches the deposit it names, so a repository name linking elsewhere passes.
 */
export function readDataCell(cell: string): DataCellReading {
  const data = cell.trim();
  if (isStatusWord(data)) return { kind: 'status', status: data };
  if (isStatusWord(data.toLowerCase())) {
    return { kind: 'off-schema', reason: `writes a status word in the wrong case; write "${data.toLowerCase()}"` };
  }
  const badge = data.match(BADGE_LINK);
  const named = badge ? null : data.match(NAMED_LINK);
  const url = badge?.[2] ?? named?.[2];
  if (!url) {
    const reason = LINK_LIKE.test(data)
      ? unreadableLink(data, 'one [`ACCESSION`](address) badge or one [Repository](address) link')
      : `is not ${DATA_CELL_FORMS}`;
    return { kind: 'off-schema', reason };
  }
  const label = nonDepositLabel(badge?.[1] ?? named?.[1] ?? '', 'data');
  if (label) return { kind: 'off-schema', reason: label };
  if (badge && /\s/.test(badge[1]!.trim())) {
    return { kind: 'off-schema', reason: `is a badge whose text "${badge[1]!.trim()}" is not one identifier; a badge names one accession` };
  }
  if (!WEB_ADDRESS.test(url)) return { kind: 'off-schema', reason: `links "${url}", which is not an http(s) address with a host` };
  const doi = statedDoi(url);
  if (doi && doiRelation(doi) === 'publication') {
    return {
      kind: 'off-schema',
      reason: `links ${doi}, whose registrant is not a data host: a paper's DOI belongs in the Paper cell, ` +
        'and a deposit on an unlisted host needs its registrant added to DATA_REPOSITORY_REGISTRANTS ' +
        '(site/scripts/parser/doi-relation.ts)',
    };
  }
  return { kind: 'deposit', accession: badge ? badge[1]!.trim() : null, url, doi };
}

/** What a CrossSpecies `DOI / URL` cell holds, or why it is outside the schema. */
export type LinkCellReading =
  | { kind: 'paper'; doi: string }
  | { kind: 'deposit'; url: string; doi: string | null }
  | { kind: 'off-schema'; reason: string };

/**
 * Read a CrossSpecies `DOI / URL` cell: one link to an http(s) address. A stated DOI whose
 * registrant is a data host is the deposit itself; any other DOI is the paper, with the
 * deposit left unstated; a link with no DOI is where the data sit. No status word applies,
 * since a resource with nothing to link has no row.
 */
export function readLinkCell(cell: string): LinkCellReading {
  const trimmed = cell.trim();
  if (BADGE_LINK.test(trimmed)) {
    return { kind: 'off-schema', reason: 'is a code-styled badge; on this page write the link text plain, as [10.…](https://doi.org/10.…)' };
  }
  const link = trimmed.match(NAMED_LINK);
  if (!link) {
    return { kind: 'off-schema', reason: LINK_LIKE.test(trimmed) ? unreadableLink(trimmed, 'one [text](address) link') : 'is not a link' };
  }
  const label = nonDepositLabel(link[1]!, 'link');
  if (label) return { kind: 'off-schema', reason: label };
  const url = link[2]!;
  if (!WEB_ADDRESS.test(url)) return { kind: 'off-schema', reason: `links "${url}", which is not an http(s) address with a host` };
  const doi = statedDoi(url);
  if (doi && doiRelation(doi) === 'publication') return { kind: 'paper', doi };
  return { kind: 'deposit', url, doi };
}

/** A page's inventory header labels, or why they cannot be read. */
export type InventoryHeader = { header: string[] } | { problem: string };

/**
 * A page's `## Complete data inventory` header labels, trimmed, from its committed table:
 * the DB stores a row's cells without labels, and `db:emit` reads the header back from the
 * page. Refuses a repeated label, since keying columns by label would silently drop one.
 * Shared by the API build and db:check, so the two cannot label a row differently.
 */
export function readInventoryHeader(page: string, repoRoot: string = DEFAULT_REPO_ROOT): InventoryHeader {
  const path = join(repoRoot, 'Datasets', `${page}.md`);
  // Checked first: extractInventory reads the file, so a missing page would surface as a
  // bare ENOENT rather than as the reason below.
  if (!existsSync(path)) return { problem: `Datasets/${page}.md does not exist: restore the page, or re-run \`pnpm db:bootstrap\`` };
  const table = extractInventory(path);
  if (!table) {
    return { problem: `Datasets/${page}.md has no "## Complete data inventory" table: restore the heading and table, or re-run \`pnpm db:bootstrap\`` };
  }
  // extractInventory trims cells already; trimmed again so a change there cannot split one label in two.
  const header = table.header.map((h) => h.trim());
  if (new Set(header).size !== header.length) {
    return { problem: `Datasets/${page}.md repeats a column label (${header.join(' | ')}): rename the duplicate, since keying by label would drop one` };
  }
  return { header };
}

/**
 * A row's stored cells, or why they cannot be read: `cells_json` must be a JSON array of
 * strings, since every reader calls string methods on each cell. Shared by the API build and
 * db:check, so a bad row fails both with the same reason rather than crashing one of them.
 */
export function parseRowCells(cellsJson: string): { cells: string[] } | { problem: string } {
  let cells: unknown;
  try { cells = JSON.parse(cellsJson); } catch { return { problem: 'cells_json is not JSON' }; }
  if (!Array.isArray(cells)) return { problem: 'cells_json is not an array' };
  if (!cells.every((c) => typeof c === 'string')) return { problem: 'cells_json holds a cell that is not a string' };
  return { cells: cells as string[] };
}

/** A row's cells keyed by header label; null when the cell count differs from the header's. */
export function labelCells(header: readonly string[], cells: readonly string[]): Record<string, string> | null {
  return cells.length === header.length ? Object.fromEntries(header.map((h, i) => [h, cells[i]!])) : null;
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
 * cell that links a paper's DOI is treated as off-schema. A cell outside these shapes yields
 * nulls rather than throwing, since a throw here would take the build down for a curation
 * typo. Rejecting it is db:check's job: `checkInventoryCells` (site/scripts/db/check.ts,
 * tucca-cellag/caail-planning#740) reads every cell with the same `readDataCell` and
 * `readLinkCell` this function uses and fails any it puts outside the schema, so `db:add`
 * refuses such a cell before it reaches the Markdown.
 */
export function rowIdentity(columns: Readonly<Record<string, string>>): RowIdentity {
  const paperLink = (columns['Paper']?.trim() ?? '').match(PAPER_LINK);
  const paperDoi = paperLink ? statedDoiAs(paperLink[1]!, 'publication') : null;

  if ('Data' in columns) {
    // An off-schema cell, including one linking a paper's DOI rather than a deposit, yields
    // no deposit fields at all; readDataCell says why, for db:check to report.
    const data = readDataCell(columns['Data']!);
    if (data.kind === 'status') return { ...NO_IDENTITY, paperDoi, dataStatus: data.status };
    if (data.kind === 'off-schema') return { ...NO_IDENTITY, paperDoi };
    return { paperDoi, dataStatus: 'deposit', accession: data.accession, dataUrl: data.url, dataDoi: data.doi };
  }

  if ('DOI / URL' in columns) {
    const link = readLinkCell(columns['DOI / URL']!);
    if (link.kind === 'off-schema') return { ...NO_IDENTITY, paperDoi };
    if (link.kind === 'paper') return { ...NO_IDENTITY, paperDoi: paperDoi ?? link.doi };
    return { paperDoi, dataStatus: 'deposit', accession: null, dataUrl: link.url, dataDoi: link.doi };
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
    const read = readInventoryHeader(page, repoRoot);
    if ('problem' in read) {
      throw new Error(`dataset-inventory: page "${page}" (${byPage.get(page)!.length} row(s)): ${read.problem}.`);
    }
    const header = read.header;

    for (const r of [...byPage.get(page)!].sort((a, b) => a.ordinal - b.ordinal)) {
      const parsed = parseRowCells(r.cells_json);
      if ('problem' in parsed) throw new Error(`dataset-inventory: ${r.item_id}: ${parsed.problem}.`);
      const cells = parsed.cells;
      const columns = labelCells(header, cells);
      if (!columns) {
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
