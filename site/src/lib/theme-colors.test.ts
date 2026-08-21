/**
 * theme-colors.test.ts — the theme → colour derivation.
 *
 * This exists because the mapping previously lived hardcoded in three CSS files and
 * drifted from the data: `metabolism-modeling` was painted with the AI Evaluation colour
 * despite having no matrix area, and `food-safety` had no entry at all. The guarantee
 * worth locking in is that a theme's colour follows its `area_key`, so an area and its
 * theme can never disagree again.
 */

import { describe, it, expect } from 'vitest';
import { themeColor, chipStyle } from './theme-colors';
import topicsData from '../content/data/topics.json';

type Node = { slug: string; label: string; areaKey: string | null; theme: string | null };
const themes = topicsData.themes as Node[];
const tags = topicsData.tags as Node[];

describe('themeColor', () => {
  it('gives every theme with an area that exact area colour', () => {
    const mapped = themes.filter((t) => t.areaKey);
    expect(mapped.length).toBeGreaterThan(0);
    for (const t of mapped) {
      expect(themeColor(t.slug)).toBe(`var(--caail-area-${t.areaKey})`);
    }
  });

  it('has no area-less theme left to mis-paint, and would not mis-paint one', () => {
    // The exact bug that shipped: metabolism-modeling wearing a matrix area's token,
    // one since retired with its column — so borrowing now paints an undefined variable.
    //
    // ADR-0001 gave every theme an area, so the filter below is empty and the loop
    // asserts nothing. That is the state we want, but a test whose body never runs is
    // green whatever the code does, so assert the emptiness itself — it is the real
    // invariant now, and `db:check`'s bijection guard enforces it at the source.
    const areaLess = themes.filter((x) => !x.areaKey);
    expect(areaLess).toEqual([]);
    // Kept executable for the day a cross-cutting theme is deliberately reintroduced.
    for (const t of areaLess) {
      expect(themeColor(t.slug)).not.toMatch(/--caail-area-/);
    }
  });

  it('gives every theme a real colour, never the grey fallback', () => {
    // food-safety previously fell through to muted because it had no CSS rule.
    for (const t of themes) {
      expect(themeColor(t.slug)).not.toBe('var(--caail-muted)');
    }
  });

  it('a fine tag inherits its parent theme colour', () => {
    expect(tags.length).toBeGreaterThan(0);
    for (const g of tags) {
      expect(themeColor(g.slug)).toBe(themeColor(g.theme as string));
    }
  });

  it('degrades to muted for an unknown or empty slug rather than throwing', () => {
    expect(themeColor('no-such-theme')).toBe('var(--caail-muted)');
    expect(themeColor(null)).toBe('var(--caail-muted)');
    expect(themeColor(undefined)).toBe('var(--caail-muted)');
    expect(themeColor('')).toBe('var(--caail-muted)');
  });

  it('chipStyle emits a --chip custom property', () => {
    const t = themes.find((x) => x.areaKey)!;
    expect(chipStyle(t.slug)).toBe(`--chip:var(--caail-area-${t.areaKey})`);
  });
});
