/**
 * topics.test.ts — the topic model folded from committed NDJSON.
 */

import { describe, it, expect } from 'vitest';
import { buildTopicsModel, topicsByItemId, orderCatalogRows } from './topics.js';

describe('orderCatalogRows (positional topic-join order = emitted document order)', () => {
  it('places a db:add entry (global-max ordinal) into its group, not at the end (C4)', () => {
    // sw:new was added to the FIRST group via db:add, so it got a global-max ordinal (99)
    // but is re-emitted inside G1. Document order must be a,b,new,c,d — NOT a,b,c,d,new.
    const rows = [
      { item_id: 'sw:a', grp: 'G1', ordinal: 0 },
      { item_id: 'sw:b', grp: 'G1', ordinal: 1 },
      { item_id: 'sw:c', grp: 'G2', ordinal: 2 },
      { item_id: 'sw:d', grp: 'G2', ordinal: 3 },
      { item_id: 'sw:new', grp: 'G1', ordinal: 99 },
    ];
    expect(orderCatalogRows(rows).map((r) => r.item_id)).toEqual(['sw:a', 'sw:b', 'sw:new', 'sw:c', 'sw:d']);
  });
  it('leaves already-grouped document order unchanged', () => {
    const rows = [
      { item_id: 'x', grp: 'A', ordinal: 0 },
      { item_id: 'y', grp: 'A', ordinal: 1 },
      { item_id: 'z', grp: 'B', ordinal: 2 },
    ];
    expect(orderCatalogRows(rows).map((r) => r.item_id)).toEqual(['x', 'y', 'z']);
  });
});

describe('buildTopicsModel', () => {
  const m = buildTopicsModel();

  it('builds 7 themes with counts and child tags', () => {
    expect(m.themes).toHaveLength(7);
    const meta = m.themes.find((t) => t.slug === 'metabolism-modeling')!;
    expect(meta.counts.total).toBeGreaterThan(0);
    expect(meta.tags.length).toBeGreaterThan(0);
    expect(meta.areaKey).toBeNull(); // metabolism is a subject theme, no matrix column
  });

  it('a theme count is the deduped union, so >= any of its child-tag counts', () => {
    for (const theme of m.themes) {
      const childTotals = theme.tags.map((s) => m.tags.find((t) => t.slug === s)!.counts.total);
      expect(theme.counts.total).toBeGreaterThanOrEqual(Math.max(0, ...childTotals));
    }
  });

  it('every fine tag points at a real theme', () => {
    const themeSlugs = new Set(m.themes.map((t) => t.slug));
    for (const tag of m.tags) expect(themeSlugs.has(tag.theme!)).toBe(true);
  });
});

describe('topicsByItemId', () => {
  const byId = topicsByItemId();
  it('maps content items to deduped topic refs (theme carried on each)', () => {
    expect(byId.size).toBeGreaterThan(0);
    for (const refs of byId.values()) {
      const slugs = refs.map((r) => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length); // deduped
      for (const r of refs) expect(typeof r.theme).toBe('string');
    }
  });
  it('both GNPS listings carry topics (distinct item ids)', () => {
    expect((byId.get('sw:gnps') ?? []).length).toBeGreaterThan(0);
    expect((byId.get('db:gnps') ?? []).length).toBeGreaterThan(0);
  });
});
