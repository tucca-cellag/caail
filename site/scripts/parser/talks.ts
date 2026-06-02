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
import { visit } from 'unist-util-visit';
import type { Root, ListItem } from 'mdast';

import { parseFile, sectionsAfter } from './markdown.js';
import { itemFromListItem, sectionIntro } from './media.js';
import { TalksSchema, type TalkItem, type Talks } from './types.js';

/** Canonical Talks.md path: three levels up (parser → scripts → site → repo). */
const TALKS_PATH: string = fileURLToPath(new URL('../../../Talks.md', import.meta.url));

// Re-exported so existing importers (e.g. talks.test.ts) keep a stable surface.
export { youtubeVideoId } from './media.js';

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
