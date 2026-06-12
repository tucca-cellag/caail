/**
 * primers.test.ts — covers the Primers/*.md parser.
 *
 *   A. rewritePrimerUrl — internal/external classification + route mapping.
 *   B. buildPrimersModel — titles, ledes, embedded media, and rewritten links
 *      against the real canonical Primers/*.md files.
 */
import { describe, it, expect } from 'vitest';

import { buildPrimersModel, rewritePrimerUrl } from './primers.js';

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
      url: '/caail/papers/explorer/',
      internal: true,
    });
    expect(rewritePrimerUrl('../Software.md', 'Primers').url).toBe('/caail/software/');
    expect(rewritePrimerUrl('../Talks.md#applied-ai-ml-for-cellular-agriculture', 'Primers').url).toBe(
      '/caail/talks/#applied-ai-ml-for-cellular-agriculture',
    );
  });

  it('maps canonical-prose pages and keeps the section anchor', () => {
    expect(rewritePrimerUrl('../OtherResources.md#courses', 'Primers')).toEqual({
      url: '/caail/other-resources/#courses',
      internal: true,
    });
    expect(rewritePrimerUrl('../ResearchAreas/MediaOptimization.md', 'Primers').url).toBe(
      '/caail/research-areas/mediaoptimization/',
    );
  });

  it('maps a sibling primer', () => {
    expect(rewritePrimerUrl('./AI.md', 'Primers').url).toBe('/caail/primers/ai/');
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
    expect(playlists.length).toBe(6);
    expect(playlists.every((p) => !p.internal)).toBe(true);
  });

  it('rewrites internal cross-links to same-site routes', () => {
    const items = model.primers.flatMap((p) => p.sections.flatMap((s) => s.items));
    const internal = items.filter((i) => i.internal);
    expect(internal.length).toBeGreaterThan(0);
    expect(internal.every((i) => i.url.startsWith('/caail/'))).toBe(true);
    // Internal links are never videos/playlists (those are always external media).
    expect(internal.every((i) => i.kind === 'link')).toBe(true);
  });
});
