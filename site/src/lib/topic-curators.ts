/**
 * topic-curators.ts — one place that answers "who leads this subject theme?".
 *
 * ONE MODULE, DELIBERATELY. The same question about colour was once answered by a
 * hardcoded per-slug mapping in three CSS files, drifted, and had to be consolidated into
 * `theme-colors.ts`. This is the same shape of data (a small map keyed by theme slug, read
 * by several components) and it starts consolidated rather than arriving there later.
 *
 * THE TERMS ARE NOT SETTLED, AND THE COPY MUST NOT PRETEND THEY ARE. Four questions are
 * open: what a lead commits to, how a theme gets one, what happens when nobody holds one,
 * and whether a name implies endorsing every placement inside that theme. Placements are
 * under active re-verification, so the last one matters most: nothing rendered from this
 * module may read as "this person vouches for every entry here". The word used on the site
 * is "lead", meaning a point of contact for an area, and the recruitment copy says plainly
 * that the commitment is still being worked out. That is a deliberate choice to be candid
 * about an unfinished thing rather than to imply a finished one.
 *
 * Identity is recorded as an ORCID where one exists, because it is stable across
 * institutions and is what a researcher already uses to be credited. `affiliation` is
 * shown, `url` is optional: a future lead may have no ORCID, and requiring one would
 * quietly restrict who can hold a theme.
 */

import topicsData from '../content/data/topics.json';

export interface Curator {
  /** Display name, as the person would want to be credited. */
  name: string;
  /** Short institutional affiliation. Kept short: this renders inside a card. */
  affiliation: string;
  /** Stable identity URL, ORCID preferred. Optional by design. */
  url?: string;
}

/**
 * Theme slug → lead. Sparse on purpose: an absent key is the honest state for a theme
 * nobody holds, and the surfaces render that absence rather than hiding it.
 *
 * Details are taken from `CITATION.cff`, which is the repo's existing record of who these
 * people are, rather than retyped here. If a name or ORCID needs changing, change it there
 * first and mirror it, so the two cannot disagree about the same person.
 */
const CURATORS: Record<string, Curator> = {
  'ai-methods-tooling': {
    name: 'Benjamin Bromberg',
    affiliation: 'TUCCA, Tufts University',
    url: 'https://orcid.org/0009-0001-3166-6329',
  },
};

const THEME_SLUGS = new Set((topicsData.themes as { slug: string }[]).map((t) => t.slug));

/* A key that matches no theme renders nothing, anywhere, silently — the failure looks
   identical to "this theme has no lead", which is a state the UI is designed to show. So a
   typo here would be invisible by construction. Fail the build instead. */
for (const slug of Object.keys(CURATORS)) {
  if (!THEME_SLUGS.has(slug)) {
    throw new Error(
      `topic-curators: "${slug}" is not a subject theme, so its lead would never render. ` +
        `Valid themes: ${[...THEME_SLUGS].join(', ')}.`,
    );
  }
}

/** The lead for a theme, or null where nobody holds it. */
export function curatorFor(slug: string): Curator | null {
  return CURATORS[slug] ?? null;
}

/**
 * How many themes are held and how many are open, derived from the live theme list.
 *
 * The recruitment copy quotes both numbers, and neither may be typed: the moment a lead is
 * added the sentence has to move with it, and a hand-written "seven of eight" would go
 * silently wrong on exactly the day the programme starts working.
 */
export function curatorCoverage(): { held: number; open: number; total: number } {
  const total = THEME_SLUGS.size;
  const held = [...THEME_SLUGS].filter((s) => CURATORS[s]).length;
  return { held, open: total - held, total };
}
