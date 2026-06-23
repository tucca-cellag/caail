/**
 * primer-sections.ts — the single source of truth for a primer hub's section
 * headings and their anchor slugs.
 *
 * Both PrimerHub (which renders one `<h2 id={slug}>` per section) and the
 * TableOfContents override (which lists the sections in the right-rail
 * "On This Page") read their slugs from the same `slug()` helper, so the TOC
 * anchors and the section ids can never drift. PrimerHub already imports that
 * helper directly from talk-sections; this module reuses it for the TOC side.
 */
import primers from '../content/data/primers.json';
import { slug } from './talk-sections';

export interface PrimerSection {
  heading: string;
  /** anchor id (lowercase, non-alphanumeric runs → "-") */
  slug: string;
}

/** A primer's section headings, in document order, with anchor slugs. */
export function primerSections(primerSlug: string): PrimerSection[] {
  const primer = primers.primers.find((p) => p.slug === primerSlug);
  return (primer?.sections ?? []).map((s) => ({ heading: s.heading, slug: slug(s.heading) }));
}
