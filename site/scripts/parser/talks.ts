/**
 * talks.ts — extracts curated YouTube videos from OtherResources.md.
 *
 * The single source of truth for "what counts as a talk" lives here:
 * list-item links under the first `## YouTube Videos` section. counts.ts
 * imports `extractYouTubeVideos` so its `talks` count and talks.json can
 * never drift apart.
 *
 * The parser READS OtherResources.md and never mutates it.
 */

import { fileURLToPath } from 'node:url';
import { toString as mdastToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Root, ListItem, Link } from 'mdast';

import { parseFile, sectionsAfter } from './markdown.js';
import { TalksSchema, type Talk, type Talks } from './types.js';

/** Canonical OtherResources.md path: three levels up (parser → scripts → site → repo). */
const OTHER_RESOURCES_PATH: string = fileURLToPath(
  new URL('../../../OtherResources.md', import.meta.url),
);

/** Capture the 11-char video id from a `watch?v=…` or `youtu.be/…` URL. */
const YOUTUBE_ID_RE = /(?:[?&]v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/;

/** Extract the YouTube video id from a URL, or null if none is present. */
export function youtubeVideoId(url: string): string | null {
  return YOUTUBE_ID_RE.exec(url)?.[1] ?? null;
}

/**
 * Return the list-item links under the first `## YouTube Videos` section, in
 * document order. One entry per list item that contains at least one link; the
 * FIRST link in the item supplies both `title` (its text) and `url`.
 *
 * This is the exact set counts.ts counts — `extractYouTubeVideos(root).length`
 * equals the legacy `talks` count by construction.
 */
export function extractYouTubeVideos(root: Root): Array<{ title: string; url: string }> {
  const section = sectionsAfter(root, 2).find(
    (s) => s.heading.trim() === 'YouTube Videos',
  );
  if (!section) return [];

  const out: Array<{ title: string; url: string }> = [];
  for (const node of section.nodes) {
    if (node.type !== 'list') continue;
    visit(node, 'listItem', (item: ListItem) => {
      let firstLink: Link | null = null;
      visit(item, 'link', (link: Link) => {
        if (firstLink === null) firstLink = link;
      });
      if (firstLink !== null) {
        const link: Link = firstLink;
        out.push({ title: mdastToString(link).trim(), url: link.url });
      }
    });
  }
  return out;
}

/**
 * Build the talks.json model from OtherResources.md.
 *
 * Throws if a curated video URL has no recognizable YouTube id (a fail-loud
 * guard — lite-youtube-embed needs the id, so an unparseable URL is a content
 * bug to surface at build time, not a silent empty embed).
 *
 * @param otherResourcesPath  Path to OtherResources.md (defaults to canonical).
 */
export function buildTalksModel(
  otherResourcesPath: string = OTHER_RESOURCES_PATH,
): Talks {
  const root = parseFile(otherResourcesPath);
  const talks: Talk[] = extractYouTubeVideos(root).map(({ title, url }) => {
    const videoId = youtubeVideoId(url);
    if (videoId === null) {
      throw new Error(`talks: URL has no YouTube video id: ${url}`);
    }
    return { title, url, videoId };
  });

  return TalksSchema.parse({ talks });
}
