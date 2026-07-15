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
import { lastAdditionDate } from './recent.js';
import {
  SPECIES_PAGES,
  inventoryRowCount,
  computeDatasetBreakdown,
} from './datasets.js';
import {
  MetricsSchema,
  type Metrics,
  type MetricsSpecies,
  type PapersData,
} from './types.js';

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
// Momentum (git snapshot, guarded)
// ---------------------------------------------------------------------------

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf-8' }).trim();
}

function computeMomentum(repoRoot: string): Metrics['momentum'] {
  try {
    // "Last updated" is the newest *addition* of that kind — the same selection the
    // home page "Recently added" list uses (lastAdditionDate), so the two panels
    // tell one story instead of diverging on a fix/refactor/merge commit.
    const commits30d = (path: string): number => {
      const out = git(repoRoot, ['log', '--no-merges', '--since=30.days', '--format=%H', '--', path]);
      return out ? out.split('\n').filter(Boolean).length : 0;
    };
    return {
      papersLastModified: lastAdditionDate('Paper', repoRoot),
      datasetsLastModified: lastAdditionDate('Dataset', repoRoot),
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
 */
export function buildMetricsModel(
  model: PapersData,
  repoRoot: string = DEFAULT_REPO_ROOT,
  now: string = new Date().toISOString(),
): Metrics {
  const { total, speciesRows, referenceEntries, benchmarkEntries } =
    computeDatasetBreakdown(repoRoot);

  const metrics: Metrics = {
    library: computeCounts(model, repoRoot),
    matrix: buildMatrix(model),
    species: SPECIES_PAGES.map((s) => speciesInventory(repoRoot, s)),
    datasets: { total, speciesRows, referenceEntries, benchmarkEntries },
    momentum: computeMomentum(repoRoot),
    generatedAt: now,
  };
  return MetricsSchema.parse(metrics);
}
