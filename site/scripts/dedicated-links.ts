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
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toString as mdastToString } from 'mdast-util-to-string';
import type { Heading, Html } from 'mdast';
import { visit } from 'unist-util-visit';
import GithubSlugger from 'github-slugger';

import { DEDICATED_ROUTES } from '../src/content/dedicated-routes.ts';
import { siteSlug } from '../src/lib/heading-slug.ts';
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
  /** A `##` directly under the document root: the only kind the site renders an id for. */
  topLevel?: boolean;
  /** The text GitHub slugs: inline HTML removed. */
  text: string;
  /** The text the site's section id is built from (the parsers keep inline HTML); defaults to `text`. */
  siteText?: string;
}

/**
 * Build a route's anchor map. Keys are GitHub's anchors, from github-slugger with
 * its per-file duplicate suffixes (`-1`, `-2`…). Values are the site id, which
 * only top-level `##` sections render (sectionsAfter walks the root's children
 * only); two sections rendering one id is an error, since the page would carry a
 * duplicate id and one of them could not be linked.
 */
export function sectionAnchors(repoRel: string, headings: readonly HeadingRef[]): AnchorMap {
  const map = new Map<string, string | null>();
  const slugger = new GithubSlugger();
  const seenSite = new Map<string, string>();
  for (const { depth, text, siteText = text, topLevel = true } of headings) {
    const key = slugger.slug(text);
    let id: string | null = null;
    if (depth === 2 && topLevel) {
      id = siteSlug(siteText);
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

/**
 * Every heading in a canonical file, in document order, including headings nested
 * in lists or blockquotes. GitHub slugs a heading's text with inline HTML removed;
 * the site parsers (sectionsAfter) keep it, so the two texts are carried apart.
 */
function headingsOf(tree: ReturnType<typeof parseFile>): HeadingRef[] {
  const out: HeadingRef[] = [];
  visit(tree, 'heading', (h: Heading, _index, parent) => {
    out.push({
      depth: h.depth,
      topLevel: parent === tree,
      // GitHub slugs the rendered text: no inline HTML, no image alt text, and
      // NOT trimmed, so "Demos <img>" keeps its space and becomes demos-.
      text: mdastToString(h, { includeHtml: false, includeImageAlt: false }),
      siteText: mdastToString(h).trim(),
    });
  });
  return out;
}

/**
 * Explicit link targets GitHub also resolves: an `id` or `name` attribute on an
 * `<a>` element. Only the attribute itself counts (not `data-id`), and only on
 * `<a>` (not `<input name>` or `<meta name>`).
 */
function htmlTargets(tree: ReturnType<typeof parseFile>): string[] {
  const out: string[] = [];
  visit(tree, 'html', (n: Html) => {
    for (const tag of n.value.matchAll(/<a\b[^>]*>/gi)) {
      for (const m of tag[0].matchAll(/\s(?:id|name)\s*=\s*["']([^"']+)["']/gi)) out.push(m[1].toLowerCase());
    }
  });
  return out;
}

/**
 * Routes whose ids are all derived here. Each renders exactly one
 * `id={siteSlug(heading)}` per `##` section (TalksList, PrimerHub; tests pin
 * the headings to each parser's sections, and every primer to this set).
 */
export const SECTION_ROUTES: ReadonlySet<string> = new Set(['Talks.md', 'Primers/CellAg.md', 'Primers/AI.md']);

/**
 * Keyed on repo root + file and checked against the file's mtime, so a
 * long-lived `astro dev` process picks up a renamed heading. The primer parser
 * passes its own repo root through; the prose rewriter (and the catalog and
 * awesome-lists parsers that use it) resolves against this repository.
 */
const cache = new Map<string, { mtimeMs: number; map: AnchorMap }>();

function anchorsFor(repoRel: string, repoRoot: string): AnchorMap | undefined {
  if (!SECTION_ROUTES.has(repoRel)) return undefined;
  const path = join(repoRoot, repoRel);
  const stat = statSync(path, { throwIfNoEntry: false });
  if (!stat) {
    // Under this repository a mapped file must exist: failing open here would
    // silently switch the broken-anchor check off if Talks.md or a primer moved.
    if (resolve(repoRoot) === resolve(REPO_ROOT)) {
      throw new Error(`dedicated-links: ${repoRel} is an anchor-mapped route but does not exist.`);
    }
    // A fixture root without the file has nothing to check against: blob fallback.
    return undefined;
  }
  const { mtimeMs } = stat;
  const key = `${repoRoot}\0${repoRel}`;
  const hit = cache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.map;
  const tree = parseFile(path);
  const map = new Map(sectionAnchors(repoRel, headingsOf(tree)));
  for (const t of htmlTargets(tree)) if (!map.has(t)) map.set(t, null);
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
