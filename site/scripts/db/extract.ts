/**
 * extract.ts — pull the DB-owned structured content out of the canonical
 * Markdown, reusing the real parser's mdast helpers. Used by both the bootstrap
 * ETL (canonical MD -> DB) and the emitter's fidelity checks. Promoted from the
 * sqlite-replatform extractGroupEntries / extractInventory / inlineMd.
 */

import { readFileSync } from 'node:fs';
import { parseMarkdown, sectionsAfter } from '../parser/markdown.js';
import { entryHeadingDepth, isEntryHeading, pageFromPath } from '../parser/datasets.js';
import { isEditionSort, invalidEditionSort } from '../parser/reports.js';
import { slugify } from './lib.js';
import type { Table, TableRow, TableCell } from 'mdast';

/**
 * Per-reference trailing blockquote run: the verbatim `> …` blockquote block(s)
 * immediately following each `<a id="N">` citation paragraph — Code, Data, Models, or
 * any label — keyed by ref id. Stored whole on the paper so the emitter reproduces them
 * in place; the DB's old typed code_url/data_url modelled only two labels, so an
 * unmodelled `> **Models**:` survived emit only by adjacency and floated onto the wrong
 * paper when a reference was added. The anchor match mirrors the parser's
 * whitespace-tolerant ANCHOR_OPEN_RE.
 */
export function extractPaperBlockquotes(path: string): Map<number, string> {
  const src = readFileSync(path, 'utf-8');
  const kids = parseMarkdown(src).children as any[];
  const out = new Map<number, string>();
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n.type !== 'paragraph') continue;
    const head = src.slice(n.position.start.offset, n.position.start.offset + 48);
    const m = /^<a\s+id="(\d+)">/.exec(head);
    if (!m) continue;
    const parts: string[] = [];
    for (let j = i + 1; j < kids.length; j++) {
      if (kids[j].type !== 'blockquote') break;
      parts.push(src.slice(kids[j].position.start.offset, kids[j].position.end.offset));
    }
    if (parts.length) out.set(Number(m[1]), parts.join('\n\n'));
  }
  return out;
}

/** Minimal mdast text flatten (avoids importing mdast-util-to-string at runtime). */
export function flat(node: any): string {
  if (node == null) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) return node.children.map(flat).join('');
  return '';
}

/**
 * Serialize an inline mdast node back to markdown (text/link/code/emphasis/…).
 * Table cell byte-offsets include the `|` delimiters, so offset-slicing is wrong;
 * child-serialization is a clean fixed point (re-parse -> re-serialize is stable).
 */
export function inlineMd(node: any): string {
  switch (node.type) {
    case 'text': return node.value;
    case 'inlineCode': return '`' + node.value + '`';
    case 'link': return `[${(node.children ?? []).map(inlineMd).join('')}](${node.url})`;
    case 'image': return `![${node.alt ?? ''}](${node.url})`;
    case 'emphasis': return `*${(node.children ?? []).map(inlineMd).join('')}*`;
    case 'strong': return `**${(node.children ?? []).map(inlineMd).join('')}**`;
    case 'delete': return `~~${(node.children ?? []).map(inlineMd).join('')}~~`;
    case 'break': return ' ';
    case 'html': return node.value;
    default: return node.children ? node.children.map(inlineMd).join('') : (node.value ?? '');
  }
}

export interface CatalogRaw {
  name: string;      // inline markdown of the H3 link text
  url: string;
  group: string;     // enclosing H2 label
  headingMd: string; // full H3 heading source after '### ' (preserves trailing annotations)
  bodyMd: string;    // raw body markdown after the H3, up to the next heading
}

/**
 * Every H3 catalog entry in a Software.md / Databases.md file, in document order,
 * WITH its raw body markdown (offset-sliced). Generalizes the sqlite-replatform
 * extractGroupEntries across all H2 groups.
 */
export function extractCatalogEntries(path: string): CatalogRaw[] {
  const src = readFileSync(path, 'utf-8');
  const kids = parseMarkdown(src).children as any[];
  const out: CatalogRaw[] = [];
  let group = '';
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n.type !== 'heading') continue;
    if (n.depth === 2) { group = inlineMd(n).trim(); continue; }
    if (n.depth !== 3) continue;
    const link = (n.children as any[]).find((c) => c.type === 'link');
    if (!link) continue;
    let s: number | null = null, e = 0;
    for (let j = i + 1; j < kids.length; j++) {
      // An entry ends at the next H2/H3 (group or sibling entry); a deeper H4+ is body
      // content, so don't truncate the body there.
      if (kids[j].type === 'heading' && (kids[j] as any).depth <= 3) break;
      if (s === null) s = kids[j].position.start.offset;
      e = kids[j].position.end.offset;
    }
    out.push({
      name: (link.children ?? []).map(inlineMd).join('').trim(),
      url: link.url,
      group,
      headingMd: (n.children as any[]).map(inlineMd).join('').trim(),
      bodyMd: s === null ? '' : src.slice(s, e),
    });
  }
  return out;
}

/**
 * The matrix table's raw header markdown per axis: column headers (areas, skipping
 * the empty corner cell) and row labels (methods, first cell of each body row),
 * each as linked markdown. Keyed by the flattened label so seed can match them to
 * the parser model's plain labels.
 */
export function extractMatrixHeaders(path: string): { areas: string[]; methods: string[] } {
  const src = readFileSync(path, 'utf-8');
  const table = (parseMarkdown(src).children as any[]).find((n) => n.type === 'table') as Table | undefined;
  if (!table) throw new Error(`extractMatrixHeaders: no matrix table in ${path}`);
  const rows = table.children as TableRow[];
  const cellMd = (c: TableCell) => (c.children as any[]).map(inlineMd).join('').trim();
  const areas = (rows[0].children as TableCell[]).slice(1).map(cellMd); // drop empty corner
  const methods = rows.slice(1).map((r) => cellMd((r.children as TableCell[])[0]));
  return { areas, methods };
}

export interface DatasetEntryRaw {
  name: string;              // inline text of the H3 link, or the heading text when unlinked
  url: string | null;        // H3 link target; null for unlinked GEM/reference headings
  section: string;           // enclosing H2 label
  kind: 'atlas' | 'gem' | 'other';
  headingMd: string;         // full H3 heading source after '### '
  bodyMd: string;            // raw body markdown after the H3, up to the next heading
}

/** kind heuristic from the enclosing H2 section label (soft; refined per curator). */
function entryKind(section: string): 'atlas' | 'gem' | 'other' {
  if (/metabolic|genome[- ]?scale|\bgem\b/i.test(section)) return 'gem';
  if (/atlas|corpora|single[- ]?cell|perturbation/i.test(section)) return 'atlas';
  return 'other';
}

/**
 * Every curated dataset entry on a `Datasets/<page>.md` page — the featured atlases +
 * GEMs (species pages), the reference-page entries, and the benchmark datasets. Unlike
 * catalog entries the heading link is OPTIONAL: a bare `### iES1300 — *Gallus gallus*`
 * GEM heading, or `## BioMysteryBench`, yields `url: null`.
 *
 * The entry depth is per-page (`entryHeadingDepth`), not a constant: every page marks an
 * entry with `###` under an `##` section, except Benchmarks, which uses one `##` per
 * dataset and has no enclosing section (its entries therefore carry `section: ''`).
 * Hardcoding depth 3 here is what left the 17 benchmarks out of the DB entirely (#156).
 */
export function extractDatasetEntries(path: string): DatasetEntryRaw[] {
  const src = readFileSync(path, 'utf-8');
  const kids = parseMarkdown(src).children as any[];
  const page = pageFromPath(path);
  const depth = entryHeadingDepth(page);
  const out: DatasetEntryRaw[] = [];
  let section = '';
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    // Only an H3-entry page has enclosing H2 sections to track; on an H2-entry page the
    // H2 *is* the entry, so consuming it as a section label here would swallow every one.
    // `flat`, not `inlineMd`: isEntryHeading compares exact strings, so it must see the
    // heading's plain text. (No section in the corpus carries markdown, so this also leaves
    // the stored `section` byte-identical.)
    if (depth === 3 && n.type === 'heading' && n.depth === 2) { section = flat(n).trim(); continue; }
    if (n.type !== 'heading' || n.depth !== depth) continue;
    if (!isEntryHeading(page, flat(n).trim(), section)) continue;
    const link = (n.children as any[]).find((c) => c.type === 'link');
    let s: number | null = null, e = 0;
    // Break only at a heading at or above the entry depth — nested sub-sections (e.g. the
    // Arc Virtual Cell Atlas umbrella's `#### Tahoe-100M` / `#### scBaseCount`) belong to
    // THIS entry's body, not a separate entry (the depth filter above already excludes
    // them) and not the next one. Mirrors extractCatalogEntries' body boundary.
    for (let j = i + 1; j < kids.length; j++) {
      if (kids[j].type === 'heading' && kids[j].depth <= depth) break;
      if (s === null) s = kids[j].position.start.offset;
      e = kids[j].position.end.offset;
    }
    out.push({
      name: (link ? (link.children ?? []).map(inlineMd).join('') : inlineMd(n)).trim(),
      url: link ? link.url : null,
      section,
      kind: entryKind(section),
      headingMd: (n.children as any[]).map(inlineMd).join('').trim(),
      bodyMd: s === null ? '' : src.slice(s, e),
    });
  }
  return out;
}

export interface ReportRaw {
  name: string;               // inline text of the H3 link, or the heading text when unlinked
  url: string | null;         // H3 link target; null for an unlinked heading
  seriesSlug: string | null;  // slug of the enclosing H2 series section; null for a top-level one-off
  editionLabel: string;       // human edition label, e.g. '2026' (from the italic edition line)
  editionSort: string;        // sortable latest-key; max wins in a series (rules: parser/reports.ts seriesRecency)
  headingMd: string;          // full H3 heading source after '### '
  bodyMd: string;             // raw body markdown after the H3 (INCLUDES the italic edition line)
}

/**
 * The italic edition line every report body leads with (CAAIL-364): `*Edition <label>,
 * published <sort>.*`. It is INTRINSIC CONTENT — stored and re-emitted verbatim as part of
 * `body_md`, so a verbatim reader of llms-full.txt sees the edition too (a DB-only side
 * axis would reach reports.json but be invisible there). `<sort>` is the sortable latest-key and
 * `<label>` the human label. This regex only finds the line; `extractReports` then requires the
 * sort to pass `isEditionSort`, so a missing line or an unusable sort fails loudly at seed time
 * rather than minting a report with no usable edition. The cross-edition rules (nesting,
 * duplicates) need the whole series, so they live in `seriesRecency` and run at db:check and parse.
 */
export const EDITION_LINE_RE = /\*Edition\s+(?<label>.+?),\s+published\s+(?<sort>.+?)\.\*/;

/**
 * Every H3 field-report entry in `FieldReports.md`, in document order, with its series and
 * edition (CAAIL-364). A recurring report line is one SERIES (an `## H2` section) with many
 * EDITIONS (the `### H3`s under it); a top-level H3 with no enclosing H2 is a one-off
 * (`seriesSlug: null`). The heading link is OPTIONAL (`url: null`), matching
 * `extractDatasetEntries`. Every H3 is an entry — `emitReportsFile` passes H2 headings
 * through and re-emits each H3's `body_md` (which carries the edition line), so the extract
 * and emit notions of "an entry" cannot drift apart.
 */
export function extractReports(path: string): ReportRaw[] {
  const src = readFileSync(path, 'utf-8');
  const kids = parseMarkdown(src).children as any[];
  const out: ReportRaw[] = [];
  let seriesSlug: string | null = null;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    // An H2 opens a series section; `flat` (plain text) because the slug is derived from it.
    if (n.type === 'heading' && n.depth === 2) { seriesSlug = slugify(flat(n).trim()) || null; continue; }
    if (n.type !== 'heading' || n.depth !== 3) continue;
    const link = (n.children as any[]).find((c) => c.type === 'link');
    let s: number | null = null, e = 0;
    // An entry ends at the next H2/H3; a deeper H4+ is body content (mirrors extractCatalogEntries).
    for (let j = i + 1; j < kids.length; j++) {
      if (kids[j].type === 'heading' && (kids[j] as any).depth <= 3) break;
      if (s === null) s = kids[j].position.start.offset;
      e = kids[j].position.end.offset;
    }
    const bodyMd = s === null ? '' : src.slice(s, e);
    const name = (link ? (link.children ?? []).map(inlineMd).join('') : inlineMd(n)).trim();
    const m = EDITION_LINE_RE.exec(bodyMd);
    if (!m?.groups) {
      throw new Error(
        `extractReports: the report "${name}" in ${path} has no "*Edition <label>, published <sort>.*" line. ` +
          'Every report entry must lead its body with one.',
      );
    }
    // The single-row halves of the validity rule, checked here so a bad line fails at seed time and
    // names its report. No fix instruction is printed, because this has two callers whose correct
    // fix is opposite: at db:bootstrap `path` is the source to edit, while under db:verify it may be
    // an emitted copy whose value came from a reports.ndjson row. Stating neither beats misleading one.
    const editionLabel = m.groups.label.trim();
    const editionSort = m.groups.sort.trim();
    const problems = [
      ...(editionLabel ? [] : ['missing or empty edition_label']),
      ...(isEditionSort(editionSort) ? [] : [invalidEditionSort(editionSort)]),
    ];
    if (problems.length > 0) {
      throw new Error(`extractReports: the report "${name}" in ${path}: ${problems.join(', and ')}. ` +
        'Rules: seriesRecency in site/scripts/parser/reports.ts.');
    }
    out.push({
      name,
      url: link ? link.url : null,
      seriesSlug,
      editionLabel,
      editionSort,
      headingMd: (n.children as any[]).map(inlineMd).join('').trim(),
      bodyMd,
    });
  }
  return out;
}

export interface Inventory { header: string[]; rows: string[][]; }

/** A page's `## Complete data inventory` GFM table as markdown cell rows. */
export function extractInventory(path: string): Inventory | null {
  const src = readFileSync(path, 'utf-8');
  const root = parseMarkdown(src);
  const sec = sectionsAfter(root, 2).find((s) => s.heading.trim() === 'Complete data inventory');
  const table = sec?.nodes.find((n: any) => n.type === 'table') as Table | undefined;
  if (!table) return null;
  const cellMd = (c: TableCell) => (c.children as any[]).map(inlineMd).join('').trim();
  const all = (table.children as TableRow[]).map((r) => (r.children as TableCell[]).map(cellMd));
  return { header: all[0], rows: all.slice(1) };
}
