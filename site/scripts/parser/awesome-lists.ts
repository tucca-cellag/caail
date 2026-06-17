/**
 * awesome-lists.ts — parses AwesomeLists.md into awesome-lists.json and folds in
 * GitHub repo metrics from a committed cache.
 *
 * AwesomeLists.md follows the media/Talks authoring shape: an H1 title, a lede
 * paragraph, then `##` groups whose bullet lists hold one curated "awesome list"
 * per item (`* [owner/repo](github-url) — description`). The description may
 * itself contain repo-relative `.md` links (e.g. to Papers.md / Software.md),
 * which are rewritten to site routes exactly as the catalog summaries are.
 *
 * Live metrics (stars / last-push / archived) come from awesome-cache.json,
 * refreshed by hand via `pnpm fetch:awesome-lists` (the ONLY networked script).
 * This module reads that cache OFFLINE and folds it in, so `pnpm parse` /
 * `pnpm build` stay deterministic and network-free — mirroring citations.ts.
 * With no cache (or a repo missing from it) the metrics fields are simply null
 * and the card renders without them.
 *
 * The parser READS AwesomeLists.md and never mutates it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { toString as mdastToString } from 'mdast-util-to-string';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { visit } from 'unist-util-visit';
import type { Root, Heading, ListItem, Link, Paragraph, PhrasingContent } from 'mdast';

import { parseFile, sectionsAfter } from './markdown.js';
import { rewriteCaailLinks } from '../remark/rewrite-caail-links.js';
import {
  AwesomeListsSchema,
  type AwesomeLists,
  type AwesomeListItem,
} from './types.js';

// ---------------------------------------------------------------------------
// Canonical paths (three levels up: parser → scripts → site → repo root)
// ---------------------------------------------------------------------------

const AWESOME_PATH: string = fileURLToPath(
  new URL('../../../AwesomeLists.md', import.meta.url),
);

/** Absolute path to the committed GitHub-metrics cache (parser input). */
export const AWESOME_CACHE_PATH: string = fileURLToPath(
  new URL('./awesome-cache.json', import.meta.url),
);

/** Site base path, mirroring `BASE` in astro.config.mjs (for link rewriting). */
const AWESOME_BASE = '/caail';

// ---------------------------------------------------------------------------
// Metrics cache schema (input — committed awesome-cache.json)
// ---------------------------------------------------------------------------

export const AwesomeCacheRepoSchema = z.object({
  /** GitHub stargazer count */
  stars: z.number().int().nonnegative(),
  /** ISO timestamp of the repo's last push (`pushed_at`) */
  pushedAt: z.string(),
  /** whether GitHub marks the repo archived */
  archived: z.boolean(),
});

export const AwesomeCacheSchema = z.object({
  /** ISO timestamp of the fetch run that produced this cache */
  generatedAt: z.string(),
  /** keyed by lowercase `owner/repo` (see repoFromUrl) */
  repos: z.record(z.string(), AwesomeCacheRepoSchema),
});

export type AwesomeCacheRepo = z.infer<typeof AwesomeCacheRepoSchema>;
export type AwesomeCache = z.infer<typeof AwesomeCacheSchema>;

/**
 * Read + validate the metrics cache if present, else null so the page is built
 * with no metrics. Keeps the parse step network-free.
 */
export function loadAwesomeCache(
  path: string = AWESOME_CACHE_PATH,
): AwesomeCache | null {
  if (!existsSync(path)) return null;
  return AwesomeCacheSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

// ---------------------------------------------------------------------------
// URL → owner/repo key
// ---------------------------------------------------------------------------

const GITHUB_REPO_RE = /github\.com\/([^/]+)\/([^/#?]+)/i;

/**
 * Parse a GitHub repo URL into a lowercase `owner/repo` key (the metrics-cache
 * key), or null when the URL isn't a GitHub repo. A trailing `.git` is stripped.
 */
export function repoFromUrl(url: string): string | null {
  const m = GITHUB_REPO_RE.exec(url);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  return `${owner}/${repo}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// Per-item parse
// ---------------------------------------------------------------------------

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
      if (h.depth <= 2) break;
      continue;
    }
    if (seenH1 && !lead && node.type === 'paragraph') {
      lead = mdastToString(node).trim();
    }
  }
  return { title, lead };
}

/** Strip a leading em-dash / en-dash / hyphen run (and surrounding space). */
function stripLeadingDash(nodes: PhrasingContent[]): void {
  const first = nodes[0];
  if (first && first.type === 'text') {
    first.value = first.value.replace(/^[\s—–-]+/, '');
  }
}

/**
 * Build one awesome-list item from a bullet whose first link is the repo. The
 * inline nodes AFTER that link become the description (rendered to HTML with
 * internal `.md` links rewritten, plus a flattened plain-text form for search).
 * Metrics are folded in from the cache when the repo is present.
 */
function itemFromListItem(
  li: ListItem,
  cache: AwesomeCache | null,
): AwesomeListItem | null {
  const para = li.children.find((n): n is Paragraph => n.type === 'paragraph');
  if (!para) return null;

  const linkIdx = para.children.findIndex((c) => c.type === 'link');
  if (linkIdx === -1) return null;
  const link = para.children[linkIdx] as Link;

  const name = mdastToString(link).trim();
  const url = link.url;
  const repo = repoFromUrl(url);

  // Description = inline nodes after the link, with the leading " — " removed.
  const rest = para.children.slice(linkIdx + 1) as PhrasingContent[];
  stripLeadingDash(rest);
  const descPara: Paragraph = { type: 'paragraph', children: rest };
  const summary = mdastToString(descPara).trim();

  const descRoot: Root = { type: 'root', children: [descPara] };
  rewriteCaailLinks({ base: AWESOME_BASE, sourcePath: 'AwesomeLists.md' })(descRoot);
  // mdast → hast → html; raw HTML escaped (none here). Unwrap the <p> wrapper so
  // the description is inline text + links, not a block paragraph.
  const summaryHtml = toHtml(toHast(descRoot))
    .replace(/^<p>/, '')
    .replace(/<\/p>\s*$/, '');

  const metrics = repo && cache ? cache.repos[repo] : undefined;

  return {
    name,
    url,
    repo,
    summary,
    summaryHtml,
    stars: metrics?.stars ?? null,
    pushedAt: metrics?.pushedAt ?? null,
    archived: metrics?.archived ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Build the awesome-lists.json model from AwesomeLists.md and an optional
 * GitHub-metrics cache. Groups follow the `##` headings (in document order);
 * each group's bullet list becomes its items.
 */
export function buildAwesomeListsModel(
  path: string = AWESOME_PATH,
  cache: AwesomeCache | null = loadAwesomeCache(),
): AwesomeLists {
  const root: Root = parseFile(path);
  const { title, lead } = titleAndLead(root);

  const groups = sectionsAfter(root, 2).map((section) => {
    const items: AwesomeListItem[] = [];
    for (const node of section.nodes) {
      if (node.type !== 'list') continue;
      visit(node, 'listItem', (li: ListItem) => {
        const item = itemFromListItem(li, cache);
        if (item) items.push(item);
      });
    }
    return { label: section.heading.trim(), items };
  });

  return AwesomeListsSchema.parse({
    title,
    lead,
    groups,
    generatedAt: cache?.generatedAt ?? null,
  });
}
