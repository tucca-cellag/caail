/**
 * toc-inject.ts — shared "On This Page" injection for routes whose section
 * headings are rendered by an island / server component rather than as Markdown
 * (Software & Databases catalogs, Talks, Awesome Lists, and the Primer hubs).
 * Starlight can't collect those headings natively, so both the desktop
 * TableOfContents override and the MobileTableOfContents override call this to
 * rebuild `route.toc.items` as `[overview, ...sections]`.
 *
 * Why both overrides: Starlight renders MobileTableOfContents before the
 * right-rail TableOfContents, so a single override (the historical desktop-only
 * one) left the mobile "On this page" stuck on just "Overview". This helper is
 * idempotent — it always rebuilds from the page's section data and keeps the
 * leading overview item — so calling it from whichever override renders first,
 * then again from the second, yields the same result.
 *
 * The section slugs come from the same helpers the components use to render
 * their `<h2 id>`s, so the TOC anchors and the heading ids can never drift.
 */
import { catalogGroups, type CatalogKind } from './catalog-groups';
import { awesomeGroups } from './awesome-groups';
import { talkSections } from './talk-sections';
import { primerSections } from './primer-sections';

export interface TocItem {
  depth: number;
  slug: string;
  text: string;
  children: TocItem[];
}

/**
 * Given a normalized pathname (no trailing slash) and the page's existing
 * leading "Overview" item, return the section-augmented TOC items for an
 * island-rendered page, or `null` if this route renders Starlight's TOC
 * unchanged.
 *
 * The matched pages return `[overview, ...sections]` — i.e. the items array is
 * replaced wholesale. These routes intentionally carry no Markdown headings of
 * their own (only an intro paragraph + the island component); if one ever mixes
 * real Markdown `##` headings with the island, build the section list from both
 * here rather than discarding Starlight's collected headings.
 */
export function islandTocItems(path: string, overview: TocItem): TocItem[] | null {
  const section = (slug: string, text: string): TocItem => ({ depth: 2, slug, text, children: [] });

  const kind: CatalogKind | null = path.endsWith('/software')
    ? 'software'
    : path.endsWith('/databases')
      ? 'databases'
      : null;
  if (kind) {
    return [overview, ...catalogGroups(kind).map((g) => section(g.slug, g.label))];
  }
  if (path.endsWith('/talks')) {
    return [overview, ...talkSections().map((s) => section(s.slug, s.heading))];
  }
  if (path.endsWith('/awesome-lists')) {
    return [overview, ...awesomeGroups().map((g) => section(g.slug, g.label))];
  }
  const primerMatch = path.match(/\/primers\/([^/]+)$/);
  if (primerMatch) {
    return [overview, ...primerSections(primerMatch[1]).map((s) => section(s.slug, s.heading))];
  }
  return null;
}
