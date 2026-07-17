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

/**
 * The DOI/citation info attached to a card: the primary DOI (drives the badge link),
 * its provenance, the derived count, and how many papers that count aggregates.
 * `citationCount` sums the OpenAlex count over the primary DOI PLUS any sibling version
 * DOIs (`related_dois`, #102); `citationSources` is the number of those DOIs that
 * actually contributed a count (1 = a plain single-paper badge, >1 = aggregated).
 */
export interface CitationInfo {
  doi: string | null;
  doiSource: 'auto' | 'manual' | null;
  citationCount: number | null;
  citationSources: number;
  /** the bare DOIs whose counts were summed — the works the badge/hub link opens (#102) */
  citationDois: string[];
}

/** The "no associated publication" info. */
export const NO_CITATION: CitationInfo = { doi: null, doiSource: null, citationCount: null, citationSources: 0, citationDois: [] };

/** Parse the `related_dois` JSON-array column (a committed string) into a DOI list. */
export function parseRelatedDois(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Compute CitationInfo for a row's primary DOI + provenance + sibling version DOIs.
 * The count is the SUM of OpenAlex `cited_by_count` over the distinct DOIs (primary ∪
 * related) that have a count; null when none do. The primary `doi` is returned as-is
 * for the badge's click-through.
 */
export function citationInfo(
  doi: string | null,
  source: 'auto' | 'manual' | null,
  counts: Map<string, number>,
  related: readonly string[] = [],
): CitationInfo {
  const keys = [...new Set([doiKey(doi), ...related.map(doiKey)].filter((k): k is string => !!k))];
  let total = 0;
  const citationDois: string[] = []; // the DOIs that actually contributed a count (primary first)
  for (const k of keys) {
    const c = counts.get(k);
    if (c != null) { total += c; citationDois.push(k); }
  }
  return {
    doi: doi ?? null,
    doiSource: source ?? null,
    citationCount: citationDois.length > 0 ? total : null,
    citationSources: citationDois.length,
    citationDois,
  };
}

interface CatalogRow { item_id: string; url: string; doi: string | null; doi_source: 'auto' | 'manual' | null; related_dois: string | null; }

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
  const map = new Map<string, { doi: string | null; source: 'auto' | 'manual' | null; related: string[] }>();
  for (const r of readNdjson<CatalogRow>('catalog')) {
    const type = r.item_id.startsWith('sw:') ? 'software' : r.item_id.startsWith('db:') ? 'database' : null;
    if (type) map.set(`${type} ${r.url}`, { doi: r.doi ?? null, source: r.doi_source ?? null, related: parseRelatedDois(r.related_dois) });
  }
  return (type, url) => {
    const hit = map.get(`${type} ${url}`);
    return hit ? citationInfo(hit.doi, hit.source, counts, hit.related) : NO_CITATION;
  };
}
