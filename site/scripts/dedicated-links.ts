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
 * A route gets an anchor map when its ids can be derived from the canonical
 * file. Talks and the two primers have one (one id per `##` section, and those
 * sections are ALL the ids a link can target, so a miss there is a broken link
 * and throws). Map keys are GitHub's anchors only: the canonical Markdown is
 * read on GitHub first, so a link must work there, and the site translates it.
 * Software, Databases, Awesome Lists, Field Reports and the Papers explorer
 * have none yet, although most of their ids are derivable too; adding one here
 * is how CAAIL-268 gets fixed, for both rewriters at once.
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Heading } from 'mdast';

import { DEDICATED_ROUTES } from '../src/content/dedicated-routes.ts';
import { githubSlug, siteSlug } from '../src/lib/heading-slug.ts';
import { parseFile } from './parser/markdown.js';

export const GITHUB_BLOB_BASE = 'https://github.com/tucca-cellag/caail/blob/main';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** GitHub's anchor for a heading → the id the route renders for it. */
type AnchorMap = ReadonlyMap<string, string>;

export function sectionAnchors(repoRel: string, headings: readonly string[]): AnchorMap {
  const map = new Map<string, string>();
  for (const h of headings) {
    const key = githubSlug(h);
    const id = siteSlug(h);
    const prior = map.get(key);
    // GitHub would suffix a repeated slug (-1, -2) and the site would render two
    // equal ids; either way one link could not name both sections.
    if (prior !== undefined) {
      throw new Error(`dedicated-links: two ## headings in ${repoRel} share the anchor "#${key}".`);
    }
    map.set(key, id);
  }
  return map;
}

/** An incoming anchor as GitHub would match it: percent-decoded, lowercase. */
function normalizeAnchor(anchor: string): string {
  let a = anchor;
  try {
    a = decodeURIComponent(anchor);
  } catch {
    // a malformed escape is left as written; it will simply not match
  }
  return a.toLowerCase();
}

/** The text of every `##` heading in a canonical file. */
function h2Headings(repoRel: string): string[] {
  return parseFile(join(REPO_ROOT, repoRel))
    .children.filter((n): n is Heading => n.type === 'heading' && (n as Heading).depth === 2)
    .map((h) => mdastToString(h).trim());
}

/**
 * Routes whose every linkable id is derived here. Each renders exactly one
 * `id={siteSlug(heading)}` per `##` section (TalksList, PrimerHub; tests pin
 * the headings to each parser's sections), so a miss against one of these maps
 * is an anchor GitHub cannot resolve either.
 */
const SECTION_ROUTES = ['Talks.md', 'Primers/CellAg.md', 'Primers/AI.md'] as const;
const ANCHOR_MAPS: Record<string, () => AnchorMap> = Object.fromEntries(
  SECTION_ROUTES.map((f) => [f, () => sectionAnchors(f, h2Headings(f))]),
);

/**
 * Keyed on the source file's mtime, so a long-lived `astro dev` process picks up
 * a renamed heading instead of resolving against the one it first saw.
 */
const cache = new Map<string, { mtimeMs: number; map: AnchorMap }>();

function anchorsFor(repoRel: string): AnchorMap | undefined {
  const build = ANCHOR_MAPS[repoRel];
  if (!build) return undefined;
  const { mtimeMs } = statSync(join(REPO_ROOT, repoRel));
  const hit = cache.get(repoRel);
  if (hit && hit.mtimeMs === mtimeMs) return hit.map;
  const map = build();
  cache.set(repoRel, { mtimeMs, map });
  return map;
}

/**
 * The base-relative on-site URL for a link to `repoRel` (+ optional anchor),
 * or undefined when `repoRel` has no dedicated route or no anchor map to check
 * the anchor against. Throws when the route HAS a complete map and the anchor
 * is not in it: GitHub cannot resolve that link, so it is broken at the source.
 */
export function dedicatedLink(repoRel: string, anchor?: string): string | undefined {
  const route = DEDICATED_ROUTES[repoRel];
  if (!route) return undefined;
  if (!anchor) return route;
  const map = anchorsFor(repoRel);
  if (!map) return undefined;
  const id = map.get(normalizeAnchor(anchor));
  if (!id) {
    const known = [...map.keys()].map((k) => `#${k}`).join(', ');
    throw new Error(
      `dedicated-links: "${repoRel}#${anchor}" is not a GitHub anchor of ${repoRel} ` +
        `(its sections: ${known}). Fix the link, or the heading it points at.`,
    );
  }
  return `${route}#${id}`;
}
