/**
 * report-groups.ts — the single source of truth for the Field Reports page's
 * series grouping, group anchor slugs, and per-edition anchor ids.
 *
 * Both the FieldReports island (which renders one `<section>` per series, with
 * the slug as the group heading id, and an anchor id per edition card) and the
 * TableOfContents override (which lists the series in the right-rail "On This
 * Page") read from here, so the TOC anchors and the section ids can never drift.
 * Mirrors awesome-groups.ts / catalog-groups.ts.
 *
 * The reports themselves come from `reports.json`, which the parser derives from
 * the committed `reports.ndjson`: `current`/`supersededBy`/`seriesEditions` are
 * derived at parse from max(edition_sort) per series (see scripts/parser/reports.ts),
 * so this module only groups and orders — it never re-derives recency.
 */
import reports from '../content/data/reports.json';
import type { TopicRef } from './topic-chips';
import { siteSlug } from './heading-slug';

/** One field-report record, mirroring `ReportSchema` in scripts/parser/types.ts. */
export interface ReportRecord {
  id: string;
  title: string;
  url: string | null;
  seriesSlug: string | null;
  editionLabel: string;
  current: boolean;
  supersededBy: string | null;
  seriesEditions: string[];
  topics: TopicRef[];
}

/** A recurring report line (or a one-off), with its editions newest-first. */
export interface ReportGroup {
  /** display name — the current edition's title with a trailing edition label stripped */
  label: string;
  /** stable anchor id for the series `<h2>`: the immutable seriesSlug (or the
   *  one-off's frozen id), NOT the mutable display label, so a reworded title in
   *  a future edition can't break a bookmarked `#slug` (CLAUDE.md anchor stability) */
  slug: string;
  /** the series' editions, newest-first (a one-off is a single-edition group) */
  editions: ReportRecord[];
  /** the current (latest) edition of the series */
  current: ReportRecord;
}

const ALL = reports.reports as unknown as ReportRecord[];

/** Slugify a group label to a stable anchor id (the site rule, heading-slug.ts). */
export const groupSlug = siteSlug;

/**
 * A stable DOM anchor for one edition, derived from its frozen `report:` id.
 * The id contains a colon; sanitising it keeps the in-page "superseded by"
 * links and card ids free of CSS-selector edge cases.
 */
export function editionAnchor(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, '-');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The series display name: the current edition's title without its edition label. */
function seriesLabel(current: ReportRecord): string {
  const title = current.title.trim();
  const stripped = title.replace(new RegExp(`\\s+${escapeRegExp(current.editionLabel)}$`), '').trim();
  return stripped || title;
}

/**
 * The stable series anchor id: the immutable seriesSlug for a recurring line, or
 * the one-off's frozen id. Derived from an id the DB owns, never from the mutable
 * display label, so a reworded title in a later edition leaves the anchor (and its
 * TOC link + any bookmark) unchanged.
 *
 * Every id is `series-<base>`. A one-off's base is `editionAnchor(id)`, which
 * always begins `report-` (its id is `report:<slug>`); a series' base is
 * `groupSlug(seriesSlug)`. The two are disjoint ONLY while no series slug itself
 * slugifies to something beginning `report-`: a series `report-x` and a one-off
 * `report:x` would both claim `series-report-x`. That case throws rather than
 * being fixed with a new prefix, because a new prefix would move the live
 * one-off anchor and break its bookmarks.
 */
export function seriesAnchor(current: Pick<ReportRecord, 'id' | 'seriesSlug'>): string {
  // Grouping keys on `seriesSlug ?? id`, so an empty string is a real series key
  // that would merge every such report into one group. Only null means one-off.
  if (current.seriesSlug === '') {
    throw new Error(`report-groups: ${current.id} has an empty seriesSlug; use null for a one-off.`);
  }
  if (current.seriesSlug === null) {
    // A one-off: its series <h2> and its sole card derive from the same frozen
    // id, so without the `series-` prefix they would share a DOM id and fail
    // the axe duplicate-id check.
    return `series-${editionAnchor(current.id)}`;
  }
  const base = groupSlug(current.seriesSlug);
  if (base === '') {
    throw new Error(`report-groups: seriesSlug "${current.seriesSlug}" (on ${current.id}) slugifies to nothing.`);
  }
  if (base.startsWith('report-')) {
    throw new Error(
      `report-groups: seriesSlug "${current.seriesSlug}" (on ${current.id}) slugifies to "${base}", ` +
        'which begins "report-", the namespace reserved for one-off report anchors. Rename the series slug.',
    );
  }
  // `series-` also keeps the heading clear of every edition CARD anchor
  // (editionAnchor → "report-…").
  return `series-${base}`;
}

/**
 * Distinct seriesSlugs can still fold to one `groupSlug` (`a_b` and `a-b`), so
 * uniqueness of the input does not make the anchors unique. Check the output.
 */
export function assertUniqueAnchors(groups: ReadonlyArray<Pick<ReportGroup, 'slug'>>): void {
  const seen = new Set<string>();
  for (const { slug } of groups) {
    if (seen.has(slug)) throw new Error(`report-groups: duplicate series anchor "${slug}"`);
    seen.add(slug);
  }
}

/**
 * The page lists editions newest-first by reversing `seriesEditions`, which the
 * parser emits oldest→newest. Nothing else ties the two: if that order ever
 * flipped (CAAIL-373 weighed it), the page would silently go oldest-first. The
 * current edition is by definition the newest, so it must be the last entry.
 */
export function assertOldestFirst(current: Pick<ReportRecord, 'id' | 'seriesEditions'>): void {
  const eds = current.seriesEditions;
  if (eds.length > 1 && eds[eds.length - 1] !== current.id) {
    throw new Error(
      `report-groups: seriesEditions for ${current.id} is not oldest-first ` +
        `(${eds.join(', ')}); the current edition must be last.`,
    );
  }
}

/**
 * The field reports grouped by series (one-offs are their own single group), in
 * first-seen document order, each with its editions newest-first.
 *
 * Ordering within a series comes from the derived `seriesEditions` (sorted
 * oldest→newest), reversed — the authoritative order from the model rather than
 * a re-sort here.
 */
export function reportGroups(): ReportGroup[] {
  const byId = new Map(ALL.map((r) => [r.id, r]));
  const order: string[] = [];
  const buckets = new Map<string, ReportRecord[]>();
  for (const r of ALL) {
    const key = r.seriesSlug ?? r.id;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(r);
  }

  const groups = order.map((key) => {
    const members = buckets.get(key)!;
    const current = members.find((r) => r.current) ?? members[0];
    assertOldestFirst(current);
    const editions = [...current.seriesEditions]
      .reverse()
      .map((id) => byId.get(id))
      .filter((r): r is ReportRecord => Boolean(r));
    const ordered = editions.length > 0 ? editions : members;
    const label = seriesLabel(current);
    return { label, slug: seriesAnchor(current), editions: ordered, current };
  });
  assertUniqueAnchors(groups);
  return groups;
}

/** The Field Reports series, in document order, for the "On This Page" TOC. */
export function reportSections(): { slug: string; label: string }[] {
  return reportGroups().map((g) => ({ slug: g.slug, label: g.label }));
}
