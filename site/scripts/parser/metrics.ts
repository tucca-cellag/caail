/**
 * metrics.ts — builds metrics.json for the "By the Numbers" dashboard (M6).
 *
 * Signals, all derived at build time (no committed history, no workflow):
 *   - library:  the counts.json values (single source of truth via computeCounts)
 *   - matrix:   Papers.md matrix coverage + per-area / per-method paper counts
 *   - species:  per-species `## Complete data inventory` row counts (the
 *               "where help is wanted" recruitment signal; stubs → 0 rows)
 *   - datasets: the catalogued-dataset total + breakdown by source-page shape
 *               (via datasets.ts; total === counts.datasets)
 *   - momentum: a git snapshot (last-modified + 30-day commit counts), guarded
 *               so a shallow clone degrades to null rather than failing the build.
 *
 * Reads the canonical files; never mutates them.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AREAS } from './areas.js';
import { computeCounts } from './counts.js';
import { buildCatalogModel } from './catalog.js';
import {
  SPECIES_PAGES,
  inventoryRowCount,
  computeDatasetBreakdown,
} from './datasets.js';
import {
  MetricsSchema,
  type Metrics,
  type MetricsSpecies,
  type MetricsLicenses,
  type MetricsLicenseBreakdown,
  type LicenseTierCounts,
  type Catalog,
  type CatalogEntry,
  type PapersData,
} from './types.js';
// Parser imports the shared tier classifier from src/ (same cross-boundary
// pattern as primers.ts importing src/content/caail-pages.ts) so the dashboard,
// the card badge, and these stats can never disagree on how a license is binned.
import { licenseTier } from '../../src/lib/licenses.ts';

/** parser/ → scripts/ → site/ → repo root. */
const DEFAULT_REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

// ---------------------------------------------------------------------------
// Matrix coverage
// ---------------------------------------------------------------------------

function buildMatrix(model: PapersData) {
  const methods = model.methods;
  const totalCells = methods.length * AREAS.length;
  const filledCells = model.cells.filter((c) => c.refIds.length > 0).length;

  // distinct refs per area key / per method label
  const perArea = AREAS.map(({ key, label }) => {
    const refs = new Set<number>();
    for (const c of model.cells) {
      if (c.area === key) c.refIds.forEach((id) => refs.add(id));
    }
    return { key, label, papers: refs.size };
  });

  const perMethod = methods.map((method) => {
    const refs = new Set<number>();
    for (const c of model.cells) {
      if (c.method === method) c.refIds.forEach((id) => refs.add(id));
    }
    return { method, papers: refs.size };
  });

  const coveragePct =
    totalCells === 0 ? 0 : Math.round((filledCells / totalCells) * 1000) / 10;

  return { totalCells, filledCells, coveragePct, perArea, perMethod };
}

// ---------------------------------------------------------------------------
// Per-species dataset inventory
// ---------------------------------------------------------------------------

/**
 * Per-species inventory signal for the recruitment chart. Delegates the row
 * count to `datasets.inventoryRowCount` (the shared inventory-table counter);
 * a stub page (placeholder note, no table) or a missing page yields
 * `{ 0, true }`.
 */
export function speciesInventory(repoRoot: string, species: string): MetricsSpecies {
  const inventoryRows = inventoryRowCount(repoRoot, species);
  return { species, inventoryRows, isStub: inventoryRows === 0 };
}

// ---------------------------------------------------------------------------
// License distribution (folded from the catalog)
// ---------------------------------------------------------------------------

function emptyTierCounts(): LicenseTierCounts {
  return { permissive: 0, copyleft: 0, restricted: 0, unknown: 0 };
}

/**
 * License breakdown for one catalog: overall counts by tier, plus a per
 * application-area (H2 group) breakdown in first-appearance (document) order.
 * Every entry is binned via the shared licenseTier classifier (no license →
 * `unknown`), so the four tier counts always sum to the entry total.
 */
export function buildLicenseBreakdown(
  entries: CatalogEntry[],
): MetricsLicenseBreakdown {
  const byTier = emptyTierCounts();
  const areaOrder: string[] = [];
  const areaCounts = new Map<string, LicenseTierCounts>();

  for (const e of entries) {
    const tier = licenseTier(e.license);
    byTier[tier] += 1;
    if (!areaCounts.has(e.group)) {
      areaOrder.push(e.group);
      areaCounts.set(e.group, emptyTierCounts());
    }
    areaCounts.get(e.group)![tier] += 1;
  }

  const perArea = areaOrder.map((group) => {
    const counts = areaCounts.get(group)!;
    const total =
      counts.permissive + counts.copyleft + counts.restricted + counts.unknown;
    return { group, total, byTier: counts };
  });

  return { total: entries.length, byTier, perArea };
}

function buildLicenses(catalog: Catalog): MetricsLicenses {
  return {
    software: buildLicenseBreakdown(catalog.software),
    databases: buildLicenseBreakdown(catalog.databases),
  };
}

// ---------------------------------------------------------------------------
// Momentum (git snapshot, guarded)
// ---------------------------------------------------------------------------

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf-8' }).trim();
}

function computeMomentum(repoRoot: string): Metrics['momentum'] {
  try {
    const lastMod = (path: string): string | null =>
      git(repoRoot, ['log', '-1', '--format=%aI', '--', path]) || null;
    const commits30d = (path: string): number => {
      const out = git(repoRoot, ['log', '--since=30.days', '--format=%H', '--', path]);
      return out ? out.split('\n').filter(Boolean).length : 0;
    };
    return {
      papersLastModified: lastMod('Papers.md'),
      datasetsLastModified: lastMod('Datasets'),
      papersCommits30d: commits30d('Papers.md'),
      datasetsCommits30d: commits30d('Datasets'),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build the metrics.json model from an already-built PapersData model.
 *
 * @param model     Validated PapersData (from buildPapersModel)
 * @param repoRoot  Repository root (defaults to the canonical root). Override
 *                  in tests to point at a fixture directory.
 * @param now       ISO build timestamp (injectable for deterministic tests).
 * @param catalog   Validated Catalog (from buildCatalogModel) for the license
 *                  distribution. Defaults to a fresh build; generate-data passes
 *                  its already-built catalog to avoid parsing the files twice.
 */
export function buildMetricsModel(
  model: PapersData,
  repoRoot: string = DEFAULT_REPO_ROOT,
  now: string = new Date().toISOString(),
  catalog: Catalog = buildCatalogModel(),
): Metrics {
  const { total, speciesRows, referenceEntries, benchmarkEntries } =
    computeDatasetBreakdown(repoRoot);

  const metrics: Metrics = {
    library: computeCounts(model, repoRoot),
    matrix: buildMatrix(model),
    species: SPECIES_PAGES.map((s) => speciesInventory(repoRoot, s)),
    datasets: { total, speciesRows, referenceEntries, benchmarkEntries },
    licenses: buildLicenses(catalog),
    momentum: computeMomentum(repoRoot),
    generatedAt: now,
  };
  return MetricsSchema.parse(metrics);
}
