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

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

interface EntryRow {
  item_id: string; name: string; url: string | null; page: string;
  section: string; kind: 'atlas' | 'gem' | 'other'; heading_md: string; body_md: string; ordinal: number;
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
 * Build the datasets.json model. Anchors are unique PER PAGE (the card element id +
 * the hub #link scroll target): a base slug collision within a page gets `-2`, `-3`, …
 */
export function buildDatasetsModel(): DatasetsData {
  const path = join(NDJSON_DIR, 'dataset_entries.ndjson');
  const text = existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
  const rows = text ? text.split('\n').map((l) => JSON.parse(l) as EntryRow) : [];
  const byId = topicsByItemId();

  const seenPerPage = new Map<string, Map<string, number>>();
  const entries: DatasetEntry[] = rows.map((r) => {
    const seen = seenPerPage.get(r.page) ?? seenPerPage.set(r.page, new Map()).get(r.page)!;
    const base = slugifyToken(r.name) || 'entry';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const anchor = n === 0 ? base : `${base}-${n + 1}`;
    return {
      id: r.item_id,
      name: r.name,
      url: r.url,
      page: r.page,
      section: r.section,
      kind: r.kind,
      anchor,
      topics: byId.get(r.item_id) ?? [],
    };
  });

  return DatasetsDataSchema.parse({ entries });
}
