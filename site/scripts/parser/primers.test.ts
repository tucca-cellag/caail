/**
 * primers.test.ts — covers the Primers/*.md parser.
 *
 *   A. rewritePrimerUrl — internal/external classification + route mapping.
 *   B. buildPrimersModel — titles, ledes, embedded media, and rewritten links
 *      against the real canonical Primers/*.md files.
 *   C. itemFromListItem — the note separator is stripped from the rendered note.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Heading, List } from 'mdast';
import { visit } from 'unist-util-visit';
import { SITE_BASE } from '../../src/content/site-config.ts';

import { buildPrimersModel, rewritePrimerUrl, PRIMER_SOURCES } from './primers.js';
import { parseFile, parseMarkdown } from './markdown.js';
import { itemFromListItem } from './media.js';

/** Repo root: parser → scripts → site → repo (three levels up). */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// ---------------------------------------------------------------------------
// A. rewritePrimerUrl
// ---------------------------------------------------------------------------

describe('rewritePrimerUrl', () => {
  it('leaves external + YouTube URLs untouched (not internal)', () => {
    expect(rewritePrimerUrl('https://www.youtube.com/watch?v=abc', 'Primers')).toEqual({
      url: 'https://www.youtube.com/watch?v=abc',
      internal: false,
    });
    expect(rewritePrimerUrl('https://meatbook.org/', 'Primers').internal).toBe(false);
  });

  it('maps dedicated repo-root files to site routes (internal)', () => {
    expect(rewritePrimerUrl('../Papers.md', 'Primers')).toEqual({
      url: `${SITE_BASE}/papers/explorer/`,
      internal: true,
    });
    expect(rewritePrimerUrl('../Software.md', 'Primers').url).toBe(`${SITE_BASE}/software/`);
    expect(rewritePrimerUrl('../AwesomeLists.md', 'Primers').url).toBe(`${SITE_BASE}/awesome-lists/`);
    expect(rewritePrimerUrl('../FieldReports.md', 'Primers').url).toBe(`${SITE_BASE}/field-reports/`);
    // an anchor a card page can't be shown to render → GitHub blob, not a dead on-site anchor
    expect(rewritePrimerUrl('../Papers.md#50', 'Primers')).toEqual({
      url: 'https://github.com/tucca-cellag/caail/blob/main/Papers.md#50',
      internal: false,
    });
    expect(rewritePrimerUrl('../Talks.md#applied-aiml-for-cellular-agriculture', 'Primers').url).toBe(
      `${SITE_BASE}/talks/#applied-ai-ml-for-cellular-agriculture`,
    );
  });

  it('maps canonical-prose pages and keeps the section anchor', () => {
    expect(rewritePrimerUrl('../OtherResources.md#cell-ag-ecosystem-initiatives', 'Primers')).toEqual({
      url: `${SITE_BASE}/other-resources/#cell-ag-ecosystem-initiatives`,
      internal: true,
    });
    expect(rewritePrimerUrl('../ReferenceWorks.md', 'Primers').url).toBe(`${SITE_BASE}/reference-works/`);
    expect(rewritePrimerUrl('../ResearchAreas/MediaOptimization.md', 'Primers').url).toBe(
      `${SITE_BASE}/research-areas/mediaoptimization/`,
    );
  });

  it('maps a sibling primer', () => {
    expect(rewritePrimerUrl('./AI.md', 'Primers').url).toBe(`${SITE_BASE}/primers/ai/`);
  });

  it('falls back to a GitHub blob for uncatalogued .md (not internal)', () => {
    const r = rewritePrimerUrl('../SomethingUncatalogued.md', 'Primers');
    expect(r.internal).toBe(false);
    expect(r.url).toMatch(/github\.com\/tucca-cellag\/caail\/blob\/main\/SomethingUncatalogued\.md/);
  });
});

// ---------------------------------------------------------------------------
// B. buildPrimersModel
// ---------------------------------------------------------------------------

describe('buildPrimersModel', () => {
  const model = buildPrimersModel();

  it('builds both primers, in order', () => {
    expect(model.primers.map((p) => p.slug)).toEqual(['cell-ag', 'ai']);
  });

  it('lifts the H1 title and a lede for each primer', () => {
    expect(model.primers[0].title).toBe('Cellular Agriculture for AI Researchers');
    expect(model.primers[1].title).toBe('AI for Cell-Ag Researchers');
    expect(model.primers.every((p) => p.lead.length > 0)).toBe(true);
  });

  it('embeds the five cell-ag field-foundation videos', () => {
    const foundations = model.primers[0].sections[0];
    const videos = foundations.items.filter((i) => i.kind === 'video');
    expect(videos.length).toBe(5);
    expect(videos.every((v) => v.videoId && !v.internal)).toBe(true);
  });

  it('carries the AI primer fundamentals as external playlists', () => {
    const fundamentals = model.primers[1].sections[0];
    const playlists = fundamentals.items.filter((i) => i.kind === 'playlist');
    expect(playlists.length).toBe(10);
    expect(playlists.every((p) => !p.internal)).toBe(true);
  });

  it('gives the cell-ag field reviews a section of their own, with its intro and all five reviews', () => {
    const reviews = model.primers[0].sections.find((s) => s.heading === 'Field reviews and perspectives');
    expect(reviews?.intro).toMatch(/^Review and perspective articles/);
    expect(reviews?.items.length).toBe(5);
  });

  it('gives the AI primer books a section of their own, with its intro and all five books', () => {
    const books = model.primers[1].sections.find((s) => s.heading === 'Books');
    expect(books?.intro).toMatch(/^Illustrated guides and textbooks/);
    expect(books?.items.length).toBe(5);
    // The books no longer ride along in the fundamentals section.
    const fundamentals = model.primers[1].sections[0];
    expect(fundamentals.items.some((i) => books?.items.some((b) => b.title === i.title))).toBe(false);
  });

  it('uses no heading below ## in any primer, since the site renders only ## sections', () => {
    // sectionsAfter(root, 2) folds a ### block into its parent section, so its
    // heading and intro never reach the page. Fail on the shape, not on a name.
    const deep: string[] = [];
    for (const { file } of PRIMER_SOURCES) {
      visit(parseFile(join(REPO_ROOT, file)), 'heading', (h: Heading) => {
        if (h.depth > 2) deep.push(`${file}: ${'#'.repeat(h.depth)}`);
      });
    }
    expect(deep).toEqual([]);
  });

  it('rewrites internal cross-links to same-site routes', () => {
    const items = model.primers.flatMap((p) => p.sections.flatMap((s) => s.items));
    const internal = items.filter((i) => i.internal);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((i) => i.url.startsWith(`${SITE_BASE}/`))).toBe(true);
    // Internal links are never videos/playlists (those are always external media).
    expect(internal.every((i) => i.kind === 'link')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. itemFromListItem: note separators
// ---------------------------------------------------------------------------

describe('itemFromListItem note separator', () => {
  /** The first item of the first list in a Markdown snippet. */
  const firstItem = (md: string) => {
    const list = parseMarkdown(md).children.find((n): n is List => n.type === 'list');
    if (!list) throw new Error('fixture has no list');
    return itemFromListItem(list.children[0]);
  };

  it('drops the ": " separator the primers use, leaving no leading colon', () => {
    expect(firstItem('* [A Title](https://example.org/a): the note text\n')).toMatchObject({
      title: 'A Title',
      url: 'https://example.org/a',
      note: 'the note text',
    });
  });

  it('still drops the " — " separator Talks.md uses', () => {
    expect(firstItem('* [A Title](https://example.org/a) — the note text\n')?.note).toBe('the note text');
  });

  it('keeps a colon that follows a parenthetical rather than the title', () => {
    expect(firstItem('* [A Title](https://example.org/a) (Venue, 2026): the note text\n')?.note).toBe(
      '(Venue, 2026): the note text',
    );
  });

  it('keeps a colon inside the link title', () => {
    expect(firstItem('* [Course: Part One](https://example.org/a): the note text\n')).toMatchObject({
      title: 'Course: Part One',
      note: 'the note text',
    });
  });

  it('gives an empty note to an item with no text after the link', () => {
    expect(firstItem('* [A Title](https://example.org/a)\n')?.note).toBe('');
  });
});
