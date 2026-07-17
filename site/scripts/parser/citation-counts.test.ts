/**
 * citation-counts.test.ts — the parse-time fold of OpenAlex cited_by_count onto content
 * cards (papers / catalog / dataset entries), joined by DOI. Mirrors the license fold.
 */

import { describe, it, expect } from 'vitest';

import { citationInfo, loadCitedByCounts, NO_CITATION, parseRelatedDois } from './citation-counts.js';

describe('citationInfo', () => {
  it('joins a DOI to its count (host/prefix/case-insensitive key)', () => {
    const counts = new Map([['10.1/x', 7]]);
    expect(citationInfo('https://doi.org/10.1/X', 'manual', counts)).toEqual({
      doi: 'https://doi.org/10.1/X',
      doiSource: 'manual',
      citationCount: 7,
      citationSources: 1,
    });
  });
  it('is the null info when there is no DOI', () => {
    expect(citationInfo(null, null, new Map())).toEqual(NO_CITATION);
  });
  it('count is null when the DOI is absent from the map', () => {
    const info = citationInfo('10.9/z', 'manual', new Map());
    expect(info.citationCount).toBeNull();
    expect(info.citationSources).toBe(0);
  });

  // #102 aggregation
  it('sums the count over the primary DOI + its related version DOIs', () => {
    const counts = new Map([['10.1/x', 7], ['10.1/y', 3], ['10.1/z', 5]]);
    const info = citationInfo('10.1/x', 'manual', counts, ['10.1/Y', 'https://doi.org/10.1/z']);
    expect(info.citationCount).toBe(15);
    expect(info.citationSources).toBe(3);
    expect(info.doi).toBe('10.1/x'); // primary preserved for the badge link
  });
  it('counts only the DOIs actually present in the map', () => {
    const counts = new Map([['10.1/x', 7]]); // related absent
    const info = citationInfo('10.1/x', 'manual', counts, ['10.1/missing']);
    expect(info.citationCount).toBe(7);
    expect(info.citationSources).toBe(1);
  });
  it('dedups a related DOI that repeats the primary (no double-count)', () => {
    const counts = new Map([['10.1/x', 7]]);
    const info = citationInfo('10.1/x', 'manual', counts, ['10.1/X']);
    expect(info.citationCount).toBe(7);
    expect(info.citationSources).toBe(1);
  });
  it('aggregates related DOIs even when the primary DOI is null', () => {
    const counts = new Map([['10.1/y', 3], ['10.1/z', 5]]);
    const info = citationInfo(null, null, counts, ['10.1/y', '10.1/z']);
    expect(info.citationCount).toBe(8);
    expect(info.citationSources).toBe(2);
    expect(info.doi).toBeNull();
  });
});

describe('parseRelatedDois', () => {
  it('parses a JSON-array string into a DOI list', () => {
    expect(parseRelatedDois('["10.1/a","10.1/b"]')).toEqual(['10.1/a', '10.1/b']);
  });
  it('returns [] for null, empty, or malformed input', () => {
    expect(parseRelatedDois(null)).toEqual([]);
    expect(parseRelatedDois('')).toEqual([]);
    expect(parseRelatedDois('not json')).toEqual([]);
    expect(parseRelatedDois('{"a":1}')).toEqual([]); // not an array
  });
});

describe('loadCitedByCounts (real cache)', () => {
  it('loads a non-empty, non-negative-integer count map from the committed cache', () => {
    const m = loadCitedByCounts();
    expect(m.size).toBeGreaterThan(0);
    for (const v of m.values()) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
