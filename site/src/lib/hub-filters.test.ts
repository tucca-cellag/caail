/**
 * hub-filters.test.ts — the shared secondary-filter predicates for the three hubs.
 *
 * These decide what an intersection like `?tier=permissive&t=media-growth-factors`
 * means. The subtle cases are the two exclusions: papers have no license tier, and an
 * unindexed resource has no citation band. Both must drop out of a filtered view rather
 * than being treated as a zero value.
 */

import { describe, it, expect } from 'vitest';
import {
  readSecondary,
  matchesTopic,
  matchesTier,
  matchesBand,
  hubUrl,
  type TopicRef,
} from './hub-filters';

const refs: TopicRef[] = [
  { slug: 'serum-free-media', label: 'Serum-free media', theme: 'media-growth-factors' },
];

describe('readSecondary', () => {
  it('reads all three axes', () => {
    const s = readSecondary('?t=media-growth-factors&tier=permissive&band=1000plus');
    expect(s).toEqual({ t: 'media-growth-factors', tier: 'permissive', band: '1000plus' });
  });

  it('drops values that are not known members', () => {
    const s = readSecondary('?t=not-a-topic&tier=viral&band=loads');
    expect(s).toEqual({ t: null, tier: null, band: null });
  });

  it('accepts a fine tag as well as a theme', () => {
    expect(readSecondary('?t=serum-free-media').t).toBe('serum-free-media');
  });

  it('is empty for an empty query', () => {
    expect(readSecondary('')).toEqual({ t: null, tier: null, band: null });
  });
});

describe('matchesTopic', () => {
  it('matches a parent theme and the tag itself', () => {
    expect(matchesTopic(refs, 'media-growth-factors')).toBe(true);
    expect(matchesTopic(refs, 'serum-free-media')).toBe(true);
  });

  it('rejects an unrelated topic, and passes everything when unset', () => {
    expect(matchesTopic(refs, 'food-safety')).toBe(false);
    expect(matchesTopic(refs, null)).toBe(true);
    expect(matchesTopic(undefined, null)).toBe(true);
    expect(matchesTopic(undefined, 'food-safety')).toBe(false);
  });
});

describe('matchesTier', () => {
  it('excludes papers (tier null) once a tier filter is on', () => {
    expect(matchesTier(null, 'permissive')).toBe(false);
    expect(matchesTier(null, null)).toBe(true); // unfiltered: papers stay
    expect(matchesTier('permissive', 'permissive')).toBe(true);
    expect(matchesTier('copyleft', 'permissive')).toBe(false);
  });
});

describe('matchesBand', () => {
  it('excludes unindexed items rather than banding them as zero', () => {
    // A null count is "OpenAlex has no record", which is NOT the same as 0 citations.
    expect(matchesBand(null, 'under10')).toBe(false);
    expect(matchesBand(0, 'under10')).toBe(true);
    expect(matchesBand(null, null)).toBe(true); // unfiltered: everything stays
  });

  it('bands by the shared classifier', () => {
    expect(matchesBand(1500, '1000plus')).toBe(true);
    expect(matchesBand(999, '1000plus')).toBe(false);
    expect(matchesBand(999, '100to999')).toBe(true);
  });
});

describe('hubUrl', () => {
  it('sets a param while preserving the others', () => {
    expect(hubUrl('/caail/', 'licenses', { t: 'food-safety' }, '?tier=permissive')).toBe(
      '/caail/licenses/?tier=permissive&t=food-safety',
    );
  });

  it('clears a param with null', () => {
    expect(hubUrl('/caail/', 'citations', { t: null }, '?band=10to99&t=food-safety')).toBe(
      '/caail/citations/?band=10to99',
    );
  });

  it('drops the question mark when nothing is left', () => {
    expect(hubUrl('/caail/', 'topics', { t: null }, '?t=food-safety')).toBe('/caail/topics/');
  });

  it('tolerates a base with no trailing slash', () => {
    expect(hubUrl('/caail', 'topics', { t: 'food-safety' }, '')).toBe(
      '/caail/topics/?t=food-safety',
    );
  });

  it("clearing the secondary axes leaves the hub's primary axis alone", () => {
    // Regression guard. HubFilterBar's "Clear all" used to pass {t,tier,band} all null,
    // which also dropped the axis the hub is routed by: from
    // /licenses/?tier=permissive&t=... it navigated to the bare /licenses/ index instead
    // of back to the tier view, disagreeing with clicking each chip's x in turn.
    const search = '?tier=permissive&t=metabolism-modeling&band=1000plus';

    // Only the axes the licenses hub actually shows as chips (it omits its own `tier`).
    expect(hubUrl('/caail/', 'licenses', { t: null, band: null }, search)).toBe(
      '/caail/licenses/?tier=permissive',
    );

    // Clearing every axis is what the bug did, and it loses the primary one.
    expect(hubUrl('/caail/', 'licenses', { t: null, tier: null, band: null }, search)).toBe(
      '/caail/licenses/',
    );
  });
});
