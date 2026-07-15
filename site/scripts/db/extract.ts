/**
 * extract.ts — pull the DB-owned structured content out of the canonical
 * Markdown, reusing the real parser's mdast helpers. Used by both the bootstrap
 * ETL (canonical MD -> DB) and the emitter's fidelity checks. Promoted from the
 * spike's extractGroupEntries / extractInventory / inlineMd.
 */

import { readFileSync } from 'node:fs';
import { parseMarkdown, sectionsAfter } from '../parser/markdown.js';
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
 * WITH its raw body markdown (offset-sliced). Generalizes the spike's
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
