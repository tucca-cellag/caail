/**
 * talk-sections.ts — the single source of truth for the Talks page's section
 * headings and their anchor slugs.
 *
 * Both TalksList (which renders one `<h2 id={slug}>` per section) and the
 * TableOfContents override (which lists the sections in the right-rail
 * "On This Page") read from here, so the TOC anchors and the section ids can
 * never drift.
 */
import talks from '../content/data/talks.json';
import { siteSlug } from './heading-slug';

export interface TalkSection {
  heading: string;
  /** anchor id (lowercase, non-alphanumeric runs → "-") */
  slug: string;
}

/** Slugify a heading to a stable anchor id (the rule lives in heading-slug.ts,
 *  where the link rewriters can reach it without importing talks.json). */
export const slug = siteSlug;

/** Talks.md section headings, in document order, with anchor slugs. */
export function talkSections(): TalkSection[] {
  return (talks.sections as Array<{ heading: string }>).map((s) => ({
    heading: s.heading,
    slug: slug(s.heading),
  }));
}
