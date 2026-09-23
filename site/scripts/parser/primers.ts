/**
 * primers.ts — parses the canonical Primers/*.md onboarding hubs into the
 * structured primers.json model.
 *
 * Each primer is a curated, two-audience entry point: "Cellular Agriculture for
 * AI researchers" (Primers/CellAg.md) and "AI for cell-ag researchers"
 * (Primers/AI.md). They follow the same authoring shape as Talks.md — an H1
 * title, a lede paragraph, then `##` sections whose bullet lists hold one link
 * per item — so the media helpers in media.ts do the heavy lifting.
 *
 * What primers add on top of talks:
 *   - the H1 title and lede paragraph are lifted (talks has neither),
 *   - internal repo-relative `.md` links are rewritten to site routes so the
 *     hub's cross-links resolve on the rendered site (Talks/OtherResources only
 *     ever held external YouTube links, so talks.ts needed no rewriting).
 *
 * The parser READS the Primers/*.md files and never mutates them.
 */

import { fileURLToPath } from 'node:url';
import { join, posix } from 'node:path';
import { toString as mdastToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Root, ListItem, Heading } from 'mdast';

import { parseFile, sectionsAfter } from './markdown.js';
import { itemFromListItem, sectionIntro } from './media.js';
import { PrimersSchema, type PrimerItem, type Primers } from './types.js';
import { CAAIL_PAGES } from '../../src/content/caail-pages.ts';
import { dedicatedLink, GITHUB_BLOB_BASE } from '../dedicated-links.ts';
import { SITE_BASE } from '../../src/content/site-config.ts';

/** Repo root: parser → scripts → site → repo (three levels up). */
const REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

/** The primers to build, in sidebar/display order: { slug, repo-relative file }. */
const PRIMER_SOURCES: ReadonlyArray<{ slug: string; file: string }> = [
  { slug: 'cell-ag', file: 'Primers/CellAg.md' },
  { slug: 'ai', file: 'Primers/AI.md' },
];

/**
 * Rewrite a primer item's URL for the rendered site.
 *
 * - External (`scheme:`, `//`) links are left untouched (external → opens in a
 *   new tab; YouTube links stay so they embed). An intra-page `#…` link is
 *   written in GitHub's form like every other anchor, so given the primer's own
 *   `sourceFile` it is translated to the id PrimerHub renders.
 * - A repo-relative `.md` link is resolved against the primer's directory and
 *   mapped to a same-site route: a dedicated route (Papers explorer, Software,
 *   Databases, Talks, sibling primer) or a canonical-prose page id. Unlike the
 *   shared `rewriteCaailLinks`, primers KEEP a canonical-prose page's section
 *   `#anchor` so a link can deep-link into e.g. Other Resources → Courses. A
 *   dedicated route keeps an anchor only when `dedicatedLink` can show it exists.
 * - Anything else (uncatalogued `.md`, or an anchor a dedicated route can't
 *   resolve) falls back to a GitHub blob URL.
 *
 * @returns `{ url, internal }` — `internal` is true for same-site routes, which
 *   the component renders as same-tab nav cards rather than new-tab links.
 */
export function rewritePrimerUrl(
  url: string,
  srcDir: string,
  opts: { sourceFile?: string; repoRoot?: string } = {},
): { url: string; internal: boolean } {
  const { sourceFile, repoRoot = REPO_ROOT } = opts;
  if (/^[a-z]+:/i.test(url) || url.startsWith('//')) return { url, internal: false };
  if (url.startsWith('#')) {
    const onPage = sourceFile ? dedicatedLink(sourceFile, url.slice(1), repoRoot) : undefined;
    return { url: onPage ? onPage.slice(onPage.indexOf('#')) : url, internal: true };
  }

  const [rawPath, anchor] = url.split('#');
  const path = rawPath.endsWith('/') ? `${rawPath}README.md` : rawPath;
  if (!/\.md$/i.test(path)) return { url, internal: false };

  const repoRel = posix.normalize(posix.join(srcDir, path)).replace(/^\.\//, '');
  const anchorSuffix = anchor ? `#${anchor}` : '';

  // A card/island route keeps an anchor only when it is known to exist there;
  // otherwise this falls through to the GitHub blob below (dedicated-links.ts).
  const special = dedicatedLink(repoRel, anchor, repoRoot);
  if (special) {
    return { url: `${SITE_BASE}${special}`, internal: true };
  }

  const id = CAAIL_PAGES.idForSourcePath(repoRel);
  if (CAAIL_PAGES.byId(id)) {
    return { url: `${SITE_BASE}/${id}/${anchorSuffix}`, internal: true };
  }

  return { url: `${GITHUB_BLOB_BASE}/${repoRel}${anchorSuffix}`, internal: false };
}

/** Lift the H1 title and the first lede paragraph that precedes the first `##`. */
function titleAndLead(root: Root): { title: string; lead: string } {
  let title = '';
  let lead = '';
  let seenH1 = false;
  for (const node of root.children) {
    if (node.type === 'heading') {
      const h = node as Heading;
      if (h.depth === 1 && !title) {
        title = mdastToString(h).trim();
        seenH1 = true;
        continue;
      }
      if (h.depth <= 2) break; // reached the first `##` section
      continue;
    }
    if (seenH1 && !lead && node.type === 'paragraph') {
      lead = mdastToString(node).trim();
    }
  }
  return { title, lead };
}

/**
 * Build the primers.json model from the Primers/*.md files: one entry per
 * primer, each with its H1 title, lede, and `##` sections of typed items.
 */
export function buildPrimersModel(repoRoot: string = REPO_ROOT): Primers {
  const primers = PRIMER_SOURCES.map(({ slug, file }) => {
    const root: Root = parseFile(join(repoRoot, file));
    const { title, lead } = titleAndLead(root);
    const srcDir = posix.dirname(file);

    const sections = sectionsAfter(root, 2).map((section) => {
      const items: PrimerItem[] = [];
      for (const node of section.nodes) {
        if (node.type !== 'list') continue;
        visit(node, 'listItem', (li: ListItem) => {
          const base = itemFromListItem(li);
          if (!base) return;
          const { url, internal } = rewritePrimerUrl(base.url, srcDir, { sourceFile: file, repoRoot });
          items.push({ ...base, url, internal });
        });
      }
      return { heading: section.heading.trim(), intro: sectionIntro(section.nodes), items };
    });

    return { slug, title, lead, sections };
  });

  return PrimersSchema.parse({ primers });
}
