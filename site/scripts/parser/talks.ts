/**
 * talks.ts — parses Talks.md into the structured talks.json model.
 *
 * Talks.md holds curated lectures, talks, and educational video playlists under
 * `##` section headings. Each section becomes a `{ heading, intro, items }`
 * group; each list item becomes a typed item (video / playlist / link). The
 * site renders these as grouped inline embeds; counts.ts reads the same model
 * so the homepage `talks` stat and talks.json can never drift.
 *
 * The parser READS Talks.md and never mutates it.
 */

import { fileURLToPath } from 'node:url';
import { toString as mdastToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Root, ListItem, Link, Paragraph, RootContent } from 'mdast';

import { parseFile, sectionsAfter } from './markdown.js';
import { TalksSchema, type TalkItem, type Talks } from './types.js';

/** Canonical Talks.md path: three levels up (parser → scripts → site → repo). */
const TALKS_PATH: string = fileURLToPath(new URL('../../../Talks.md', import.meta.url));

/** Capture the 11-char video id from a `watch?v=…`, `youtu.be/…`, or `/embed/…` URL. */
const YOUTUBE_ID_RE = /(?:[?&]v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/;
const YOUTUBE_PLAYLIST_RE = /youtube\.com\/playlist\?/i;

/** Extract the YouTube video id from a URL, or null if none is present. */
export function youtubeVideoId(url: string): string | null {
  return YOUTUBE_ID_RE.exec(url)?.[1] ?? null;
}

/** Classify a URL into a talk-item kind, with the video id when applicable. */
function classify(url: string): { kind: TalkItem['kind']; videoId: string | null } {
  const videoId = youtubeVideoId(url);
  if (videoId) return { kind: 'video', videoId };
  if (YOUTUBE_PLAYLIST_RE.test(url)) return { kind: 'playlist', videoId: null };
  return { kind: 'link', videoId: null };
}

/** First paragraph text in a section's body, or '' if none precedes the list. */
function sectionIntro(nodes: RootContent[]): string {
  for (const node of nodes) {
    if (node.type === 'list') break;
    if (node.type === 'paragraph') return mdastToString(node as Paragraph).trim();
  }
  return '';
}

/** Build one typed item from a list item whose first link supplies title + url. */
function itemFromListItem(item: ListItem): TalkItem | null {
  let firstLink: Link | null = null;
  visit(item, 'link', (link: Link) => {
    if (firstLink === null) firstLink = link;
  });
  if (firstLink === null) return null;
  const link: Link = firstLink;

  const title = mdastToString(link).trim();
  const full = mdastToString(item).trim();
  // `note` = the item text after the link title (venue/year/blurb).
  const note = full.startsWith(title) ? full.slice(title.length).replace(/^[\s—–-]+/, '').trim() : '';

  return { title, url: link.url, note, ...classify(link.url) };
}

/**
 * Build the talks.json model from Talks.md: one group per `##` section, in
 * document order, each with its intro paragraph and typed items.
 */
export function buildTalksModel(talksPath: string = TALKS_PATH): Talks {
  const root: Root = parseFile(talksPath);
  const sections = sectionsAfter(root, 2).map((section) => {
    const items: TalkItem[] = [];
    for (const node of section.nodes) {
      if (node.type !== 'list') continue;
      visit(node, 'listItem', (li: ListItem) => {
        const it = itemFromListItem(li);
        if (it) items.push(it);
      });
    }
    return { heading: section.heading.trim(), intro: sectionIntro(section.nodes), items };
  });

  return TalksSchema.parse({ sections });
}

/** Total talk/video items across all sections — the homepage `talks` count. */
export function talkItemCount(model: Talks): number {
  return model.sections.reduce((n, s) => n + s.items.length, 0);
}
