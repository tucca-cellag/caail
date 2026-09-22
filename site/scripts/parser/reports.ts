/**
 * reports.ts — build reports.json (the field-report records: GFI State of the Industry,
 * the Rethink Priorities landscape report) from the committed `reports` NDJSON, read
 * offline like the topic and dataset-entry models (CAAIL-363). Each record carries its
 * content, its topic refs (via topicsByItemId), and the series/recency projection that
 * `deriveReports` computes from the stored series + edition columns (CAAIL-364).
 *
 * The model is consumed twice: the /field-reports/ page, and the public agent endpoint
 * `api/reports.json`, which re-exports it field for field (agent-api.ts). So every field on
 * ReportSchema is public, and a shape change here is an endpoint change.
 *
 * The parser READS the committed NDJSON; it never touches the DB or the canonical
 * Markdown. An absent file (no reports.ndjson) yields an empty model.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReportsDataSchema, type ReportsData, type Report } from './types.js';
import { topicsByItemId } from './topics.js';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

export interface ReportRow {
  item_id: string; title: string; url: string | null;
  series_slug: string | null; edition_label: string; edition_sort: string;
  heading_md: string; body_md: string; ordinal: number;
}

/**
 * Derive the reports.json model from raw report rows (CAAIL-364). Pure and exported so the
 * recency logic is unit-testable with arbitrary editions. Within a series (`series_slug`),
 * the edition with the greatest `edition_sort` is `current`; the rest carry `supersededBy` =
 * the current edition's id. `edition_sort` is a YYYY, YYYY-MM or YYYY-MM-DD, compared as a
 * string, which is chronological only while a series keeps to ONE of those precisions ('2026'
 * sorts before '2026-03-01' by prefix alone). `checkSeries` fails db:check on a mixed series
 * rather than this function guessing an order (CAAIL-373). A one-off (`series_slug === null`)
 * is its own latest. Deriving from max() rather than storing a flag is what makes next year's
 * edition self-demote this year's with zero edits; `checkSeries` guards that exactly one
 * edition per series is current.
 */
export function deriveReports(rows: ReportRow[], topicsById: Map<string, Report['topics']>): Report[] {
  const maxSort = new Map<string, string>();
  const editions = new Map<string, ReportRow[]>();
  for (const r of rows) {
    if (r.series_slug === null) continue;
    const cur = maxSort.get(r.series_slug);
    if (cur === undefined || r.edition_sort > cur) maxSort.set(r.series_slug, r.edition_sort);
    (editions.get(r.series_slug) ?? editions.set(r.series_slug, []).get(r.series_slug)!).push(r);
  }
  const currentId = new Map<string, string>();
  for (const [series, list] of editions) {
    list.sort((a, b) => (a.edition_sort < b.edition_sort ? -1 : a.edition_sort > b.edition_sort ? 1 : 0));
    // The edition at the series max is current. A tie would set two; checkSeries fails the build first.
    const top = list.find((r) => r.edition_sort === maxSort.get(series));
    if (top) currentId.set(series, top.item_id);
  }

  return rows.map((r) => {
    const isCurrent = r.series_slug === null || r.edition_sort === maxSort.get(r.series_slug);
    return {
      id: r.item_id,
      title: r.title,
      url: r.url,
      seriesSlug: r.series_slug,
      editionLabel: r.edition_label,
      current: isCurrent,
      supersededBy: isCurrent ? null : (currentId.get(r.series_slug as string) ?? null),
      seriesEditions: r.series_slug === null
        ? [r.item_id]
        : (editions.get(r.series_slug) ?? []).map((e) => e.item_id),
      topics: topicsById.get(r.item_id) ?? [],
    };
  });
}

/** Build the reports.json model from the committed reports NDJSON, in document order. */
export function buildReportsModel(): ReportsData {
  const path = join(NDJSON_DIR, 'reports.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  const rows = text ? text.split('\n').map((l) => JSON.parse(l) as ReportRow) : [];
  return ReportsDataSchema.parse({ reports: deriveReports(rows, topicsByItemId()) });
}
