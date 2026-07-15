/**
 * licenses.ts (parser) — fold the DB-owned license fields into the site JSON, offline,
 * from the committed catalog NDJSON (like topics.ts folds topic tags). Provides the
 * `(type,url)` lookup catalog.ts uses to attach `{license, licenseSource, tier}` to each
 * entry. The coarse tier is DERIVED here via the shared `licenseTier` classifier — never
 * stored — so the badge/hub/facet/dashboard can't disagree.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licenseTier, type LicenseTier } from '../../src/lib/licenses.ts';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

interface CatalogRow { item_id: string; url: string; license: string | null; license_source: 'auto' | 'manual' | null; }

/** The license triad attached to a card: raw token, provenance, and derived tier. */
export interface LicenseInfo {
  license: string | null;
  licenseSource: 'auto' | 'manual' | null;
  tier: LicenseTier;
}

/** The "unknown" info for an entry with no license row. */
export const UNKNOWN_LICENSE: LicenseInfo = { license: null, licenseSource: null, tier: 'unknown' };

function readNdjson<T>(name: string): T[] {
  const p = join(NDJSON_DIR, `${name}.ndjson`);
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf-8').trim();
  return text ? text.split('\n').map((l) => JSON.parse(l) as T) : [];
}

/** Derive the LicenseInfo for a raw token + provenance. */
export function licenseInfo(license: string | null, source: 'auto' | 'manual' | null): LicenseInfo {
  return { license: license ?? null, licenseSource: source ?? null, tier: licenseTier(license) };
}

/**
 * A catalog license lookup keyed on `(type, url)` — mirrors catalogTopicLookup so a
 * dual-listed entry (sw:/db: sharing a URL) can't cross-contaminate.
 */
export function catalogLicenseLookup(): (type: 'software' | 'database', url: string) => LicenseInfo {
  const map = new Map<string, { license: string | null; source: 'auto' | 'manual' | null }>();
  for (const r of readNdjson<CatalogRow>('catalog')) {
    const type = r.item_id.startsWith('sw:') ? 'software' : r.item_id.startsWith('db:') ? 'database' : null;
    if (type) map.set(`${type} ${r.url}`, { license: r.license ?? null, source: r.license_source ?? null });
  }
  return (type, url) => {
    const hit = map.get(`${type} ${url}`);
    return hit ? licenseInfo(hit.license, hit.source) : UNKNOWN_LICENSE;
  };
}
