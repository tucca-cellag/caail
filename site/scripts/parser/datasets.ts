/**
 * datasets.ts — counts every catalogued dataset across the Datasets/ directory.
 *
 * "Datasets" is not one uniform shape in the corpus, so each page contributes
 * its natural, deterministic unit:
 *
 *   - inventory pages (the 10 species pages + CrossSpecies): data rows in the
 *     page's `## Complete data inventory` GFM table.
 *   - reference pages (HumanReference, CHOReference): one `###` heading per
 *     curated dataset entry. The `## Further reading` footers use bullet lists
 *     (no H3), so a raw H3 count yields exactly the dataset entries.
 *   - the benchmarks page (Benchmarks): one `##` heading per benchmark dataset
 *     (the `#` H1 title is depth 1, so it is not counted).
 *
 * `computeDatasetBreakdown` is the single source of truth: counts.ts consumes
 * its `total` for counts.json, metrics.ts consumes the breakdown for the
 * dashboard, and generate-data.ts asserts the parts sum to the total so the
 * headline can never drift from the pages it aggregates.
 *
 * Reads the canonical files; never mutates them.
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Table, Heading } from 'mdast';

import { toString as mdastToString } from 'mdast-util-to-string';

import { parseFile, sectionsAfter } from './markdown.js';

/** parser/ → scripts/ → site/ → repo root. */
const DEFAULT_REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

/** Cell-ag species pages (also the per-species recruitment chart in metrics). */
export const SPECIES_PAGES: readonly string[] = [
  'Chicken', 'Cow', 'Crustacean', 'Duck', 'Fish',
  'Goat', 'Mollusk', 'Pig', 'Sheep', 'Turkey',
];

/** Pages whose datasets are counted as `## Complete data inventory` table rows. */
export const INVENTORY_PAGES: readonly string[] = [...SPECIES_PAGES, 'CrossSpecies'];

/** Pages whose datasets are counted as `###` (H3) entries (no inventory table). */
export const REFERENCE_PAGES: readonly string[] = [
  'HumanReference', 'CHOReference', 'MicrobialHostReference', 'FoodSafety', 'Sustainability',
];

/** The benchmarks page, whose datasets are counted as `##` (H2) entries. */
export const BENCHMARKS_PAGE = 'Benchmarks';

const INVENTORY_HEADING = 'Complete data inventory';

/**
 * H2 labels that introduce narrative rather than a dataset. Only consulted on a page
 * whose entries ARE H2s (Benchmarks): elsewhere an H2 is a section label and can be
 * anything. Without this, adding a `## Further reading` footer to Benchmarks — which
 * every other page already has — would silently count as an 18th benchmark dataset.
 */
const NON_ENTRY_H2 = new Set(['further reading', INVENTORY_HEADING.toLowerCase()]);

/**
 * The heading depth marking one curated dataset entry on a page.
 *
 * Every page uses `###` entries under an `##` section — except Benchmarks, which uses
 * one `##` per dataset and has no enclosing section at all. Extraction (`db/extract.ts`),
 * emit (`db/emit.ts`) and card rendering (`remark/dataset-cards.ts`) all key on this, so
 * it lives in one place rather than as three page-name conditionals that can drift apart.
 * That drift is exactly how the benchmarks came to be absent from the DB (#156): the
 * counter here knew they were H2s while the extractor only ever looked at H3s.
 */
export function entryHeadingDepth(page: string): 2 | 3 {
  return page === BENCHMARKS_PAGE ? 2 : 3;
}

/** `Datasets/Benchmarks.md` → `Benchmarks`. Accepts any path ending in the page file. */
export function pageFromPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop()!.replace(/\.md$/i, '');
}

/**
 * Whether a heading at the page's entry depth introduces a dataset entry, given the
 * enclosing H2 section (`''` on an H2-entry page, which has none).
 *
 * `label` and `section` must be the heading's PLAIN TEXT, not its markdown source — the
 * comparisons here are by string, so `## [Further reading](…)` must arrive as
 * `Further reading`, never `[Further reading](…)`. Callers holding an mdast node should
 * flatten with `mdastToString` (parser side) or `flat` (db side); passing `inlineMd` output
 * would exclude a heading on the paths that flatten and include it on the paths that don't —
 * a page counted 17 and emitted 18.
 *
 * Those two flatteners are NOT identical: `flat` returns '' for an image node where
 * `mdastToString` returns its alt text. No heading in the corpus contains an image, so they
 * agree in practice; if that ever stops being true, converge them rather than assuming.
 *
 * Matching is case-insensitive: a curator writing `## Further Reading` means the footer, and
 * silently promoting it to a dataset because of one capital letter is not a useful reading.
 */
export function isEntryHeading(page: string, label: string, section: string): boolean {
  return entryHeadingDepth(page) === 2
    ? !NON_ENTRY_H2.has(label.trim().toLowerCase())
    : section.trim().toLowerCase() !== INVENTORY_HEADING.toLowerCase();
}

// ---------------------------------------------------------------------------
// Per-page counters
// ---------------------------------------------------------------------------

/**
 * Count the data rows of a `Datasets/<page>.md` page's `## Complete data
 * inventory` GFM table (header row excluded). A stub page (placeholder note,
 * no table) or a missing page yields 0.
 */
export function inventoryRowCount(repoRoot: string, page: string): number {
  const path = join(repoRoot, 'Datasets', `${page}.md`);
  let table: Table | null = null;
  try {
    const root = parseFile(path);
    const section = sectionsAfter(root, 2).find(
      (s) => s.heading.trim() === INVENTORY_HEADING,
    );
    if (section) {
      table =
        (section.nodes.find((n) => n.type === 'table') as Table | undefined) ?? null;
    }
  } catch {
    table = null;
  }
  // mdast GFM table: first row is the header → data rows = children - 1.
  return table ? Math.max(0, table.children.length - 1) : 0;
}

/**
 * Count top-level `heading` nodes of the given `depth` on a `Datasets/<page>.md`
 * page. A missing page yields 0.
 */
export function headingCount(repoRoot: string, page: string, depth: number): number {
  const path = join(repoRoot, 'Datasets', `${page}.md`);
  let root;
  try {
    root = parseFile(path);
  } catch {
    return 0;
  }
  let count = 0;
  for (const node of root.children) {
    if (node.type === 'heading' && (node as Heading).depth === depth) count++;
  }
  return count;
}

/**
 * Count the curated dataset entries on a page — the headings at the page's entry depth
 * that actually introduce a dataset. Replaces a raw `headingCount` for every page whose
 * datasets are headings, so the reference pages, the benchmarks page and the species
 * pages' featured atlases/GEMs are all counted by one rule. A missing page yields 0.
 */
export function curatedEntryCount(repoRoot: string, page: string): number {
  const path = join(repoRoot, 'Datasets', `${page}.md`);
  let root;
  try {
    root = parseFile(path);
  } catch {
    return 0;
  }
  const depth = entryHeadingDepth(page);
  let section = '';
  let count = 0;
  for (const node of root.children) {
    if (node.type !== 'heading') continue;
    const h = node as Heading;
    const label = mdastToString(h).trim();
    // Only an H3-entry page has enclosing sections to track.
    if (depth === 3 && h.depth === 2) { section = label; continue; }
    if (h.depth !== depth) continue;
    if (isEntryHeading(page, label, section)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Breakdown
// ---------------------------------------------------------------------------

export type DatasetSourceKind = 'inventory' | 'curated' | 'reference' | 'benchmark';

export interface DatasetBreakdown {
  /** total catalogued datasets across the whole Datasets/ directory */
  total: number;
  /** inventory-table rows over INVENTORY_PAGES (species + CrossSpecies) */
  speciesRows: number;
  /** curated H3 entries (featured atlases, GEMs) ON the inventory pages */
  curatedEntries: number;
  /** H3 dataset entries over REFERENCE_PAGES */
  referenceEntries: number;
  /** H2 dataset entries on the benchmarks page */
  benchmarkEntries: number;
  /** per-page transparency: one entry per source page contributing datasets */
  perPage: Array<{ page: string; kind: DatasetSourceKind; count: number }>;
}

/**
 * Compute the dataset breakdown across all `Datasets/` pages.
 *
 * @param repoRoot Repository root (defaults to the canonical root). Override in
 *                 tests to point at a fixture directory.
 */
export function computeDatasetBreakdown(
  repoRoot: string = DEFAULT_REPO_ROOT,
): DatasetBreakdown {
  const perPage: DatasetBreakdown['perPage'] = [];

  for (const page of INVENTORY_PAGES) {
    perPage.push({ page, kind: 'inventory', count: inventoryRowCount(repoRoot, page) });
    // The featured atlases and GEMs above each inventory table are catalogued datasets in
    // their own right — distinct resources, not summaries of the rows below them (Cow's
    // rows are per-study deposits; its entries are CattleGTEx, BovReg, BtaSBML2986). They
    // were counted by neither the library total nor the endpoint's own tally until #156.
    perPage.push({ page, kind: 'curated', count: curatedEntryCount(repoRoot, page) });
  }
  for (const page of REFERENCE_PAGES) {
    perPage.push({ page, kind: 'reference', count: curatedEntryCount(repoRoot, page) });
  }
  perPage.push({
    page: BENCHMARKS_PAGE,
    kind: 'benchmark',
    count: curatedEntryCount(repoRoot, BENCHMARKS_PAGE),
  });

  const sumKind = (kind: DatasetSourceKind): number =>
    perPage.filter((p) => p.kind === kind).reduce((acc, p) => acc + p.count, 0);

  const speciesRows = sumKind('inventory');
  const curatedEntries = sumKind('curated');
  const referenceEntries = sumKind('reference');
  const benchmarkEntries = sumKind('benchmark');

  return {
    total: speciesRows + curatedEntries + referenceEntries + benchmarkEntries,
    speciesRows,
    curatedEntries,
    referenceEntries,
    benchmarkEntries,
    perPage,
  };
}
