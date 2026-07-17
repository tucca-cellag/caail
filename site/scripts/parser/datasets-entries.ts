/**
 * datasets-entries.ts — build datasets.json (the curated `### …` dataset entries:
 * featured atlases, GEMs, reference entries) from the committed dataset_entries
 * NDJSON, read offline like the topic model. Each entry is joined to its topic refs
 * (via topicsByItemId) so its card can render chips and the /topics/ hub can list it
 * as a linkable item.
 *
 * The parser READS the committed NDJSON; it never touches the DB or the canonical
 * Markdown. An absent cache (no dataset_entries.ndjson) yields an empty model.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatasetsDataSchema, type DatasetsData, type DatasetEntry } from './types.js';
import { topicsByItemId } from './topics.js';
import { licenseInfo } from './licenses.js';
import { citationInfo, loadCitedByCounts, parseRelatedDois } from './citation-counts.js';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

interface EntryRow {
  item_id: string; name: string; url: string | null; page: string;
  section: string; kind: 'atlas' | 'gem' | 'other'; heading_md: string; body_md: string;
  license: string | null; license_source: 'auto' | 'manual' | null;
  doi: string | null; doi_source: 'auto' | 'manual' | null; related_dois: string | null; ordinal: number;
}

/** lowercase, spaces→`-`, strip all but [a-z0-9-], collapse repeats (mirrors catalog). */
function slugifyToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * The unique per-page card anchor for an entry name (the card element id + the hub #link
 * scroll target), given the anchors already used on that page (which this MUTATES). The
 * `ds-` prefix keeps the card's id distinct from the H3's own rehype-slug id. Collision-
 * safe: it checks the FINAL anchor against every one already used — not a per-base counter
 * — so a literal name that slugifies to an already-suffixed form (e.g. "Entry-2" after two
 * "Entry"s) can't produce a duplicate `ds-entry-2` DOM id. Mirrors lib.ts's `assignId`.
 */
export function datasetEntryAnchor(name: string, usedOnPage: Set<string>): string {
  const base = `ds-${slugifyToken(name) || 'entry'}`;
  let anchor = base;
  for (let n = 2; usedOnPage.has(anchor); n += 1) anchor = `${base}-${n}`;
  usedOnPage.add(anchor);
  return anchor;
}

/**
 * Build the datasets.json model. Anchors are unique PER PAGE via `datasetEntryAnchor`.
 */
export function buildDatasetsModel(): DatasetsData {
  const path = join(NDJSON_DIR, 'dataset_entries.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  const rows = text ? text.split('\n').map((l) => JSON.parse(l) as EntryRow) : [];
  const byId = topicsByItemId();
  const counts = loadCitedByCounts();

  const usedPerPage = new Map<string, Set<string>>();
  const entries: DatasetEntry[] = rows.map((r) => {
    const used = usedPerPage.get(r.page) ?? usedPerPage.set(r.page, new Set()).get(r.page)!;
    const anchor = datasetEntryAnchor(r.name, used);
    return {
      id: r.item_id,
      name: r.name,
      url: r.url,
      page: r.page,
      section: r.section,
      kind: r.kind,
      anchor,
      topics: byId.get(r.item_id) ?? [],
      ...licenseInfo(r.license, r.license_source),
      ...citationInfo(r.doi, r.doi_source, counts, parseRelatedDois(r.related_dois)),
    };
  });

  return DatasetsDataSchema.parse({ entries });
}
