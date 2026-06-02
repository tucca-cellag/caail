/**
 * catalog-groups.ts — the single source of truth for the catalog's
 * application-area groups and their anchor slugs.
 *
 * Both the CatalogBrowser island (which renders one `<section>` per group, with
 * the slug as the group heading id) and the TableOfContents override (which
 * lists the groups in the right-rail "On This Page") read from here, so the
 * TOC anchors and the section ids can never drift.
 */
import catalog from '../content/data/catalog.json';

export type CatalogKind = 'software' | 'databases';
export interface CatalogGroup {
  label: string;
  /** anchor id (lowercase, non-alphanumeric runs → "-") */
  slug: string;
}

/** Slugify a group label to a stable anchor id. */
export function groupSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Distinct application-area groups for a catalog kind, in document order. */
export function catalogGroups(kind: CatalogKind): CatalogGroup[] {
  const entries = (catalog[kind] ?? []) as Array<{ group: string }>;
  const seen = new Set<string>();
  const out: CatalogGroup[] = [];
  for (const e of entries) {
    if (!seen.has(e.group)) {
      seen.add(e.group);
      out.push({ label: e.group, slug: groupSlug(e.group) });
    }
  }
  return out;
}
