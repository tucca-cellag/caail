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
  /** anchor id for the series `<h2>` (same rule as catalog-groups / awesome-groups) */
  slug: string;
  /** the series' editions, newest-first (a one-off is a single-edition group) */
  editions: ReportRecord[];
  /** the current (latest) edition of the series */
  current: ReportRecord;
}

const ALL = reports.reports as unknown as ReportRecord[];

/** Slugify a group label to a stable anchor id (identical rule to catalog-groups). */
export function groupSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

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
  const seen = new Set<string>();
  for (const r of ALL) {
    const key = r.seriesSlug ?? r.id;
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }

  return order.map((key) => {
    const members = ALL.filter((r) => (r.seriesSlug ?? r.id) === key);
    const current = members.find((r) => r.current) ?? members[0];
    const editions = [...current.seriesEditions]
      .reverse()
      .map((id) => byId.get(id))
      .filter((r): r is ReportRecord => Boolean(r));
    const ordered = editions.length > 0 ? editions : members;
    const label = seriesLabel(current);
    return { label, slug: groupSlug(label), editions: ordered, current };
  });
}

/** The Field Reports series, in document order, for the "On This Page" TOC. */
export function reportSections(): { slug: string; label: string }[] {
  return reportGroups().map((g) => ({ slug: g.slug, label: g.label }));
}
