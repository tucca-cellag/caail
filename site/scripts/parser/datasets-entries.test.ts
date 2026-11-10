/**
 * datasets-entries.test.ts — the datasets.json model built offline from the committed
 * dataset_entries NDJSON: curated entries carry their topic refs, anchors are unique
 * per page, and a known entry (ChickenGTEx-Portal) resolves with its external home.
 */

import { describe, it, expect } from 'vitest';
import { buildDatasetsModel, datasetEntryAnchor, parseAccessions } from './datasets-entries.js';

const model = buildDatasetsModel();

describe('buildDatasetsModel', () => {
  it('produces curated entries with valid shape', () => {
    expect(model.entries.length).toBeGreaterThan(0);
    for (const e of model.entries) {
      expect(e.id.startsWith('ds:')).toBe(true);
      expect(['atlas', 'gem', 'other']).toContain(e.kind);
      expect(e.anchor).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('carries topic refs on entries (the card chips / hub join)', () => {
    const tagged = model.entries.filter((e) => e.topics.length > 0);
    expect(tagged.length).toBeGreaterThan(0);
  });

  it('resolves a known featured atlas with its external home + topics', () => {
    const gtex = model.entries.find((e) => e.name === 'ChickenGTEx-Portal');
    expect(gtex).toBeDefined();
    expect(gtex!.url).toBe('https://chicken.farmgtex.org/');
    expect(gtex!.page).toBe('Chicken');
    expect(gtex!.topics.length).toBeGreaterThan(0);
  });

  it('resolves an unlinked GEM entry (url null) that still gets an anchor', () => {
    const gem = model.entries.find((e) => e.name.startsWith('iES1300'));
    expect(gem).toBeDefined();
    expect(gem!.url).toBeNull();
    expect(gem!.anchor.length).toBeGreaterThan(0);
  });

  it('anchors are unique within each page', () => {
    const byPage = new Map<string, string[]>();
    for (const e of model.entries) (byPage.get(e.page) ?? byPage.set(e.page, []).get(e.page)!).push(e.anchor);
    for (const [page, anchors] of byPage) {
      expect(new Set(anchors).size, `duplicate anchor on ${page}`).toBe(anchors.length);
    }
  });
});

describe('datasetEntryAnchor (collision-safe per-page anchors)', () => {
  it('suffixes repeated names with -2, -3, …', () => {
    const used = new Set<string>();
    expect(datasetEntryAnchor('Entry', used)).toBe('ds-entry');
    expect(datasetEntryAnchor('Entry', used)).toBe('ds-entry-2');
    expect(datasetEntryAnchor('Entry', used)).toBe('ds-entry-3');
  });

  it('does not collide when a literal name slugifies to an already-suffixed form', () => {
    // Regression: a per-base counter would give "Entry 2" the anchor `ds-entry-2`, colliding
    // with the second "Entry". Checking the final anchor bumps it to `ds-entry-2-2`.
    const used = new Set<string>();
    expect(datasetEntryAnchor('Entry', used)).toBe('ds-entry');
    expect(datasetEntryAnchor('Entry', used)).toBe('ds-entry-2');
    expect(datasetEntryAnchor('Entry 2', used)).toBe('ds-entry-2-2');
    expect(used.size).toBe(3); // three distinct anchors, no duplicate DOM id
  });
});

describe('accessions (tucca-cellag/caail-planning#752)', () => {
  it('reads a stored JSON array, and no value as none', () => {
    expect(parseAccessions('ds:a', '["PRJEB27455","PRJEB27111"]')).toEqual(['PRJEB27455', 'PRJEB27111']);
    expect(parseAccessions('ds:a', null)).toEqual([]);
    expect(parseAccessions('ds:a', undefined)).toEqual([]);
  });

  it('throws on a value that is not an array of strings, naming the entry', () => {
    for (const raw of ['"PRJEB27455"', '{"a":1}', '[1]', 'not json']) {
      expect(() => parseAccessions('ds:bad', raw), raw).toThrow(/ds:bad|JSON/);
    }
  });

  it('serves every entry an array, and FR-AgENCODE its three ENA deposits', () => {
    const { entries } = buildDatasetsModel();
    expect(entries.every((e) => Array.isArray(e.accessions))).toBe(true);
    const fr = entries.find((e) => e.id === 'ds:fr-agencode-multi-species-farm-animal-regulatory-atlas');
    expect(fr?.accessions).toEqual(['PRJEB27455', 'PRJEB27111', 'PRJEB27364']);
  });
});
