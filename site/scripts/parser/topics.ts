/**
 * topics.ts — build the site's topic model from the committed topic NDJSON
 * (`site/db/ndjson/{topics,item_topics,items}.ndjson`), read offline like the
 * citation cache. `topicsByItemId` maps each content item to its topic refs (for
 * folding onto catalog/paper entries); `buildTopicsModel` builds the theme→tag tree
 * with per-content-type counts (for `topics.json`, the hub, and filters).
 *
 * A theme's count is over the UNION of items tagging the theme directly OR any of its
 * fine tags — deduped by item id, so an item tagging both a fine tag and its theme
 * counts once.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TopicsDataSchema, type TopicRef, type TopicNode, type TopicsData } from './types.js';

const NDJSON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'ndjson');

interface TopicRow { item_id: string; slug: string; label: string; tier: 'theme' | 'tag'; theme_slug: string | null; area_key: string | null; }
interface ItemTopicRow { item_id: string; topic_id: string; }
interface ItemRow { id: string; type: string; slug: string; }

function readNdjson<T>(name: string): T[] {
  const p = join(NDJSON_DIR, `${name}.ndjson`);
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf-8').trim();
  return text ? text.split('\n').map((l) => JSON.parse(l) as T) : [];
}

const topicRows = (): TopicRow[] => readNdjson<TopicRow>('topics');
const topicById = () => new Map(topicRows().map((t) => [t.item_id, t]));

/** Map every content item id → its topic refs (fine tag or theme + parent theme slug). */
export function topicsByItemId(): Map<string, TopicRef[]> {
  const byId = topicById();
  const out = new Map<string, TopicRef[]>();
  for (const it of readNdjson<ItemTopicRow>('item_topics')) {
    const t = byId.get(it.topic_id);
    if (!t) continue;
    const ref: TopicRef = { slug: t.slug, label: t.label, theme: t.tier === 'tag' ? (t.theme_slug as string) : t.slug };
    const arr = out.get(it.item_id) ?? out.set(it.item_id, []).get(it.item_id)!;
    if (!arr.some((r) => r.slug === ref.slug)) arr.push(ref);
  }
  return out;
}

/**
 * A catalog topic lookup keyed POSITIONALLY: the Nth parsed entry of a type maps to the
 * Nth committed catalog row of that type, ordered to reconstruct the EMITTED document
 * order the parser reads. That order is `emitCatalogFile`'s: source groups first (each
 * group's earliest ordinal = its document position), then entries within a group by
 * ordinal — NOT a flat global-ordinal sort. (db:add assigns a new entry a global-max
 * ordinal but re-emits it inside its own group, so a plain ordinal sort would diverge
 * from the parser and shift every downstream entry's topics — cycle-4 fix.)
 *
 * Position can't collide, so two same-type entries sharing a URL keep distinct topics
 * (the GFI seafood databases); cross-type dual-listing (sw:gnps / db:gnps) is naturally
 * separated because each type has its own ordered list.
 */
/**
 * Order catalog rows into the EMITTED document order (what the parser reads back):
 * source groups first — each group placed at its earliest ordinal — then entries within
 * a group by ordinal. This matches `emitCatalogFile`, so a `db:add` entry (which gets a
 * global-max ordinal but is re-emitted inside its own group) sorts into that group, not
 * at the end. A flat global-ordinal sort would diverge and shift downstream topics.
 */
export function orderCatalogRows<T extends { grp: string; ordinal: number }>(rows: T[]): T[] {
  const grpMin = new Map<string, number>();
  for (const r of rows) grpMin.set(r.grp, Math.min(grpMin.get(r.grp) ?? Infinity, r.ordinal));
  return [...rows].sort((a, b) => (grpMin.get(a.grp)! - grpMin.get(b.grp)!) || (a.ordinal - b.ordinal));
}

export function catalogTopicLookup(): (type: 'software' | 'database', index: number) => TopicRef[] {
  const byId = topicsByItemId();
  const rows = readNdjson<{ item_id: string; grp: string; ordinal: number }>('catalog');
  const orderFor = (prefix: string) =>
    orderCatalogRows(rows.filter((r) => r.item_id.startsWith(prefix))).map((r) => r.item_id);
  const ordered = { software: orderFor('sw:'), database: orderFor('db:') };
  return (type, index) => byId.get(ordered[type][index] ?? '') ?? [];
}

/**
 * Every tagged paper/catalog item id that does NOT resolve to a parsed site entry
 * (orphan). Papers resolve by `paper:id`; catalog by its NDJSON url appearing in the
 * parsed catalog. Datasets are exempt — they have no site JSON. Drives the build guard.
 */
export function unresolvedTopicItems(paperIds: Set<string>, catalogUrls: Set<string>): string[] {
  const idToUrl = new Map<string, string>();
  for (const r of readNdjson<{ item_id: string; url: string }>('catalog')) idToUrl.set(r.item_id, r.url);
  const bad: string[] = [];
  for (const id of new Set(readNdjson<ItemTopicRow>('item_topics').map((r) => r.item_id))) {
    if (id.startsWith('paper:')) { if (!paperIds.has(id)) bad.push(id); }
    else if (id.startsWith('sw:') || id.startsWith('db:')) { const u = idToUrl.get(id); if (!u || !catalogUrls.has(u)) bad.push(id); }
  }
  return bad;
}

/** Build the theme→tag tree with per-content-type counts. */
export function buildTopicsModel(): TopicsData {
  const rows = topicRows();
  const byId = new Map(rows.map((t) => [t.item_id, t]));
  const itemType = new Map(readNdjson<ItemRow>('items').map((i) => [i.id, i.type]));

  const direct = new Map<string, Set<string>>(); // topic slug → directly-tagged item ids
  for (const t of rows) direct.set(t.slug, new Set());
  for (const it of readNdjson<ItemTopicRow>('item_topics')) {
    const t = byId.get(it.topic_id);
    if (t) direct.get(t.slug)!.add(it.item_id);
  }
  const childTags = new Map<string, string[]>(); // theme slug → its fine-tag slugs
  for (const t of rows) if (t.tier === 'theme') childTags.set(t.slug, []);
  for (const t of rows) if (t.tier === 'tag' && t.theme_slug) childTags.get(t.theme_slug)?.push(t.slug);

  const countOf = (members: Set<string>) => {
    const c = { paper: 0, software: 0, database: 0, dataset: 0, total: 0 };
    for (const id of members) {
      const ty = itemType.get(id);
      if (ty === 'paper' || ty === 'software' || ty === 'database' || ty === 'dataset') { c[ty]++; c.total++; }
    }
    return c;
  };

  const tags: TopicNode[] = rows.filter((t) => t.tier === 'tag').map((t) => ({
    slug: t.slug, label: t.label, tier: 'tag', theme: t.theme_slug, areaKey: null,
    counts: countOf(direct.get(t.slug)!), tags: [],
  }));
  const themes: TopicNode[] = rows.filter((t) => t.tier === 'theme').map((t) => {
    const members = new Set(direct.get(t.slug)!);
    for (const child of childTags.get(t.slug) ?? []) for (const id of direct.get(child)!) members.add(id);
    return {
      slug: t.slug, label: t.label, tier: 'theme' as const, theme: null, areaKey: t.area_key,
      counts: countOf(members), tags: childTags.get(t.slug) ?? [],
    };
  });

  return TopicsDataSchema.parse({ themes, tags });
}
