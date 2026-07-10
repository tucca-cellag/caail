/**
 * licenses.test.ts — the shared license → tier classifier.
 *
 * Guards the tier boundaries the card badge, the dashboard, and metrics.json all
 * rely on, and the ordered-match rule that resolves compound Creative Commons
 * tokens to their strongest restriction.
 */

import { describe, it, expect } from 'vitest';

import { licenseTier, LICENSE_TIERS, TIER_META } from './licenses';

describe('licenseTier', () => {
  it('bins permissive families', () => {
    for (const l of ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC', 'CC0-1.0', 'The Unlicense', 'MIT-0', 'Artistic-2.0']) {
      expect(licenseTier(l)).toBe('permissive');
    }
  });

  it('bins copyleft / weak-copyleft families', () => {
    for (const l of ['GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'MPL-2.0', 'EPL-2.0']) {
      expect(licenseTier(l)).toBe('copyleft');
    }
  });

  it('bins restricted (non-commercial / proprietary / academic)', () => {
    for (const l of ['Non-commercial', 'non commercial', 'Proprietary', 'Academic use only', 'All rights reserved']) {
      expect(licenseTier(l)).toBe('restricted');
    }
  });

  it('treats null / empty / unrecognised as unknown', () => {
    expect(licenseTier(null)).toBe('unknown');
    expect(licenseTier(undefined)).toBe('unknown');
    expect(licenseTier('')).toBe('unknown');
    expect(licenseTier('   ')).toBe('unknown');
    expect(licenseTier('Some bespoke terms')).toBe('unknown');
  });

  it('resolves compound Creative Commons tokens to their strongest restriction', () => {
    expect(licenseTier('CC-BY-4.0')).toBe('permissive'); // attribution only
    expect(licenseTier('CC-BY-SA-4.0')).toBe('copyleft'); // share-alike
    expect(licenseTier('CC-BY-NC-4.0')).toBe('restricted'); // non-commercial
    expect(licenseTier('CC-BY-NC-SA-4.0')).toBe('restricted'); // NC beats SA
  });

  it('is case-insensitive', () => {
    expect(licenseTier('mit')).toBe('permissive');
    expect(licenseTier('gpl-3.0')).toBe('copyleft');
  });

  it('has metadata for every tier', () => {
    for (const t of LICENSE_TIERS) {
      expect(TIER_META[t].label).toBeTruthy();
      expect(TIER_META[t].blurb).toBeTruthy();
    }
  });
});
