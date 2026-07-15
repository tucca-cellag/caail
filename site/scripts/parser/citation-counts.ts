/**
 * citation-counts.ts (parser) — fold the OpenAlex global `cited_by_count` onto every
 * content type, offline, from the committed citation cache (like licenses.ts folds the
 * DB-owned license fields). Papers join by their parsed DOI; catalog + dataset entries
 * join by the DB-owned `doi` column. The count is DERIVED here (never stored), so the
 * badge, the /citations/ hub, and the catalog sort can't disagree. An absent cache
 * yields an empty map — every card simply renders without a count.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CitationCacheSchema, citedByCountByDoi, doiKey } from './citations.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(HERE, 'citation-cache.json');
const NDJSON_DIR = join(HERE, '..', '..', 'db', 'ndjson');

/** Load `doiKey -> OpenAlex cited_by_count` from the committed cache. Empty if absent/invalid. */
export function loadCitedByCounts(): Map<string, number> {
  if (!existsSync(CACHE_PATH)) return new Map();
  const parsed = CitationCacheSchema.safeParse(JSON.parse(readFileSync(CACHE_PATH, 'utf-8')));
  return parsed.success ? citedByCountByDoi(parsed.data) : new Map();
}

/** The DOI/citation triad attached to a card: the DOI, its provenance, and the derived count. */
export interface CitationInfo {
  doi: string | null;
  doiSource: 'auto' | 'manual' | null;
  citationCount: number | null;
}

/** The "no associated publication" info. */
export const NO_CITATION: CitationInfo = { doi: null, doiSource: null, citationCount: null };

/** Compute CitationInfo for a row's doi + provenance against the counts map. */
export function citationInfo(
  doi: string | null,
  source: 'auto' | 'manual' | null,
  counts: Map<string, number>,
): CitationInfo {
  const key = doiKey(doi);
  return {
    doi: doi ?? null,
    doiSource: source ?? null,
    citationCount: key ? counts.get(key) ?? null : null,
  };
}

interface CatalogRow { item_id: string; url: string; doi: string | null; doi_source: 'auto' | 'manual' | null; }

function readNdjson<T>(name: string): T[] {
  const p = join(NDJSON_DIR, `${name}.ndjson`);
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf-8').trim();
  return text ? text.split('\n').map((l) => JSON.parse(l) as T) : [];
}

/**
 * A catalog citation lookup keyed on `(type, url)` — mirrors catalogLicenseLookup so a
 * dual-listed entry (sw:/db: sharing a URL) can't cross-contaminate. `counts` is the
 * loaded cited-by map; the DOI itself comes from the DB-owned catalog NDJSON column.
 */
export function catalogCitationLookup(
  counts: Map<string, number>,
): (type: 'software' | 'database', url: string) => CitationInfo {
  const map = new Map<string, { doi: string | null; source: 'auto' | 'manual' | null }>();
  for (const r of readNdjson<CatalogRow>('catalog')) {
    const type = r.item_id.startsWith('sw:') ? 'software' : r.item_id.startsWith('db:') ? 'database' : null;
    if (type) map.set(`${type} ${r.url}`, { doi: r.doi ?? null, source: r.doi_source ?? null });
  }
  return (type, url) => {
    const hit = map.get(`${type} ${url}`);
    return hit ? citationInfo(hit.doi, hit.source, counts) : NO_CITATION;
  };
}
