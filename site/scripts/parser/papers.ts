/**
 * papers.ts — orchestrator that turns the canonical Papers.md into a validated
 * PapersData model.
 *
 * This module composes four lower-level, independently-tested modules:
 *   - markdown.ts : structural mdast helpers (parseFile, firstTable, …)
 *   - apa.ts      : APA citation-field parser (parseApa)
 *   - areas.ts    : the fixed 7-column area registry (areaKeyForLabel)
 *   - types.ts    : the zod schema / types for the output shape
 *
 * It owns NO low-level parsing logic of its own — it wires the helpers together
 * and derives the cross-cutting fields (isPrimary, methods, areas, slug) that
 * require seeing both the matrix and the reference list at once.
 *
 * The output is validated with PapersDataSchema.parse() before returning, so a
 * shape regression throws loudly here rather than downstream at build time.
 *
 * No disk writes — emitting JSON artifacts is a separate task.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toString as mdToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Root, TableRow, RootContent, Blockquote, Paragraph } from 'mdast';

import { parseFile, firstTable, sectionsAfter, anchorParagraphs } from './markdown.js';
import { parseApa } from './apa.js';
import { areaKeyForLabel } from './areas.js';
import {
  PapersDataSchema,
  type PapersData,
  type Reference,
  type Cell,
  type Area,
} from './types.js';

/**
 * Absolute path to the canonical repo-root Papers.md.
 *
 * Resolved from this module's location: parser → scripts → site → repo root
 * (three `..`). Computed at module load so it is stable regardless of cwd.
 */
export const PAPERS_MD_PATH: string = fileURLToPath(
  new URL('../../../Papers.md', import.meta.url),
);

/** Matches a citation-link href of the form `#123`; captures the integer. */
const CITATION_HREF_RE = /^#(\d+)$/;

/** Only absolute http(s) URLs are accepted as Code/Data deposit links. */
const ABSOLUTE_URL_RE = /^https?:\/\//i;

// ---------------------------------------------------------------------------
// Matrix
// ---------------------------------------------------------------------------

interface MatrixResult {
  areas: Area[];
  methods: string[];
  cells: Cell[];
}

/**
 * Parse the first GFM table into areas (column headers), methods (row labels),
 * and the populated cells.
 *
 * The header row's first cell is an empty corner; each subsequent cell is a
 * research-area label. We resolve each label to its stable key via
 * areaKeyForLabel; an unresolved label is warned about and its column skipped
 * (we track which column indices are valid so body parsing stays aligned).
 *
 * Body rows: cell[0] is the method-row LABEL (text only — any `#N` link in it
 * is the method's own anchor, NOT a citation, so it is never scanned). For each
 * valid area column, we visit `link` nodes whose href matches `#N` and collect
 * (refId, label). Cells with no citations emit no Cell entry.
 */
function parseMatrix(root: Root): MatrixResult {
  const table = firstTable(root);
  if (!table) {
    return { areas: [], methods: [], cells: [] };
  }

  const [headerRow, ...bodyRows] = table.children;

  // --- Header: resolve area columns, tracking valid column indices ---
  const areas: Area[] = [];
  // Map: table-column-index (1-based among header cells) → area key.
  const colKeyByIndex = new Map<number, string>();

  const headerCells = (headerRow as TableRow).children;
  for (let j = 1; j < headerCells.length; j++) {
    const label = mdToString(headerCells[j]).trim();
    const key = areaKeyForLabel(label);
    if (key === null) {
      // eslint-disable-next-line no-console
      console.warn(`papers: unrecognised matrix column label "${label}" (column ${j}) — skipping`);
      continue;
    }
    areas.push({ key, label });
    colKeyByIndex.set(j, key);
  }

  // --- Body rows: methods + cells ---
  const methods: string[] = [];
  const cells: Cell[] = [];

  for (const row of bodyRows) {
    const rowCells = (row as TableRow).children;
    const method = mdToString(rowCells[0]).trim();
    methods.push(method);

    // Only scan area columns (j ≥ 1); never cell[0].
    for (let j = 1; j < rowCells.length; j++) {
      const key = colKeyByIndex.get(j);
      if (key === undefined) continue; // skipped/unresolved column

      const refIds: number[] = [];
      const labels: string[] = [];

      visit(rowCells[j], 'link', (link) => {
        const m = CITATION_HREF_RE.exec(link.url);
        if (!m) return;
        refIds.push(parseInt(m[1], 10));
        labels.push(mdToString(link).trim());
      });

      if (refIds.length > 0) {
        cells.push({ method, area: key, refIds, labels });
      }
    }
  }

  return { areas, methods, cells };
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** A reference with the cell-derived fields not yet filled in. */
type PartialReference = Omit<Reference, 'isPrimary' | 'methods' | 'areas' | 'slug'>;

/**
 * Extract every labeled deposit link (`> **Label**: URL`) from the blockquotes
 * that immediately follow `nodes[index]`, scanning forward and stopping at the
 * first non-blockquote sibling.
 *
 * Why this exists rather than reusing markdown.ts's `blockquotesAfter`:
 * `blockquotesAfter` is intentionally one-label-per-blockquote-node (it reads
 * only `children[0]`). In Papers.md, Code and Data are sometimes authored on
 * adjacent lines WITHOUT a blank line between them
 * (`> **Code**: …\n> **Data**: …`); remark folds those into a SINGLE blockquote
 * node — either two paragraph children, or one paragraph whose inline children
 * are joined by a soft `break`. `blockquotesAfter` would silently drop the
 * Data line in that shape. This orchestrator-level helper therefore scans ALL
 * paragraph children and ALL `strong`→`link` pairs within each paragraph so
 * both labels are recovered regardless of authoring style.
 *
 * Only absolute http(s) URLs are returned — a relative link such as
 * `[Datasets/](./Datasets/)` inside a prose blockquote is not a real deposit
 * URL (and would fail the schema's `z.string().url()` check), so it is dropped.
 *
 * @returns Map from lowercased label (e.g. "code", "data") → first URL seen.
 */
function labeledLinksAfter(
  nodes: RootContent[],
  index: number,
): Map<string, string> {
  const out = new Map<string, string>();

  for (let i = index + 1; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'blockquote') break;

    for (const child of (node as Blockquote).children) {
      if (child.type !== 'paragraph') continue;

      // Walk inline children: a `strong` sets the current label; the next
      // link (or http text run) is its URL. This handles both one-pair and
      // multi-pair (soft-break-joined) paragraphs.
      let label: string | null = null;
      for (const inline of (child as Paragraph).children) {
        if (inline.type === 'strong') {
          label = mdToString(inline).trim().toLowerCase();
          continue;
        }
        if (label === null) continue;

        let url: string | null = null;
        if (inline.type === 'link') {
          url = inline.url;
        } else if (inline.type === 'text' && inline.value.trim().startsWith('http')) {
          url = inline.value.trim();
        }

        if (url !== null) {
          if (ABSOLUTE_URL_RE.test(url) && !out.has(label)) {
            out.set(label, url);
          }
          label = null; // consume this label slot
        }
      }
    }
  }

  return out;
}

/**
 * Walk every `##` section and build a PartialReference for each anchor
 * paragraph. Code/Data URLs are pulled from the blockquotes that immediately
 * follow the reference paragraph (associated by node index within the section).
 *
 * `src` is the raw markdown source. We slice it by the paragraph node's
 * `position` offsets to recover the ORIGINAL markdown for `parseApa` — the
 * flattened `mdast-util-to-string` text drops the `*…*` emphasis that `apa.ts`
 * relies on to find the journal/title. The flattened text from
 * `anchorParagraphs` is still used for detection and the reference id.
 */
function parseReferences(root: Root, src: string): PartialReference[] {
  const refs: PartialReference[] = [];

  for (const { heading, nodes } of sectionsAfter(root, 2)) {
    for (let i = 0; i < nodes.length; i++) {
      // Reuse anchorParagraphs on a single node both to DETECT a reference
      // paragraph and to obtain its id + flattened text — while keeping the
      // index `i` we need to associate trailing Code/Data blockquotes.
      const found = anchorParagraphs([nodes[i]]);
      if (found.length !== 1) continue;

      const { id } = found[0];

      // Recover the raw markdown (with `*…*` intact) by slicing the source at
      // the paragraph node's byte offsets; fall back to the flattened text if
      // position info is somehow absent.
      const pos = nodes[i].position;
      const raw =
        pos?.start.offset != null && pos.end.offset != null
          ? src.slice(pos.start.offset, pos.end.offset)
          : found[0].text;

      const fields = parseApa(raw);

      const labeled = labeledLinksAfter(nodes, i);
      const codeUrl = labeled.get('code') ?? null;
      const dataUrl = labeled.get('data') ?? null;

      refs.push({
        id,
        section: heading,
        raw,
        authors: fields.authors,
        authorsText: fields.authorsText,
        year: fields.year,
        title: fields.title,
        journal: fields.journal,
        doi: fields.doi,
        codeUrl,
        dataUrl,
        hasCode: codeUrl !== null,
        hasData: dataUrl !== null,
      });
    }
  }

  return refs;
}

// ---------------------------------------------------------------------------
// Cell-derived fields
// ---------------------------------------------------------------------------

/**
 * For each reference, derive the method labels and area keys of the cells that
 * cite it (deduplicated, in first-appearance order), and whether it is a
 * primary-research reference (under `## References` AND cited in ≥1 cell).
 */
function deriveCellFields(
  partials: PartialReference[],
  cells: Cell[],
): Array<PartialReference & { isPrimary: boolean; methods: string[]; areas: string[] }> {
  // Build id → ordered-unique methods/areas maps from the cells.
  const methodsById = new Map<number, string[]>();
  const areasById = new Map<number, string[]>();

  const pushUnique = (map: Map<number, string[]>, id: number, value: string) => {
    const arr = map.get(id) ?? [];
    if (!arr.includes(value)) arr.push(value);
    map.set(id, arr);
  };

  for (const cell of cells) {
    for (const id of cell.refIds) {
      pushUnique(methodsById, id, cell.method);
      pushUnique(areasById, id, cell.area);
    }
  }

  return partials.map((p) => {
    const methods = methodsById.get(p.id) ?? [];
    const areas = areasById.get(p.id) ?? [];
    const isPrimary = p.section === 'References' && methods.length > 0;
    return { ...p, methods, areas, isPrimary };
  });
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Slugify a token: lowercase, spaces→`-`, strip all but [a-z0-9-]. */
function slugifyToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Compute the BASE slug (pre-disambiguation) for one reference:
 *   first-author-surname + "-" + year.
 *
 * - surname = part of authors[0] before its first comma; if authors is null,
 *   fall back to the leading token of authorsText.
 * - year omitted if null.
 * - if nothing usable, returns `ref-<id>`.
 */
function baseSlug(ref: PartialReference): string {
  let surnameSource: string | null = null;
  if (ref.authors && ref.authors.length > 0) {
    surnameSource = ref.authors[0].split(',')[0];
  } else if (ref.authorsText.trim()) {
    surnameSource = ref.authorsText.trim().split(/[\s,]+/)[0];
  }

  const surnameSlug = surnameSource ? slugifyToken(surnameSource) : '';
  if (!surnameSlug) {
    return `ref-${ref.id}`;
  }

  return ref.year !== null ? `${surnameSlug}-${ref.year}` : surnameSlug;
}

/** Convert a 0-based collision index to a suffix: 0→"", 1→"b", 2→"c", … */
function disambiguationSuffix(index: number): string {
  // index 0 → no suffix; index 1 → 'b' (97), index 2 → 'c', …
  return index === 0 ? '' : String.fromCharCode(97 + index);
}

/**
 * Assign final slugs with deterministic a/b/c disambiguation.
 *
 * References sharing a base slug are ordered by ascending id; the first keeps
 * the base, the rest get suffixes b, c, … Single-occurrence base slugs are left
 * unsuffixed.
 */
function assignSlugs(
  refs: Array<PartialReference & { isPrimary: boolean; methods: string[]; areas: string[] }>,
): Reference[] {
  // Group by base slug.
  const byBase = new Map<string, number[]>();
  const baseById = new Map<number, string>();

  for (const ref of refs) {
    const base = baseSlug(ref);
    baseById.set(ref.id, base);
    const arr = byBase.get(base) ?? [];
    arr.push(ref.id);
    byBase.set(base, arr);
  }

  // For each base group, order ids ascending and assign suffixes.
  const slugById = new Map<number, string>();
  for (const [base, ids] of byBase) {
    const sorted = [...ids].sort((a, b) => a - b);
    sorted.forEach((id, idx) => {
      slugById.set(id, base + disambiguationSuffix(idx));
    });
  }

  return refs.map((ref) => ({ ...ref, slug: slugById.get(ref.id)! }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Build the validated PapersData model from a Papers.md file.
 *
 * @param papersPath  Path to Papers.md (defaults to the repo-root canonical file).
 * @returns           A schema-validated PapersData object.
 */
export function buildPapersModel(papersPath: string = PAPERS_MD_PATH): PapersData {
  // Read the source once: parseFile (re)reads it for the mdast tree, and
  // parseReferences slices this same text by node offsets to recover the raw
  // markdown (with `*…*`) that parseApa needs.
  const src = readFileSync(papersPath, 'utf-8');
  const root = parseFile(papersPath);

  const { areas, methods, cells } = parseMatrix(root);
  const partials = parseReferences(root, src);
  const withCellFields = deriveCellFields(partials, cells);
  const references = assignSlugs(withCellFields);

  const model: PapersData = { areas, methods, cells, references };

  // Validate before returning so a shape regression throws here, not downstream.
  return PapersDataSchema.parse(model);
}
