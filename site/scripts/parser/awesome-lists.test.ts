/**
 * awesome-lists.test.ts — covers the AwesomeLists.md parser.
 *
 *   A. repoFromUrl — owner/repo extraction from GitHub URLs.
 *   B. buildAwesomeListsModel — title/lede/groups, repo keys, description link
 *      rewriting, and the offline metrics fold-in (with and without a cache),
 *      against the real canonical AwesomeLists.md.
 */
import { describe, it, expect } from 'vitest';

import {
  buildAwesomeListsModel,
  repoFromUrl,
  type AwesomeCache,
} from './awesome-lists.js';

// ---------------------------------------------------------------------------
// A. repoFromUrl
// ---------------------------------------------------------------------------

describe('repoFromUrl', () => {
  it('extracts a lowercase owner/repo from a GitHub URL', () => {
    expect(repoFromUrl('https://github.com/seandavi/awesome-single-cell')).toBe(
      'seandavi/awesome-single-cell',
    );
    // mixed case → lowercased; trailing path/.git stripped
    expect(repoFromUrl('https://github.com/OmicsML/Awesome-Foo')).toBe('omicsml/awesome-foo');
    expect(repoFromUrl('https://github.com/a/b.git')).toBe('a/b');
  });

  it('returns null for non-GitHub URLs', () => {
    expect(repoFromUrl('https://example.com/x/y')).toBeNull();
    expect(repoFromUrl('https://gitlab.com/a/b')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. buildAwesomeListsModel (real corpus)
// ---------------------------------------------------------------------------

describe('buildAwesomeListsModel', () => {
  const model = buildAwesomeListsModel(undefined, null);

  it('lifts the H1 title and a lede', () => {
    expect(model.title).toBe('Curated Bibliographies & Awesome Lists');
    expect(model.lead.length).toBeGreaterThan(0);
  });

  it('parses every H2 group as a non-empty group of items', () => {
    expect(model.groups.length).toBeGreaterThanOrEqual(5);
    expect(model.groups.every((g) => g.label.length > 0 && g.items.length > 0)).toBe(true);
  });

  it('derives an owner/repo key for each GitHub item', () => {
    const items = model.groups.flatMap((g) => g.items);
    expect(items.length).toBeGreaterThanOrEqual(20);
    expect(items.every((i) => i.repo && i.repo === i.repo.toLowerCase())).toBe(true);
  });

  it('rewrites repo-relative .md links in descriptions (no raw .md, no GitHub-blob leak to a route)', () => {
    const html = model.groups.flatMap((g) => g.items).map((i) => i.summaryHtml).join('\n');
    // the OmicsML item references Papers.md, which is rewritten to a GitHub blob URL
    expect(html).toContain('github.com/tucca-cellag/caail/blob/main/Papers.md');
    // no un-rewritten repo-relative link survives
    expect(/href="\.\.?\//.test(html)).toBe(false);
  });

  it('leaves metrics null when no cache is supplied', () => {
    const items = model.groups.flatMap((g) => g.items);
    expect(items.every((i) => i.stars === null && i.pushedAt === null && i.archived === null)).toBe(true);
    expect(model.generatedAt).toBeNull();
  });

  it('folds GitHub metrics in from a cache, keyed by owner/repo', () => {
    const cache: AwesomeCache = {
      generatedAt: '2026-06-16T00:00:00.000Z',
      repos: {
        'seandavi/awesome-single-cell': { stars: 4321, pushedAt: '2026-05-01T00:00:00Z', archived: false },
      },
    };
    const withMetrics = buildAwesomeListsModel(undefined, cache);
    const items = withMetrics.groups.flatMap((g) => g.items);
    const hit = items.find((i) => i.repo === 'seandavi/awesome-single-cell');
    expect(hit?.stars).toBe(4321);
    expect(hit?.pushedAt).toBe('2026-05-01T00:00:00Z');
    expect(hit?.archived).toBe(false);
    expect(withMetrics.generatedAt).toBe('2026-06-16T00:00:00.000Z');
    // a repo absent from the cache stays null
    const miss = items.find((i) => i.repo !== 'seandavi/awesome-single-cell');
    expect(miss?.stars).toBeNull();
  });
});
