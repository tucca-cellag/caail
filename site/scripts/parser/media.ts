/**
 * media.ts — shared primitives for parsing curated link lists out of Markdown.
 *
 * Both Talks.md (talks.ts) and the Primers/*.md files (primers.ts) follow the
 * same authoring shape: `##` sections whose bullet lists hold one link per item,
 * optionally trailed by a `— note`. This module owns the bits common to both:
 * YouTube id extraction, item-kind classification, section-intro lifting, and
 * turning a list item into a typed `{ title, url, note, kind, videoId }`.
 *
 * These are pure functions over mdast nodes (no I/O). Parser modules add their
 * own concerns on top (talks: nothing extra; primers: internal-link rewriting).
 */

import { toString as mdastToString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { ListItem, Link, Paragraph, RootContent } from 'mdast';

import type { TalkItem } from './types.js';

/** Capture the 11-char video id from a `watch?v=…`, `youtu.be/…`, or `/embed/…` URL. */
const YOUTUBE_ID_RE = /(?:[?&]v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/;
const YOUTUBE_PLAYLIST_RE = /youtube\.com\/playlist\?/i;

/** Extract the YouTube video id from a URL, or null if none is present. */
export function youtubeVideoId(url: string): string | null {
  return YOUTUBE_ID_RE.exec(url)?.[1] ?? null;
}

/** Classify a URL into a media-item kind, with the video id when applicable. */
export function classify(url: string): { kind: TalkItem['kind']; videoId: string | null } {
  const videoId = youtubeVideoId(url);
  if (videoId) return { kind: 'video', videoId };
  if (YOUTUBE_PLAYLIST_RE.test(url)) return { kind: 'playlist', videoId: null };
  return { kind: 'link', videoId: null };
}

/** First paragraph text in a section's body, or '' if none precedes the list. */
export function sectionIntro(nodes: RootContent[]): string {
  for (const node of nodes) {
    if (node.type === 'list') break;
    if (node.type === 'paragraph') return mdastToString(node as Paragraph).trim();
  }
  return '';
}

/** Build one typed item from a list item whose first link supplies title + url. */
export function itemFromListItem(item: ListItem): TalkItem | null {
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
