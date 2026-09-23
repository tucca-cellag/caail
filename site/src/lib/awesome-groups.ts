/**
 * awesome-groups.ts — the single source of truth for the Awesome Lists page's
 * group anchor slugs.
 *
 * Both the AwesomeLists island (which renders one `<section>` per group, with the
 * slug as the group heading id) and the TableOfContents override (which lists the
 * groups in the right-rail "On This Page") read from here, so the TOC anchors and
 * the section ids can never drift. Mirrors catalog-groups.ts.
 */
import awesome from '../content/data/awesome-lists.json';
import { siteSlug } from './heading-slug';

export interface AwesomeGroup {
  label: string;
  /** anchor id (lowercase, non-alphanumeric runs → "-") */
  slug: string;
}

/** Slugify a group label to a stable anchor id (the site rule, heading-slug.ts). */
export const groupSlug = siteSlug;

/** The Awesome Lists groups, in document order, with their anchor slugs. */
export function awesomeGroups(): AwesomeGroup[] {
  return (awesome.groups ?? []).map((g: { label: string }) => ({
    label: g.label,
    slug: groupSlug(g.label),
  }));
}
