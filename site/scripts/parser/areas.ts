/**
 * areas.ts — fixed registry of the 8 research-area matrix columns.
 *
 * Keys match the `--caail-area-*` CSS design tokens exactly so colors stay
 * in CSS, not in data.  Labels are the verbatim column headers from Papers.md.
 *
 * THIS LIST MUST MATCH `site/db/ndjson/areas.ndjson` in key, label and order.
 * It is a second hand-maintained copy of the column axis, and the failure mode
 * when it drifts is silent-by-design: `areaKeyForLabel` returns null for an
 * unknown header and `parseMatrix` WARNS AND SKIPS THE WHOLE COLUMN, so every
 * reference whose only cells are in that column becomes unreachable while the
 * parse still succeeds. That is not hypothetical — adding these two columns
 * orphaned refs #145 and #290 until this file was updated.
 *
 * `db:check` now asserts this array against the DB, so the drift fails loudly
 * rather than warning into a build log nobody reads.
 *
 * No I/O.  No Zod dependency (plain inline type is sufficient here).
 */

import type { Area } from './types';

/**
 * The 8 research-area columns, in matrix column order.
 * Used as the `areas` array in papers.json.
 */
export const AREAS: ReadonlyArray<Area> = [
  { key: 'media',       label: 'Media Optimization' },
  { key: 'cell',        label: 'Cellular Engineering' },
  { key: 'bioprocess',  label: 'Bioprocess & Scale-Up' },
  { key: 'scaffolding', label: 'Scaffolding' },
  { key: 'sensory',     label: 'Sensory Prediction' },
  { key: 'metabolic',   label: 'Metabolic Modeling' },
  { key: 'foodsafety',  label: 'Food Safety Prediction' },
  { key: 'tooling',     label: 'AI Tooling / Methodology' },
] as const;

/** Fast lookup: trimmed label → key. Built once at module load. */
const _labelToKey: ReadonlyMap<string, string> = new Map(
  AREAS.map(({ key, label }) => [label, key]),
);

/**
 * Resolve a Papers.md column-header label to its stable area key.
 *
 * - Trims surrounding whitespace before matching.
 * - Exact match only — no case-folding.
 * - Returns `null` (never throws) for unrecognised labels.
 *   Callers (papers.ts, lint.ts) should WARN on null.
 */
export function areaKeyForLabel(label: string): string | null {
  return _labelToKey.get(label.trim()) ?? null;
}
