/**
 * axis-links.ts — where each dashboard/matrix axis label points.
 *
 * Every "By the Numbers" bar label is a link, and each axis has a different natural
 * destination: a research area has a deep-dive page, a method has a Taxonomy
 * definition, a theme/tier/band has a filtered hub view, a species has a dataset page.
 * Centralised here so the dashboard, the Papers Explorer, and the hubs can't drift
 * apart on a route or a query-param name.
 *
 * BASE_URL is "/caail" (no trailing slash) inside islands, so it is normalised once
 * here — a bare template join would otherwise yield "/caailtaxonomy/".
 */

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

/**
 * GitHub's heading slug, which is also what Starlight generates for the rendered
 * Taxonomy.md page: lowercase, drop everything that isn't word/space/hyphen, then
 * spaces to hyphens. Dropping a character between two spaces collapses to a double
 * hyphen, which is why "AI Tooling / Methodology" becomes `ai-tooling--methodology`
 * and "Bioprocess & Scale-Up" becomes `bioprocess--scale-up`.
 */
export const ghSlug = (s: string): string =>
  s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/ /g, '-');

/** An AI/ML method row or research-area column → its Taxonomy.md definition. */
export const taxonomyHref = (label: string): string => `${BASE}/taxonomy/#${ghSlug(label)}`;

/**
 * Matrix area key → its ResearchAreas deep-dive route. Keys are the `areas.ts`
 * registry keys; values are the page ids in `caail-pages.ts`. One area has a
 * deep-dive page without being a matrix column (Metabolic Modeling), and it has no
 * key here, so it falls back to the Taxonomy definition below. `eval` is gone
 * entirely: CAAIL-164 retired the column, and its deep dive turned out to describe
 * the Benchmarks & Evaluation Frameworks *row*, so it moved to `Methods/` and is no
 * longer a research area's page to point at.
 */
export const RESEARCH_AREA_SLUG: Record<string, string> = {
  media: 'mediaoptimization',
  cell: 'cellengineering',
  bioprocess: 'bioprocess',
  scaffolding: 'scaffolding',
  sensory: 'sensoryprediction',
  tooling: 'aitooling',
};

/**
 * A research area's deep-dive page, falling back to its Taxonomy definition for any
 * area without one. The deep-dive pages are AI-assisted and explicitly NOT the
 * trusted definition source (see CLAUDE.md), so this is a "read more" link, not a
 * definition link — the Papers Explorer still points its axis labels at Taxonomy.
 */
export const researchAreaHref = (key: string, label: string): string => {
  const slug = RESEARCH_AREA_SLUG[key];
  return slug ? `${BASE}/research-areas/${slug}/` : taxonomyHref(label);
};

/** A species page from its `SPECIES_PAGES` name ("Cow" → /datasets/cow/). */
export const speciesHref = (species: string): string =>
  `${BASE}/datasets/${species.toLowerCase()}/`;

/** Filtered hub views. Param names must match the hubs' own readers. */
export const topicHref = (slug: string): string => `${BASE}/topics/?t=${slug}`;
export const licenseTierHref = (tier: string): string => `${BASE}/licenses/?tier=${tier}`;
export const citationBandHref = (band: string): string => `${BASE}/citations/?band=${band}`;
