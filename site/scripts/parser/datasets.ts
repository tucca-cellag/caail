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
export const REFERENCE_PAGES: readonly string[] = ['HumanReference', 'CHOReference'];

/** The benchmarks page, whose datasets are counted as `##` (H2) entries. */
export const BENCHMARKS_PAGE = 'Benchmarks';

const INVENTORY_HEADING = 'Complete data inventory';

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

// ---------------------------------------------------------------------------
// Breakdown
// ---------------------------------------------------------------------------

export type DatasetSourceKind = 'inventory' | 'reference' | 'benchmark';

export interface DatasetBreakdown {
  /** total catalogued datasets across the whole Datasets/ directory */
  total: number;
  /** inventory-table rows over INVENTORY_PAGES (species + CrossSpecies) */
  speciesRows: number;
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
  }
  for (const page of REFERENCE_PAGES) {
    perPage.push({ page, kind: 'reference', count: headingCount(repoRoot, page, 3) });
  }
  perPage.push({
    page: BENCHMARKS_PAGE,
    kind: 'benchmark',
    count: headingCount(repoRoot, BENCHMARKS_PAGE, 2),
  });

  const sumKind = (kind: DatasetSourceKind): number =>
    perPage.filter((p) => p.kind === kind).reduce((acc, p) => acc + p.count, 0);

  const speciesRows = sumKind('inventory');
  const referenceEntries = sumKind('reference');
  const benchmarkEntries = sumKind('benchmark');

  return {
    total: speciesRows + referenceEntries + benchmarkEntries,
    speciesRows,
    referenceEntries,
    benchmarkEntries,
    perPage,
  };
}
