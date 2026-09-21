/**
 * reports.ts — build reports.json (the field-report records: GFI State of the Industry,
 * the Rethink Priorities landscape report) from the committed `reports` NDJSON, read
 * offline like the topic and dataset-entry models (CAAIL-363). Each record is joined to
 * its topic refs (via topicsByItemId) so a future card / hub can render chips.
 *
 * The parser READS the committed NDJSON; it never touches the DB or the canonical
 * Markdown. An absent file (no reports.ndjson) yields an empty model.
 *
 * This is the T1 SKELETON: content + topics only. The series/recency projection
 * (derived `current` / `supersededBy` / `seriesEditions`) is CAAIL-364 and folds in here.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReportsDataSchema, type ReportsData, type Report } from './types.js';
import { topicsByItemId } from './topics.js';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

interface ReportRow {
  item_id: string; title: string; url: string | null;
  heading_md: string; body_md: string; ordinal: number;
}

/** Build the reports.json model from the committed reports NDJSON, in document order. */
export function buildReportsModel(): ReportsData {
  const path = join(NDJSON_DIR, 'reports.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  const rows = text ? text.split('\n').map((l) => JSON.parse(l) as ReportRow) : [];
  const byId = topicsByItemId();

  const reports: Report[] = rows.map((r) => ({
    id: r.item_id,
    title: r.title,
    url: r.url,
    topics: byId.get(r.item_id) ?? [],
  }));

  return ReportsDataSchema.parse({ reports });
}
