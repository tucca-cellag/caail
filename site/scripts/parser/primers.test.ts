/**
 * primers.test.ts — covers the Primers/*.md parser.
 *
 *   A. rewritePrimerUrl — internal/external classification + route mapping.
 *   B. buildPrimersModel — titles, ledes, embedded media, and rewritten links
 *      against the real canonical Primers/*.md files.
 *   C. itemFromListItem: the note separator is stripped from the rendered note.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { List } from 'mdast';
import { SITE_BASE } from '../../src/content/site-config.ts';

import { assertNoSubheadings, buildPrimersModel, rewritePrimerUrl } from './primers.js';
import { parseMarkdown } from './markdown.js';
import { itemFromListItem } from './media.js';

/** Repo root: parser → scripts → site → repo (three levels up). */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * The `* [` bullet lines under one `## heading` of a primer, read line by line
 * rather than through the mdast parser the model comes from, so the expected
 * counts follow the content instead of being typed into the test.
 */
function bulletsUnder(file: string, heading: string): string[] {
  const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n');
  const marker = `## ${heading}`;
  const hits = lines.filter((l) => l === marker).length;
  if (hits !== 1) throw new Error(`${file}: expected one "${marker}", found ${hits}`);
  const rest = lines.slice(lines.indexOf(marker) + 1);
  const end = rest.findIndex((l) => /^#{1,2} /.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.startsWith('* ['));
}

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

  /** A primer's section by heading, found the same way bulletsUnder finds its source. */
  const sectionOf = (slug: string, heading: string) => {
    const section = model.primers.find((p) => p.slug === slug)?.sections.find((s) => s.heading === heading);
    if (!section) throw new Error(`the ${slug} primer has no "${heading}" section`);
    return section;
  };

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
    const fundamentals = sectionOf('ai', 'Learn the fundamentals');
    const playlists = fundamentals.items.filter((i) => i.kind === 'playlist');
    const inSource = bulletsUnder('Primers/AI.md', 'Learn the fundamentals').filter((l) =>
      l.includes('youtube.com/playlist?'),
    );
    expect(inSource.length).toBeGreaterThan(0);
    expect(playlists.length).toBe(inSource.length);
    expect(playlists.every((p) => !p.internal)).toBe(true);
  });

  it('gives the cell-ag field reviews a section of their own, with its intro and every review', () => {
    const reviews = sectionOf('cell-ag', 'Field reviews and perspectives');
    const inSource = bulletsUnder('Primers/CellAg.md', 'Field reviews and perspectives');
    expect(reviews.intro).toMatch(/^Review and perspective articles/);
    expect(inSource.length).toBeGreaterThan(0);
    expect(reviews.items.length).toBe(inSource.length);
  });

  it('gives the AI primer books a section of their own, with its intro and every book', () => {
    const books = sectionOf('ai', 'Books');
    const inSource = bulletsUnder('Primers/AI.md', 'Books');
    expect(books.intro).toMatch(/^Illustrated guides and textbooks/);
    expect(inSource.length).toBeGreaterThan(0);
    expect(books.items.length).toBe(inSource.length);
    // The books no longer ride along in the fundamentals section.
    const fundamentals = sectionOf('ai', 'Learn the fundamentals');
    expect(fundamentals.items.some((i) => books.items.some((b) => b.title === i.title))).toBe(false);
  });

  it('refuses a heading below ## and names it, since the site renders only ## sections', () => {
    const primer = (body: string) => parseMarkdown(`# Primer\n\nLede.\n\n## Section\n\n${body}`);
    expect(() =>
      assertNoSubheadings(primer('### Subsection\n\n* [A](https://example.org/a)\n'), 'Primers/X.md'),
    ).toThrow(/Primers\/X\.md: "Subsection" is a level-3 heading/);
    expect(() => assertNoSubheadings(primer('* [A](https://example.org/a)\n'), 'Primers/X.md')).not.toThrow();
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

  it('strips one separator only, so a note starting with a minus sign keeps it', () => {
    expect(firstItem('* [A Title](https://example.org/a): -80 °C storage\n')?.note).toBe('-80 °C storage');
    expect(firstItem('* [A Title](https://example.org/a) — -80 °C storage\n')?.note).toBe('-80 °C storage');
  });

  it('takes a hyphen as a separator only with a space on each side', () => {
    expect(firstItem('* [A Title](https://example.org/a) - the note text\n')?.note).toBe('the note text');
    expect(firstItem('* [A Title](https://example.org/a) -80 °C storage\n')?.note).toBe('-80 °C storage');
    expect(firstItem('* [PyTorch](https://pytorch.org)-based tutorials\n')?.note).toBe('-based tutorials');
  });
});
