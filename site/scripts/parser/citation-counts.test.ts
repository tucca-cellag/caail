/**
 * citation-counts.test.ts — the parse-time fold of OpenAlex cited_by_count onto content
 * cards (papers / catalog / dataset entries), joined by DOI. Mirrors the license fold.
 */

import { describe, it, expect } from 'vitest';

import { citationInfo, loadCitedByCounts, NO_CITATION } from './citation-counts.js';

describe('citationInfo', () => {
  it('joins a DOI to its count (host/prefix/case-insensitive key)', () => {
    const counts = new Map([['10.1/x', 7]]);
    expect(citationInfo('https://doi.org/10.1/X', 'manual', counts)).toEqual({
      doi: 'https://doi.org/10.1/X',
      doiSource: 'manual',
      citationCount: 7,
    });
  });
  it('is the null triad when there is no DOI', () => {
    expect(citationInfo(null, null, new Map())).toEqual(NO_CITATION);
  });
  it('count is null when the DOI is absent from the map', () => {
    expect(citationInfo('10.9/z', 'manual', new Map()).citationCount).toBeNull();
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
