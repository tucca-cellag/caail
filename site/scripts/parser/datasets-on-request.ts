/**
 * datasets-on-request.ts — the studies whose data are shared only on request, for the
 * agent API (tucca-cellag/caail-planning#750).
 *
 * Read offline from the committed `datasets_on_request` NDJSON, like the curated entries.
 * These rows are deliberately not items: no `ds:` id, no topics, no part of
 * `counts.datasets`, so a consumer matching new finds against what CAAIL holds cannot read
 * one as a held dataset. They exist so a study cited nowhere else in CAAIL stays findable.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NDJSON_DIR } from '../db/lib.js';
import { cellText } from './dataset-inventory.js';
import { OnRequestStudySchema, type OnRequestStudy } from './types.js';

/** One stored row, as the NDJSON (and the page's table) holds it. */
export interface OnRequestRow { doi: string; page: string; study: string; statement: string; ordinal: number }

/**
 * The stored rows, in the order db:emit writes them: ordinal, then DOI compared code unit by
 * code unit, as SQLite's default BINARY collation does (localeCompare would not).
 */
export function readOnRequestRows(ndjsonDir: string = NDJSON_DIR): OnRequestRow[] {
  const path = join(ndjsonDir, 'datasets_on_request.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  const rows = text ? text.split('\n').map((l) => JSON.parse(l) as OnRequestRow) : [];
  return rows.sort((a, b) => a.ordinal - b.ordinal || (a.doi < b.doi ? -1 : a.doi > b.doi ? 1 : 0));
}

/**
 * Every on-request study for the API. `study` is served as plain text, the title as a
 * reader sees it (the page's cell can carry Markdown such as an italic species name);
 * `statement` is served as stored, the paper's own words. Takes the stored rows, so a caller
 * that also checks them against the pages reads the NDJSON once.
 */
export function buildOnRequestStudies(rows: readonly OnRequestRow[] = readOnRequestRows()): OnRequestStudy[] {
  return rows.map((r) => OnRequestStudySchema.parse({
    page: r.page,
    study: cellText(r.study),
    paperDoi: r.doi,
    statement: r.statement,
    dataStatus: 'on-request',
  }));
}

type Comparable = Pick<OnRequestRow, 'page' | 'doi' | 'study' | 'statement'>;

/**
 * The first difference between the stored rows and the rows the pages' tables hold, or null
 * when they agree on every (page, DOI, study, statement). A count alone would pass an edited
 * statement or DOI that was never re-emitted, and the API would then serve words the page
 * does not show. The stored rows are keyed by DOI, so a DOI the pages list twice is
 * reported first: it can be stored only once.
 */
export function onRequestDrift(stored: readonly Comparable[], written: readonly Comparable[]): string | null {
  const firstPage = new Map<string, string>();
  for (const w of written) {
    const first = firstPage.get(w.doi);
    if (first !== undefined) return `${w.doi} is listed on ${first} and on ${w.page}; a study goes on one page`;
    firstPage.set(w.doi, w.page);
  }
  const key = (r: Comparable): string => `${r.page}\u0000${r.doi}`;
  const pages = new Map(written.map((r) => [key(r), r]));
  for (const s of stored) {
    const w = pages.get(key(s));
    if (!w) return `${s.doi} on ${s.page} is stored but its page does not list it (run db:emit)`;
    if (w.study !== s.study) return `${s.doi} on ${s.page}: the page's study differs from the stored one (run db:emit)`;
    if (w.statement !== s.statement) return `${s.doi} on ${s.page}: the page's statement differs from the stored one (run db:emit)`;
    pages.delete(key(s));
  }
  const [extra] = pages.values();
  return extra ? `${extra.doi} on ${extra.page} is on the page but not stored (run db:bootstrap or remove it)` : null;
}
