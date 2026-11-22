/**
 * recent.test.ts — tests for the home page "Recently added" builder.
 *
 * The list is git-derived, so it changes every commit — assertions are
 * structure-only (shape, bounds, ordering, schema), never an exact tally.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { buildRecentModel, lastAdditionDate, parseSubject } from './recent.js';
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

  it('every entry has a valid date / kind / non-empty title', () => {
    for (const e of recent) {
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['Paper', 'Software', 'Dataset', 'Database', 'Resource']).toContain(e.kind);
      expect(e.title.length).toBeGreaterThan(0);
    }
  });

  it('carries no research area', () => {
    // An entry's area could only be guessed from its commit subject, and the guesses
    // were wrong for most of the list, so none is made (tucca-cellag/caail-planning#887).
    for (const e of recent) expect(Object.keys(e).sort()).toEqual(['date', 'kind', 'title']);
    const parsed = parseSubject('2026-01-01', 'feat(papers): add Tac et al. 2026 burger paper (#236)');
    expect(parsed).toEqual({ date: '2026-01-01', kind: 'Paper', title: 'Tac et al. 2026 burger paper' });
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

describe('parseSubject: reader-facing title overrides', () => {
  it('shows the reader-facing title for a commit whose subject narrates the curation process', () => {
    // The subject as pushed on 2026-09-02. A pushed subject cannot be edited, so the override
    // supplies the title; this fails if the override or the lead-verb stripping it keys on changes.
    const entry = parseSubject(
      '2026-09-02',
      'feat(papers): add the two matrix cells a reviewer confirmed and nothing landed',
    );
    expect(entry?.title).toBe('iUmami-SCM and CRISPR-GPT each placed in one more matrix cell');
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
