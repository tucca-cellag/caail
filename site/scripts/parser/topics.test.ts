/**
 * topics.test.ts — the topic model folded from committed NDJSON.
 */

import { describe, it, expect } from 'vitest';
import { buildTopicsModel, topicsByItemId, catalogNameKey, catalogJoinKey } from './topics.js';

describe('catalogJoinKey collision (what the generate-data uniqueness guard catches)', () => {
  it('two names differing only in a leading block-marker collapse to the SAME key', () => {
    // catalogNameKey re-parses the name as markdown, so `1. Foo` parses as a list item and
    // flattens to `Foo` — colliding with a plain `Foo` at the same (type,url). The build
    // guard asserts join-key uniqueness so this fails loudly instead of stealing topics.
    const a = catalogJoinKey('software', 'https://x', '1. Foo');
    const b = catalogJoinKey('software', 'https://x', 'Foo');
    expect(a).toBe(b); // collision — the guard rejects a catalog where both exist
  });
  it('distinct plain names at the same url do NOT collide', () => {
    expect(catalogJoinKey('database', 'https://x', 'PISCES')).not.toBe(catalogJoinKey('database', 'https://x', 'ATLAS'));
  });
});

describe('catalogNameKey (parser mdastToString ↔ NDJSON inlineMd name normalization)', () => {
  it('collapses every inline-markdown construct inlineMd emits to the same plain text', () => {
    // NDJSON side (inlineMd, markdown-preserving) vs parser side (mdastToString, plain)
    expect(catalogNameKey('`FooDB`')).toBe(catalogNameKey('FooDB'));     // inline code
    expect(catalogNameKey('*Foo*')).toBe(catalogNameKey('Foo'));         // emphasis
    expect(catalogNameKey('**Foo**')).toBe(catalogNameKey('Foo'));       // strong
    expect(catalogNameKey('~~Foo~~')).toBe(catalogNameKey('Foo'));       // strikethrough
    expect(catalogNameKey('![Build](badge.svg)')).toBe(catalogNameKey('Build')); // image-as-text → alt
  });
  it('leaves a literal (intraword) underscore intact', () => {
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
