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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OnRequestStudySchema, type OnRequestStudy } from './types.js';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

interface OnRequestRow { doi: string; page: string; study: string; statement: string; ordinal: number }

/** Every on-request study, in document order across the dataset pages. */
export function buildOnRequestStudies(ndjsonDir: string = NDJSON_DIR): OnRequestStudy[] {
  const path = join(ndjsonDir, 'datasets_on_request.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  const rows = text ? text.split('\n').map((l) => JSON.parse(l) as OnRequestRow) : [];
  return [...rows]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((r) => OnRequestStudySchema.parse({
      page: r.page,
      study: r.study,
      paperDoi: r.doi,
      statement: r.statement,
      dataStatus: 'on-request',
    }));
}
