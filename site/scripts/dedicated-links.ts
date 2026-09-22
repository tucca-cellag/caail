/**
 * dedicated-links.ts — resolve a repo-relative link to a DEDICATED_ROUTES file
 * (a card or island page) to its on-site URL, or report that it can't be.
 *
 * The rule both link rewriters share: a bare link always resolves to the route.
 * An anchored link resolves ONLY when the anchor is known to exist on that
 * route, because a card page mints its own ids and an unknown anchor lands the
 * reader at the top of the page with nothing failing. Otherwise this returns
 * undefined and the caller keeps its GitHub blob fallback, which deep-links.
 *
 * Anchor maps exist only where a page's ids can be derived from the canonical
 * file. Today that is Talks (one id per `##` section). Every other dedicated
 * route has none yet; that gap is CAAIL-268, and adding a map here closes it
 * for both rewriters at once.
 */
import { DEDICATED_ROUTES } from '../src/content/dedicated-routes.ts';
import { githubSlug, siteSlug } from '../src/lib/heading-slug.ts';
import { buildTalksModel } from './parser/talks.js';

/** Incoming anchor (GitHub's slug or the site's) → the id the route renders. */
type AnchorMap = ReadonlyMap<string, string>;

function sectionAnchors(headings: readonly string[]): AnchorMap {
  const map = new Map<string, string>();
  for (const h of headings) {
    const id = siteSlug(h);
    map.set(githubSlug(h), id); // what a link written for GitHub carries
    map.set(id, id); // what a link written for the site carries
  }
  return map;
}

const ANCHOR_MAPS: Record<string, () => AnchorMap> = {
  // TalksList renders `<h2 id={slug(heading)}>` per parsed section.
  'Talks.md': () => sectionAnchors(buildTalksModel().sections.map((s) => s.heading)),
};

const cache = new Map<string, AnchorMap>();

function anchorsFor(repoRel: string): AnchorMap | undefined {
  const build = ANCHOR_MAPS[repoRel];
  if (!build) return undefined;
  let map = cache.get(repoRel);
  if (!map) cache.set(repoRel, (map = build()));
  return map;
}

/**
 * The base-relative on-site URL for a link to `repoRel` (+ optional anchor),
 * or undefined when `repoRel` has no dedicated route or the anchor can't be
 * shown to exist there.
 */
export function dedicatedLink(repoRel: string, anchor?: string): string | undefined {
  const route = DEDICATED_ROUTES[repoRel];
  if (!route) return undefined;
  if (!anchor) return route;
  const id = anchorsFor(repoRel)?.get(anchor);
  return id ? `${route}#${id}` : undefined;
}
