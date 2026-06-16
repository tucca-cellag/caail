/**
 * recent.test.ts — tests for the home page "Recently added" builder.
 *
 * The list is git-derived, so it changes every commit — assertions are
 * structure-only (shape, bounds, ordering, schema), never an exact tally.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { buildRecentModel } from './recent.js';
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
      expect(['media', 'cell', 'bioprocess', 'scaffolding', 'sensory', 'tooling', 'eval']).toContain(e.area);
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
