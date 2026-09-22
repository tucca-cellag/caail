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

/** `edition_sort`'s three accepted forms, by digit shape only; `isEditionSort` adds the calendar. */
const EDITION_SORT_SHAPE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * True when `s` is a real YYYY, YYYY-MM or YYYY-MM-DD. The shape alone admits '2026-13' or
 * '2026-02-30', which would still sort as the latest edition of a series, so the month and day
 * are checked against the calendar too.
 */
export function isEditionSort(s: string): boolean {
  const m = EDITION_SORT_SHAPE.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  if (mo === undefined) return true;
  const month = Number(mo);
  if (month < 1 || month > 12) return false;
  if (d === undefined) return true;
  const day = Number(d);
  const daysInMonth = new Date(Date.UTC(Number(y), month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export interface SeriesRecency {
  /** every edition id of the series, oldest to newest (document order breaks a tie) */
  editions: string[];
  /** the id(s) at the series' greatest edition_sort; exactly one unless there is a problem */
  latest: string[];
}

/**
 * The one definition of "latest" for field reports (CAAIL-364, CAAIL-373), shared by
 * `deriveReports` (which throws on any problem) and db:check's `checkSeries` (which lists them),
 * so the check and the derivation cannot disagree about which edition is current.
 *
 * Latest is max(edition_sort) per `series_slug`, compared as a string. That is chronological
 * only when every edition of a series is a valid date in the SAME precision: '2026' sorts before
 * '2026-03-01' by prefix alone. Normalising cannot rescue a mixed series, because a bare year has
 * no position relative to a date inside it, and any padding invents an order the source never
 * stated. So a mixed series is a problem for a curator to resolve rather than a case to guess at,
 * as are an invalid date and a tie at the max. A one-off (`series_slug === null`) is its own
 * latest, but its edition_sort must still be a valid date.
 */
export function seriesRecency(
  rows: Pick<ReportRow, 'item_id' | 'series_slug' | 'edition_sort'>[],
): { bySeries: Map<string, SeriesRecency>; problems: string[] } {
  const problems: string[] = [];
  const grouped = new Map<string, { id: string; sort: string }[]>();
  for (const r of rows) {
    if (!isEditionSort(r.edition_sort)) {
      problems.push(`${r.item_id}: edition_sort '${r.edition_sort}' is not a valid YYYY, YYYY-MM or YYYY-MM-DD date`);
      continue; // it would also read as a precision of its own; report it once, here
    }
    if (r.series_slug === null) continue;
    (grouped.get(r.series_slug) ?? grouped.set(r.series_slug, []).get(r.series_slug)!)
      .push({ id: r.item_id, sort: r.edition_sort });
  }
  const bySeries = new Map<string, SeriesRecency>();
  for (const [series, list] of grouped) {
    list.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0)); // stable: a tie keeps document order
    const sorts = [...new Set(list.map((e) => e.sort))];
    // Once isEditionSort holds, length alone names the precision: 4 = YYYY, 7 = YYYY-MM, 10 = YYYY-MM-DD.
    if (new Set(sorts.map((s) => s.length)).size > 1) {
      problems.push(`series '${series}': edition_sort mixes precisions (${sorts.join(', ')}); give every edition ` +
        'of a series the same YYYY, YYYY-MM or YYYY-MM-DD form, or "latest" is decided by string prefix, not date');
    }
    const maxSort = sorts.at(-1)!;
    const latest = list.filter((e) => e.sort === maxSort).map((e) => e.id);
    if (latest.length > 1) {
      problems.push(`series '${series}': ${latest.length} editions tie at the latest edition_sort ${maxSort} ` +
        `(${latest.join(', ')}); exactly one may be current`);
    }
    bySeries.set(series, { editions: list.map((e) => e.id), latest });
  }
  return { bySeries, problems };
}

/**
 * Derive the reports.json model from raw report rows (CAAIL-364). Pure and exported so the
 * recency logic is unit-testable with arbitrary editions. Within a series (`series_slug`),
 * the latest edition per `seriesRecency` is `current`; the rest carry `supersededBy` = its id.
 * A one-off (`series_slug === null`) is its own latest. Deriving from max() rather than storing
 * a flag is what makes next year's edition self-demote this year's with zero edits.
 *
 * Throws on any `seriesRecency` problem rather than publishing a guessed `current`: the model
 * is re-exported to the public api/reports.json and `pnpm parse` does not run db:check, so this
 * is the guard every build passes through. `checkSeries` reports the same problems earlier.
 */
export function deriveReports(rows: ReportRow[], topicsById: Map<string, Report['topics']>): Report[] {
  const { bySeries, problems } = seriesRecency(rows);
  if (problems.length > 0) {
    throw new Error(`reports: cannot derive current editions: ${problems.join('; ')}`);
  }

  return rows.map((r) => {
    const series = r.series_slug === null ? undefined : bySeries.get(r.series_slug)!;
    const currentId = series?.latest[0];
    const isCurrent = series === undefined || currentId === r.item_id;
    return {
      id: r.item_id,
      title: r.title,
      url: r.url,
      seriesSlug: r.series_slug,
      editionLabel: r.edition_label,
      current: isCurrent,
      supersededBy: isCurrent ? null : currentId!,
      seriesEditions: series === undefined ? [r.item_id] : series.editions,
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
