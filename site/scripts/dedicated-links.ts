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
 * file. Talks and the two primers have one: every heading GitHub anchors is a
 * key, so an anchor missing from the map is broken on GitHub too and throws.
 * Only `##` headings render an id on the site (one per section); a valid anchor
 * to any other heading keeps its GitHub blob. Keys are GitHub's anchors only:
 * the canonical Markdown is read on GitHub first, so a link must work there,
 * and the site translates it. Software, Databases, Awesome Lists, Field Reports
 * and the Papers explorer have no map yet, although most of their ids are
 * derivable too; adding one here is how CAAIL-268 gets fixed, for both
 * rewriters at once.
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

/**
 * GitHub's anchor for a heading → the id the route renders for it, or null when
 * GitHub anchors the heading but the route renders no id for it.
 */
type AnchorMap = ReadonlyMap<string, string | null>;

export interface HeadingRef {
  depth: number;
  text: string;
}

/**
 * Build a route's anchor map. Keys follow GitHub: every heading is anchored, and
 * a repeated slug gets `-1`, `-2`… in document order. Values are the site id,
 * which only `##` sections render; two sections rendering one id is an error,
 * since the page would carry a duplicate id and one of them could not be linked.
 */
export function sectionAnchors(repoRel: string, headings: readonly HeadingRef[]): AnchorMap {
  const map = new Map<string, string | null>();
  const seenGithub = new Map<string, number>();
  const seenSite = new Map<string, string>();
  for (const { depth, text } of headings) {
    const base = githubSlug(text);
    const n = seenGithub.get(base) ?? 0;
    seenGithub.set(base, n + 1);
    const key = n === 0 ? base : `${base}-${n}`;
    let id: string | null = null;
    if (depth === 2) {
      id = siteSlug(text);
      const prior = seenSite.get(id);
      if (prior !== undefined) {
        throw new Error(
          `dedicated-links: "${prior}" and "${text}" in ${repoRel} both render the site id "#${id}".`,
        );
      }
      seenSite.set(id, text);
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

/** Every heading in a canonical file, in document order. */
function headingsOf(repoRoot: string, repoRel: string): HeadingRef[] {
  return parseFile(join(repoRoot, repoRel))
    .children.filter((n): n is Heading => n.type === 'heading')
    .map((h) => ({ depth: h.depth, text: mdastToString(h).trim() }));
}

/**
 * Routes whose ids are all derived here. Each renders exactly one
 * `id={siteSlug(heading)}` per `##` section (TalksList, PrimerHub; tests pin
 * the headings to each parser's sections).
 */
const SECTION_ROUTES: ReadonlySet<string> = new Set(['Talks.md', 'Primers/CellAg.md', 'Primers/AI.md']);

/**
 * Keyed on repo root + file and checked against the file's mtime, so a
 * long-lived `astro dev` process picks up a renamed heading, and a build against
 * a fixture root never validates against the real repository's headings.
 */
const cache = new Map<string, { mtimeMs: number; map: AnchorMap }>();

function anchorsFor(repoRel: string, repoRoot: string): AnchorMap | undefined {
  if (!SECTION_ROUTES.has(repoRel)) return undefined;
  const { mtimeMs } = statSync(join(repoRoot, repoRel));
  const key = `${repoRoot}\0${repoRel}`;
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.map;
  const map = sectionAnchors(repoRel, headingsOf(repoRoot, repoRel));
  cache.set(key, { mtimeMs, map });
  return map;
}

/**
 * The base-relative on-site URL for a link to `repoRel` (+ optional anchor), or
 * undefined when `repoRel` has no dedicated route, no anchor map, or no site id
 * for a heading GitHub does anchor. Throws when the route has a map and the
 * anchor is not in it: GitHub cannot resolve that link, so it is broken at the
 * source.
 */
export function dedicatedLink(
  repoRel: string,
  anchor?: string,
  repoRoot: string = REPO_ROOT,
): string | undefined {
  const route = DEDICATED_ROUTES[repoRel];
  if (!route) return undefined;
  if (!anchor) return route;
  const map = anchorsFor(repoRel, repoRoot);
  if (!map) return undefined;
  const key = normalizeAnchor(anchor);
  if (!map.has(key)) {
    const known = [...map.keys()].map((k) => `#${k}`).join(', ');
    throw new Error(
      `dedicated-links: "${repoRel}#${anchor}" is not a GitHub anchor of ${repoRel} ` +
        `(its headings: ${known}). Fix the link, or the heading it points at.`,
    );
  }
  const id = map.get(key);
  return id ? `${route}#${id}` : undefined;
}
