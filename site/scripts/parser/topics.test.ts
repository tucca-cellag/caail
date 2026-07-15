/**
 * topics.test.ts — the topic model folded from committed NDJSON.
 */

import { describe, it, expect } from 'vitest';
import { buildTopicsModel, topicsByItemId, catalogNameKey } from './topics.js';

describe('catalogNameKey (parser mdastToString ↔ NDJSON inlineMd name normalization)', () => {
  it('strips the inline-markdown markers inlineMd emits so both sides agree', () => {
    // NDJSON side (inlineMd, markdown-preserving) vs parser side (mdastToString, plain)
    expect(catalogNameKey('`FooDB`')).toBe(catalogNameKey('FooDB')); // inline code
    expect(catalogNameKey('*Foo*')).toBe(catalogNameKey('Foo'));     // emphasis
    expect(catalogNameKey('**Foo**')).toBe(catalogNameKey('Foo'));   // strong
    expect(catalogNameKey('~~Foo~~')).toBe(catalogNameKey('Foo'));   // strikethrough
  });
  it('leaves a literal underscore intact (inlineMd never emits _emphasis_)', () => {
    expect(catalogNameKey('cell_2_sentence')).toBe('cell_2_sentence');
  });
  it('is a no-op for a plain name', () => {
    expect(catalogNameKey('AlphaFold')).toBe('AlphaFold');
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
