/**
 * metrics.ts — builds metrics.json for the "By the Numbers" dashboard (M6).
 *
 * Three signals, all derived at build time (no committed history, no workflow):
 *   - library:  the counts.json values (single source of truth via computeCounts)
 *   - matrix:   Papers.md matrix coverage + per-area / per-method paper counts
 *   - species:  per-species `## Complete data inventory` row counts (the
 *               "where help is wanted" recruitment signal; stubs → 0 rows)
 *   - momentum: a git snapshot (last-modified + 30-day commit counts), guarded
 *               so a shallow clone degrades to null rather than failing the build.
 *
 * Reads the canonical files; never mutates them.
 */

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Table } from 'mdast';

import { parseFile, sectionsAfter } from './markdown.js';
import { AREAS } from './areas.js';
import { computeCounts } from './counts.js';
import {
  MetricsSchema,
  type Metrics,
  type MetricsSpecies,
  type PapersData,
} from './types.js';

/** parser/ → scripts/ → site/ → repo root. */
const DEFAULT_REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

/** Cell-ag species pages (the recruitment chart); reference/topical pages excluded. */
const SPECIES_PAGES: readonly string[] = [
  'Chicken', 'Cow', 'Crustacean', 'Duck', 'Fish',
  'Goat', 'Mollusk', 'Pig', 'Sheep', 'Turkey',
];

const INVENTORY_HEADING = 'Complete data inventory';

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
 * Count the rows of a species page's `## Complete data inventory` table.
 * Returns `{ inventoryRows, isStub }` — a stub page (placeholder note, no table)
 * yields `{ 0, true }`. A missing page is treated as a stub.
 */
export function speciesInventory(repoRoot: string, species: string): MetricsSpecies {
  const path = join(repoRoot, 'Datasets', `${species}.md`);
  let table: Table | null = null;
  try {
    const root = parseFile(path);
    const section = sectionsAfter(root, 2).find(
      (s) => s.heading.trim() === INVENTORY_HEADING,
    );
    if (section) {
      table = (section.nodes.find((n) => n.type === 'table') as Table | undefined) ?? null;
    }
  } catch {
    table = null;
  }
  // mdast GFM table: first row is the header → data rows = children - 1.
  const inventoryRows = table ? Math.max(0, table.children.length - 1) : 0;
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
 */
export function buildMetricsModel(
  model: PapersData,
  repoRoot: string = DEFAULT_REPO_ROOT,
  now: string = new Date().toISOString(),
): Metrics {
  const metrics: Metrics = {
    library: computeCounts(model, repoRoot),
    matrix: buildMatrix(model),
    species: SPECIES_PAGES.map((s) => speciesInventory(repoRoot, s)),
    momentum: computeMomentum(repoRoot),
    generatedAt: now,
  };
  return MetricsSchema.parse(metrics);
}
