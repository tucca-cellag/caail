/**
 * The beta notice's wording and links, in one place.
 *
 * `BetaNotice.astro` renders them on the site, `README.md` carries a copy for
 * GitHub visitors, and `e2e/beta-notice.spec.ts` asserts the rendered page
 * against them. `beta-notice.test.ts` fails if the README copy drifts from
 * this module, or if the roadmap anchor stops matching a heading on the
 * curation page.
 *
 * The wording is fixed by tucca-cellag/caail-planning#565: change it there
 * first, and say no more about v2 here than this text already does.
 */
import { SITE_ORIGIN, SITE_BASE } from '../content/site-config';

export const BETA_LEAD = 'CAAIL is in beta.';
export const BETA_BODY =
  "We're re-checking earlier classifications and reorganizing the research areas for v2.";

/** Site paths, without the base; prefix the base (or the origin) at the call site. */
export const BETA_LINKS = [
  { label: 'See the roadmap', path: '/curation/#6-roadmap' },
  { label: 'Tell us what you think', path: '/community/' },
] as const;

/** The roadmap link's target page and heading anchor, for the drift check. */
export const ROADMAP_PAGE = 'site/src/content/docs/curation.mdx';
export const ROADMAP_ANCHOR = '6-roadmap';

/** Absolute URL of a notice link, as written in README.md. */
export const absoluteBetaHref = (path: string): string => `${SITE_ORIGIN}${SITE_BASE}${path}`;
