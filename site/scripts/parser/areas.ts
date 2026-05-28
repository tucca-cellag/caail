/**
 * areas.ts — fixed registry of the 7 research-area matrix columns.
 *
 * Keys match the `--caail-area-*` CSS design tokens exactly so colors stay
 * in CSS, not in data.  Labels are the verbatim column headers from Papers.md.
 *
 * No I/O.  No Zod dependency (plain inline type is sufficient here).
 */

import type { Area } from './types';

/**
 * The 7 research-area columns, in matrix column order.
 * Used as the `areas` array in papers.json.
 */
export const AREAS: ReadonlyArray<Area> = [
  { key: 'media',       label: 'Media Optimization' },
  { key: 'cell',        label: 'Cellular Engineering' },
  { key: 'bioprocess',  label: 'Bioprocess control' },
  { key: 'scaffolding', label: 'Scaffolding' },
  { key: 'sensory',     label: 'Sensory Prediction' },
  { key: 'tooling',     label: 'AI Tooling / Methodology' },
  { key: 'eval',        label: 'AI Evaluation & Benchmarking' },
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
