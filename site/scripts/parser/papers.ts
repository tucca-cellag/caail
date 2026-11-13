/**
 * papers.ts — orchestrator that turns the canonical Papers.md into a validated
 * PapersData model.
 *
 * This module composes four lower-level, independently-tested modules:
 *   - markdown.ts : structural mdast helpers (parseFile, firstTable, …)
 *   - apa.ts      : APA citation-field parser (parseApa)
 *   - areas.ts    : the fixed area registry (areaKeyForLabel)
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
import type { Root, TableRow } from 'mdast';

import { parseMarkdown, firstTable, sectionsAfter, anchorParagraphs, labeledLinksAfter, type BlockquoteLine } from './markdown.js';
import { parseApa } from './apa.js';
import { areaKeyForLabel } from './areas.js';
import { topicsByItemId } from './topics.js';
import { doiKey } from './citations.js';
import { MATRIX_SECTION, NOTICE_LABELS, type NoticeLabel } from './types.js';
import { loadCitedByCounts, loadPaperLicenses, loadPaperIsOa } from './citation-counts.js';
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

/** The labels of a reference's own resources, served as `codeUrl`, `dataUrl` and `modelUrls`. */
export const RESOURCE_LABELS = ['Code', 'Data', 'Models'] as const;

/** Each resource word by its lowercase key, so a label is matched in any case. */
const RESOURCE_BY_KEY = new Map<string, string>(RESOURCE_LABELS.map((l) => [l.toLowerCase(), l]));
/** Each notice word by its lowercase key, so a notice matched in any case is served in its canonical form. */
const NOTICE_BY_KEY = new Map<string, NoticeLabel>(NOTICE_LABELS.map((l) => [l.toLowerCase(), l]));

/**
 * A reference's trailing blockquotes, sorted into its resources and its notices. A
 * line that is not one label and its URLs (prose, a URL wrapped onto its own line, or
 * a second label on the line), a label the parser does not know, a known one with no
 * http(s) URL, a notice line with more than one URL, one notice URL under two labels,
 * or a Code or Data label with more than the one URL its field holds, throws naming
 * the reference, so no blockquote content is dropped or misread silently. Models takes
 * every URL on its line. An exact repeat (the same URL under one resource, or the same
 * notice twice) is served once. A notice is served under its canonical label, whatever
 * case the blockquote wrote it in.
 */
function referenceLinks(id: number, lines: BlockquoteLine[]): Pick<
  PartialReference, 'codeUrl' | 'dataUrl' | 'modelUrls' | 'notices'
> {
  const labeled: Array<{ key: string; urls: string[] }> = [];
  for (const line of lines) {
    if (line.label === null) {
      throw new Error(
        `Papers.md ref ${id}: a line of its blockquotes is not one label and its URLs: "${line.text}". Each line there ` +
        `is one label and its URLs (\`> **Code**: url\`): put a wrapped URL back on its label's line, give a second ` +
        `label its own line, and keep prose out.`,
      );
    }
    const key = line.label.toLowerCase();
    const notice = NOTICE_BY_KEY.get(key);
    if (notice === undefined && !RESOURCE_BY_KEY.has(key)) {
      throw new Error(
        `Papers.md ref ${id}: blockquote label "${line.label}" is neither a resource (${RESOURCE_LABELS.join(', ')}) nor a ` +
        `post-publication notice (${NOTICE_LABELS.join(', ')}). A retraction is not a notice: raise it with the curator.`,
      );
    }
    if (line.urls.length === 0) throw new Error(`Papers.md ref ${id}: blockquote label "${line.label}" has no http(s) URL.`);
    if (notice !== undefined && line.urls.length > 1) {
      throw new Error(`Papers.md ref ${id}: its ${notice} line holds ${line.urls.length} URLs, but a notice is one ` +
        `document: give each notice its own line, and keep other links off it.`);
    }
    labeled.push({ key, urls: line.urls });
  }
  /** Every URL under a resource, across its lines, in document order, each once. */
  const urlsFor = (key: string): string[] => [...new Set(labeled.filter((e) => e.key === key).flatMap((e) => e.urls))];
  for (const key of ['code', 'data']) {
    const n = urlsFor(key).length;
    if (n > 1) {
      const name = RESOURCE_BY_KEY.get(key);
      throw new Error(`Papers.md ref ${id}: its ${name} blockquotes hold ${n} URLs, but a reference serves one ${name} ` +
        `URL: keep the primary one.`);
    }
  }
  /** Each notice once, by its one URL, in document order; one document carries one label. */
  const notices = new Map<string, { label: NoticeLabel; url: string }>();
  for (const { key, urls } of labeled) {
    const label = NOTICE_BY_KEY.get(key);
    const url = urls[0]!;
    if (label === undefined) continue;
    const seen = notices.get(url);
    if (seen !== undefined && seen.label !== label) {
      throw new Error(`Papers.md ref ${id}: notice ${url} is labelled both ${seen.label} and ${label}; one document has ` +
        `one type, so keep the publisher's word and drop the other line.`);
    }
    if (seen === undefined) notices.set(url, { label, url });
  }
  return {
    codeUrl: urlsFor('code')[0] ?? null,
    dataUrl: urlsFor('data')[0] ?? null,
    modelUrls: urlsFor('models'),
    notices: [...notices.values()],
  };
}

/**
 * Walk every `##` section and build a PartialReference for each anchor
 * paragraph. Code, Data and Models URLs and post-publication notices are pulled
 * from the blockquotes that immediately follow the reference paragraph
 * (associated by node index within the section; see `referenceLinks`).
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

      const { codeUrl, dataUrl, modelUrls, notices } = referenceLinks(id, labeledLinksAfter(nodes, i));

      refs.push({
        id,
        section: heading,
        raw,
        authors: fields.authors,
        authorsDropped: fields.authorsDropped,
        authorsText: fields.authorsText,
        year: fields.year,
        title: fields.title,
        journal: fields.journal,
        doi: fields.doi,
        codeUrl,
        dataUrl,
        modelUrls,
        notices,
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
  // Build id → ordered-unique methods/areas using Sets (O(1) membership test,
  // insertion-order preserved, matches first-appearance semantics of the old
  // Array.includes approach).
  const methodsById = new Map<number, Set<string>>();
  const areasById = new Map<number, Set<string>>();

  const addUnique = (map: Map<number, Set<string>>, id: number, value: string) => {
    const set = map.get(id) ?? new Set<string>();
    set.add(value);
    map.set(id, set);
  };

  for (const cell of cells) {
    for (const id of cell.refIds) {
      addUnique(methodsById, id, cell.method);
      addUnique(areasById, id, cell.area);
    }
  }

  return partials.map((p) => {
    const methods = [...(methodsById.get(p.id) ?? [])];
    const areas = [...(areasById.get(p.id) ?? [])];
    // MATRIX_SECTION is the canonical ## heading for primary-research entries in Papers.md.
    const isPrimary = p.section === MATRIX_SECTION && methods.length > 0;
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

/**
 * Convert a 0-based collision index to a suffix: 0→"", 1→"b", 2→"c", …, 25→"z".
 * For index ≥ 26 (more than 26 same-author-same-year collisions), fall back to
 * a numeric form: 26→"-26", 27→"-27", … — keeps slugs unambiguous without
 * producing non-letter characters.
 */
function disambiguationSuffix(index: number): string {
  if (index === 0) return '';
  if (index < 26) return String.fromCharCode(97 + index); // 'b'–'z'
  return `-${index}`; // guard: 27th+ collision → numeric suffix
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

  for (const ref of refs) {
    const base = baseSlug(ref);
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
  // Read the source once; parse from the in-memory string so there is no
  // second disk read. parseReferences slices this same text by node offsets
  // to recover the raw markdown (with `*…*`) that parseApa needs.
  const src = readFileSync(papersPath, 'utf-8');
  const root = parseMarkdown(src);

  const { areas, methods, cells } = parseMatrix(root);
  const partials = parseReferences(root, src);
  const withCellFields = deriveCellFields(partials, cells);
  const slugged = assignSlugs(withCellFields);

  const topicsById = topicsByItemId();
  const counts = loadCitedByCounts();
  const licenses = loadPaperLicenses();
  const isOaByKey = loadPaperIsOa();
  const references = slugged.map((r) => {
    const key = doiKey(r.doi);
    const license = key ? licenses.get(key) ?? null : null;
    return {
      ...r,
      topics: topicsById.get(`paper:${r.id}`) ?? [],
      citedByOpenAlex: key ? counts.get(key) ?? null : null,
      license,
      licenseSource: license ? ('auto' as const) : null,
      isOa: key ? isOaByKey.get(key) ?? null : null,
    };
  });

  const model: PapersData = { areas, methods, cells, references };

  // Validate before returning so a shape regression throws here, not downstream.
  return PapersDataSchema.parse(model);
}
