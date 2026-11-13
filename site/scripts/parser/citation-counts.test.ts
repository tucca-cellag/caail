/**
 * citation-counts.test.ts — the parse-time fold of OpenAlex cited_by_count onto content
 * cards (papers / catalog / dataset entries), joined by DOI. Mirrors the license fold.
 */

import { describe, it, expect } from 'vitest';

import { citationInfo, loadCitedByCounts, loadZenodoTypes, NO_CITATION, parseRelatedDois, zenodoItemDois } from './citation-counts.js';

describe('doiRelation of a Zenodo DOI on an item (tucca-cellag/caail-planning#760)', () => {
  it("serves a Zenodo document as publication and a deposit as own, from each record's cached resource type", () => {
    // sw:project-pisces: a PDF of software documentation about the tool, not the tool.
    expect(citationInfo('10.5281/zenodo.23124562', 'manual', new Map()).doiRelation).toBe('publication');
    // ds:growth-factor-thermostability-dataset: the deposit itself.
    expect(citationInfo('10.5281/zenodo.19339684', 'manual', new Map()).doiRelation).toBe('own');
  });

  it('has a cached resource type for every Zenodo DOI a catalog item or curated entry carries', () => {
    // Fails until `pnpm --dir site fetch:zenodo-types` has recorded a newly added one.
    const types = loadZenodoTypes();
    const dois = zenodoItemDois();
    expect(dois.length).toBeGreaterThan(0);
    expect(dois.filter((d) => !types.has(d))).toEqual([]);
  });
});

describe('citationInfo', () => {
  it('joins a DOI to its count (host/prefix/case-insensitive key)', () => {
    const counts = new Map([['10.1/x', 7]]);
    expect(citationInfo('https://doi.org/10.1/X', 'manual', counts)).toEqual({
      doi: 'https://doi.org/10.1/X',
      doiSource: 'manual',
      // A one-digit registrant is not a real DOI, so no relation is claimed for it.
      doiRelation: null,
      citationCount: 7,
      citationSources: 1,
      citationDois: ['10.1/x'],
    });
  });
  it('serves a DOI stored in URL form as a bare DOI, so every join key has one shape', () => {
    expect(citationInfo('https://doi.org/10.5281/Zenodo.1', 'manual', new Map()).doi).toBe('10.5281/zenodo.1');
  });
  it('carries the DOI relation through to the card info', () => {
    expect(citationInfo('10.5281/zenodo.1', 'manual', new Map()).doiRelation).toBe('own');
    expect(citationInfo('10.1038/s41586-021-03819-2', 'manual', new Map()).doiRelation).toBe('publication');
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
    expect(info.citationDois).toEqual(['10.1/x', '10.1/y', '10.1/z']); // all summed works, for the link
  });
  it('citationDois lists only the DOIs that contributed a count', () => {
    const counts = new Map([['10.1/x', 7]]); // one related has no count
    const info = citationInfo('10.1/x', 'manual', counts, ['10.1/missing']);
    expect(info.citationDois).toEqual(['10.1/x']);
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
