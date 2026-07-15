/**
 * licenses.test.ts (parser fold) — the offline join that lands DB license fields on
 * catalog + dataset cards, and the derived tier.
 */

import { describe, it, expect } from 'vitest';
import { licenseInfo, catalogLicenseLookup, UNKNOWN_LICENSE } from './licenses.js';
import { buildCatalogModel } from './catalog.js';

describe('licenseInfo', () => {
  it('derives the tier from the raw token', () => {
    expect(licenseInfo('MIT', 'auto')).toEqual({ license: 'MIT', licenseSource: 'auto', tier: 'permissive' });
    expect(licenseInfo('CC-BY-NC-4.0', 'manual').tier).toBe('restricted');
    expect(licenseInfo(null, null)).toEqual(UNKNOWN_LICENSE);
  });
});

describe('catalogLicenseLookup + buildCatalogModel (real corpus)', () => {
  const catalog = buildCatalogModel();
  const all = [...catalog.software, ...catalog.databases];

  it('attaches a tier to every catalog entry', () => {
    expect(all.length).toBeGreaterThan(0);
    for (const e of all) expect(['permissive', 'copyleft', 'restricted', 'unknown']).toContain(e.tier);
  });

  it('a meaningful share of entries carry a real (non-unknown) tier', () => {
    const licensed = all.filter((e) => e.tier !== 'unknown');
    expect(licensed.length).toBeGreaterThan(80); // ~122 ported minus any url drift
  });

  it('auto and manual provenance both appear', () => {
    expect(all.some((e) => e.licenseSource === 'auto')).toBe(true);
    expect(all.some((e) => e.licenseSource === 'manual')).toBe(true);
  });

  it('an entry with no license row is unknown / null source', () => {
    const unknown = all.find((e) => e.tier === 'unknown');
    expect(unknown).toBeDefined();
    expect(unknown!.licenseSource).toBeNull();
  });
});
