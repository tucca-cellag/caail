/**
 * recent.test.ts — tests for the home page "Recently added" builder.
 *
 * The list is git-derived, so it changes every commit — assertions are
 * structure-only (shape, bounds, ordering, schema), never an exact tally.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { buildRecentModel, lastAdditionDate, classifyArea } from './recent.js';
import { RecentSchema, type Recent } from './types.js';

describe('buildRecentModel — real repo', () => {
  let recent: Recent;

  beforeAll(() => {
    recent = buildRecentModel();
  });

  it('returns at most `limit` entries (default 5)', () => {
    expect(Array.isArray(recent)).toBe(true);
    expect(recent.length).toBeLessThanOrEqual(5);
  });

  it('finds at least one addition in-repo', () => {
    // The repo has full history here, so the addition filter must hit something.
    expect(recent.length).toBeGreaterThan(0);
  });

  it('every entry has a valid date / kind / area / non-empty title', () => {
    for (const e of recent) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['Paper', 'Software', 'Dataset', 'Database', 'Resource']).toContain(e.kind);
      expect(['media', 'cell', 'bioprocess', 'scaffolding', 'sensory', 'metabolic', 'foodsafety', 'tooling']).toContain(e.area);
      expect(e.title.length).toBeGreaterThan(0);
    }
  });

  it('is ordered newest-first (dates non-increasing)', () => {
    for (let i = 1; i < recent.length; i++) {
      expect(recent[i - 1].date >= recent[i].date).toBe(true);
    }
  });

  it('has no duplicate titles', () => {
    const titles = recent.map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('honours a smaller limit', () => {
    expect(buildRecentModel(undefined, 2).length).toBeLessThanOrEqual(2);
  });

  it('degrades to an empty (valid) list when git history is unavailable', () => {
    // A non-repo path makes `git log` fail; the builder must swallow it.
    const empty = buildRecentModel('/nonexistent-not-a-git-repo');
    expect(empty).toEqual([]);
  });

  it('passes RecentSchema', () => {
    expect(RecentSchema.safeParse(recent).success).toBe(true);
  });
});

describe('lastAdditionDate — real repo', () => {
  it('returns an ISO timestamp for a kind present in history', () => {
    const d = lastAdditionDate('Paper');
    expect(d).toBeTruthy();
    expect(d!).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('is consistent with the Recently-added list (newest of its kind)', () => {
    // lastAdditionDate finds the newest addition of that kind across all history,
    // so its date must be >= every same-kind entry that surfaces in the list. This
    // is the invariant that keeps the momentum "last updated" from disagreeing with
    // the home page "Recently added" panel.
    const recentAll = buildRecentModel(undefined, 50);
    const newestPaper = lastAdditionDate('Paper');
    if (newestPaper) {
      for (const e of recentAll.filter((r) => r.kind === 'Paper')) {
        expect(newestPaper.slice(0, 10) >= e.date).toBe(true);
      }
    }
  });

  it('returns null when git history is unavailable', () => {
    expect(lastAdditionDate('Paper', '/nonexistent-not-a-git-repo')).toBeNull();
  });
});

describe('classifyArea — keyword matching', () => {
  // The bug this guards: keywords were matched with `includes`, so "ige" (an
  // allergenicity cue) matched "intelligence" and mis-tagged a live homepage entry.
  it('does not match a keyword occurring mid-word', () => {
    expect(classifyArea('The AI4CM Hub and the Food Intelligence Lab')).not.toBe('foodsafety');
    expect(classifyArea('add a data management tool')).not.toBe('metabolic');
  });

  // The over-correction: anchoring BOTH edges broke inflections and silently sent these
  // two to the `tooling` fallback. Leading-edge-only is the rule that satisfies both.
  it('still matches a keyword that continues into a longer word', () => {
    expect(classifyArea('Three allergenicity predictors')).toBe('foodsafety');
    expect(classifyArea('Metabolic Modeling and Food Safety Prediction columns')).toBe('metabolic');
  });

  // Round 6: leading-anchor alone still admitted word-INITIAL substrings. Each of these
  // is a realistic commit subject for this repo and each painted a wrong area dot.
  it('does not let a short stem match a longer word it begins', () => {
    expect(classifyArea('add a Gemini cross-model review step')).toBe('tooling');
    expect(classifyArea('add the Gemma 3 model card')).toBe('tooling');
    // `flux` is not in the keyword list at all: it is a homonym rather than a stem, so
    // no boundary rule could separate metabolic flux from Flux the image model.
    expect(classifyArea('wire the Flux image pipeline')).toBe('tooling');
    expect(classifyArea('add iGEM 2025 team resources')).not.toBe('foodsafety');
  });

  it('still matches those stems as whole words', () => {
    expect(classifyArea('add the bovine GEM reconstruction')).toBe('metabolic');
    expect(classifyArea('record IgE epitope mapping coverage')).toBe('foodsafety');
  });

  it('leaves metabolomics on the sensory axis, per Taxonomy.md', () => {
    // Measuring metabolites to predict an eating-quality attribute is a sensory result;
    // modelling the network is Metabolic Modeling. `sensory` is evaluated first, so this
    // shadowing is intentional rather than a collision to fix.
    expect(classifyArea('metabolomic selection for flavour')).toBe('sensory');
  });

  it('falls back to tooling when nothing matches', () => {
    expect(classifyArea('add a thing')).toBe('tooling');
  });
});
