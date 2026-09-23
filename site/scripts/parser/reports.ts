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
/** The forms EDITION_SORT_SHAPE accepts, named once for every error message that cites them. */
export const EDITION_SORT_FORMS = 'YYYY, YYYY-MM or YYYY-MM-DD';

/**
 * How to satisfy `seriesRecency`, stated once and printed everywhere a curator can meet one of its
 * failures: the parse abort (every build, so test.yml and docs.yml), db:check (lint-papers.yml) and
 * extractReports at seed and verify time. These run in parallel in CI, so any of them can be seen
 * first, and none may lack it.
 *
 * The two-copies sentence describes the storage CAAIL-364 chose. An agreement check (CAAIL-379)
 * would enforce it rather than retire it; only deriving one copy from the other would retire it.
 *
 * It deliberately says nothing about HOW to edit a report. Earlier versions named the DB edit
 * flows, and every review round found another way that account was incomplete or contradicted the
 * block-generated-edits hook, whose own fix-it steps are wrong (CAAIL-404). The flow belongs to the
 * DB tooling's documentation; this states only what a valid report is and what gets overwritten.
 */
export const EDITION_SORT_RULE =
  `Every report needs a non-empty edition_label and an edition_sort that is a valid ${EDITION_SORT_FORMS} ` +
  'date, and within a series no two editions may share an edition_sort or have one be a prefix of the ' +
  'other. edition_label and edition_sort are each stored twice, in their own column and in the ' +
  '"*Edition <label>, published <sort>.*" line of body_md (CAAIL-379), so change both copies; an edit ' +
  'made in FieldReports.md alone is overwritten by db:emit.';

/** The problem line for an unusable edition_sort, shared so every place that reports one agrees. */
export function invalidEditionSort(sort: unknown): string {
  // JSON.stringify so a stray newline cannot split one-problem-per-line output and trailing
  // whitespace stays visible. String() covers a missing value, which JSON.stringify leaves undefined.
  return `edition_sort ${String(JSON.stringify(sort))} is not a valid ${EDITION_SORT_FORMS} date`;
}

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
  const year = Number(y);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  const day = Number(d);
  return day >= 1 && day <= daysInMonth;
}

export interface SeriesRecency {
  /** every edition id of the series, oldest to newest */
  editions: string[];
  /** the id at the series' greatest edition_sort; meaningful only when `problems` is empty */
  latest: string;
}

/**
 * The one definition of "latest" for field reports (CAAIL-364, CAAIL-373), shared by
 * `deriveReports` (which throws on any problem) and db:check's `checkSeries` (which lists them),
 * so on rows matching the schema's column types the check and the derivation cannot disagree
 * about which edition is current. (A mistyped hand-edited NDJSON value can still read differently:
 * db:check sees it after SQLite's TEXT coercion, parse sees the raw JSON value.)
 *
 * Latest is max(edition_sort) per `series_slug`, compared as a string. Every valid sort shares
 * the YYYY-MM-DD layout, so two of them compare chronologically at their first differing digit,
 * whatever their precisions: '2026' < '2027-03' both ways. The one case with no order is NESTING,
 * one sort a prefix of another: '2026' contains '2026-03-01', and string order puts it first by
 * prefix alone. Normalising cannot rescue that, because a bare year has no position relative to a
 * date inside it, and any padding invents an order the source never stated. So a nested pair is
 * a problem for a curator to resolve rather than a case to guess at, as are an invalid date and
 * two editions sharing a sort (which leaves their order, and at the max the current edition,
 * undefined). A one-off (`series_slug === null`) is its own latest, but its sort must be valid.
 *
 * It also requires a non-empty `edition_label`. The derivation does not use the label, but the
 * model it feeds is published as api/reports.json, and this is the one check both parse and
 * db:check run.
 *
 * The rows are put in document (`ordinal`) order first, so the editions, the problems and the
 * problem order do not depend on the order rows arrive in. reports.ndjson is already exported in
 * that order, but SQLite promises none and tests pass rows as they like, so the order is set here
 * rather than trusted from any caller.
 *
 * Each problem states what is wrong and nothing about how to fix it. The fix is one rule, stated
 * once in `EDITION_SORT_RULE`, because per-problem remedies each made their own claims about the
 * authoring flow and several were wrong.
 */
export function seriesRecency(
  rows: Pick<ReportRow, 'item_id' | 'series_slug' | 'edition_label' | 'edition_sort' | 'ordinal'>[],
): { bySeries: Map<string, SeriesRecency>; problems: string[] } {
  const problems: string[] = [];
  const grouped = new Map<string, { id: string; sort: string }[]>();
  const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const inDocumentOrder = [...rows].sort((a, b) => a.ordinal - b.ordinal || byId(a.item_id, b.item_id));
  for (const r of inDocumentOrder) {
    // Rows are cast from NDJSON unvalidated, so a hand-edited row may lack either field entirely.
    if (typeof r.edition_label !== 'string' || !r.edition_label.trim()) {
      problems.push(`${r.item_id}: missing or empty edition_label`);
    }
    if (typeof r.edition_sort !== 'string' || !isEditionSort(r.edition_sort)) {
      problems.push(`${r.item_id}: ${invalidEditionSort(r.edition_sort)}`);
      continue;
    }
    // `== null`: a hand-edited row may omit the key, which SQLite imports as NULL, so parse must too.
    if (r.series_slug == null) continue;
    (grouped.get(r.series_slug) ?? grouped.set(r.series_slug, []).get(r.series_slug)!)
      .push({ id: r.item_id, sort: r.edition_sort });
  }
  const bySeries = new Map<string, SeriesRecency>();
  for (const [series, list] of grouped) {
    // Stable, and the input is in document order, so editions sharing a sort keep document order.
    list.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0));
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (list[i + 1]?.sort === a.sort) {
        problems.push(`series '${series}': ${a.id} and ${list[i + 1].id} share edition_sort ${a.sort}`);
      }
      // Every sort that a.sort contains follows it contiguously in string order (anything between a
      // prefix and one of its extensions starts with that prefix too), so scanning forward until a
      // sort stops matching finds every nested pair, not just the first, and each is reported.
      for (let j = i + 1; j < list.length && list[j].sort.startsWith(a.sort); j++) {
        const b = list[j];
        if (b.sort !== a.sort) {
          problems.push(`series '${series}': edition_sort ${a.sort} (${a.id}) contains ${b.sort} (${b.id}), ` +
            'so neither can be ordered after the other');
        }
      }
    }
    bySeries.set(series, { editions: list.map((e) => e.id), latest: list.at(-1)!.id });
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
    throw new Error(`reports: invalid edition data (${problems.length}):\n` +
      `${problems.map((p) => `  - ${p}`).join('\n')}\n${EDITION_SORT_RULE}\n` +
      'Rules: seriesRecency in site/scripts/parser/reports.ts.');
  }

  return rows.map((r) => {
    const seriesSlug = r.series_slug ?? null; // an omitted key is a one-off, as seriesRecency reads it
    const series = seriesSlug === null ? undefined : bySeries.get(seriesSlug)!;
    const currentId = series?.latest;
    const isCurrent = series === undefined || currentId === r.item_id;
    return {
      id: r.item_id,
      title: r.title,
      url: r.url,
      seriesSlug,
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
