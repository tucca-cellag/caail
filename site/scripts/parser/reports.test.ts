/**
 * reports.test.ts (parser) — buildReportsModel folds the committed reports NDJSON into the
 * reports.json model, and deriveReports computes the recency fields (CAAIL-363 + CAAIL-364).
 */

import { describe, it, expect } from 'vitest';
import {
  buildReportsModel, deriveReports, isEditionSort, seriesRecency, EDITION_SORT_RULE, type ReportRow,
} from './reports.js';
import { ReportsDataSchema, type Report } from './types.js';

const NO_TOPICS = new Map<string, Report['topics']>();

/** Minimal row factory for the recency tests. */
function row(id: string, series: string | null, sort: string): ReportRow {
  return {
    item_id: id, title: id, url: null,
    series_slug: series, edition_label: sort, edition_sort: sort,
    heading_md: id, body_md: '', ordinal: 0,
  };
}

describe('buildReportsModel (committed corpus)', () => {
  const model = buildReportsModel();

  it('validates against ReportsDataSchema', () => {
    expect(() => ReportsDataSchema.parse(model)).not.toThrow();
  });

  it('carries the committed GFI editions with derived recency', () => {
    // CAAIL-366 replaced the T2 combined-series demo (report:gfi-state-of-the-industry-*)
    // with the real per-track corpus; the cultivated-meat series is that record's successor.
    const cur = model.reports.find((r) => r.id === 'report:gfi-state-of-the-industry-cultivated-meat-2026');
    const old = model.reports.find((r) => r.id === 'report:gfi-state-of-the-industry-cultivated-meat-2024');
    expect(cur).toBeDefined();
    expect(old).toBeDefined();
    expect(cur!.current).toBe(true);
    expect(cur!.supersededBy).toBeNull();
    expect(old!.current).toBe(false);
    expect(old!.supersededBy).toBe('report:gfi-state-of-the-industry-cultivated-meat-2026');
    expect(cur!.seriesSlug).toBe('gfi-state-of-the-industry-cultivated-meat');
  });
});

describe('deriveReports recency model', () => {
  it('the newest edition is current, the older is superseded by it', () => {
    const out = deriveReports([row('r:2024', 's', '2024'), row('r:2026', 's', '2026')], NO_TOPICS);
    const cur = out.find((r) => r.id === 'r:2026')!;
    const old = out.find((r) => r.id === 'r:2024')!;
    expect(cur.current).toBe(true);
    expect(cur.supersededBy).toBeNull();
    expect(old.current).toBe(false);
    expect(old.supersededBy).toBe('r:2026');
  });

  it('adding a third edition self-demotes the previous latest, with no stored flag', () => {
    // The acceptance: recency is derived from max(edition_sort), so a new edition demotes the
    // prior one purely by being added — nothing about the 2026 row changes on disk.
    const out = deriveReports(
      [row('r:2024', 's', '2024'), row('r:2026', 's', '2026'), row('r:2028', 's', '2028')],
      NO_TOPICS,
    );
    const byId = new Map(out.map((r) => [r.id, r]));
    expect(byId.get('r:2028')!.current).toBe(true);
    expect(byId.get('r:2026')!.current).toBe(false);
    expect(byId.get('r:2026')!.supersededBy).toBe('r:2028');
    expect(byId.get('r:2024')!.supersededBy).toBe('r:2028');
    // seriesEditions is the whole series, sorted oldest-to-newest.
    expect(byId.get('r:2028')!.seriesEditions).toEqual(['r:2024', 'r:2026', 'r:2028']);
  });

  it('a one-off (series_slug null) is its own latest', () => {
    const out = deriveReports([row('r:oneoff', null, '2026')], NO_TOPICS);
    expect(out[0].current).toBe(true);
    expect(out[0].supersededBy).toBeNull();
    expect(out[0].seriesEditions).toEqual(['r:oneoff']);
  });

  it('ISO-date sorts order correctly alongside a later year', () => {
    const out = deriveReports([row('r:mar', 's', '2026-03-01'), row('r:nov', 's', '2026-11-01')], NO_TOPICS);
    expect(out.find((r) => r.id === 'r:nov')!.current).toBe(true);
    expect(out.find((r) => r.id === 'r:mar')!.current).toBe(false);
  });

  // CAAIL-373: the parser is the guard every build passes through (pnpm parse runs no db:check),
  // so each case that would otherwise publish a guessed `current` must abort it instead.
  it('throws on a nested pair rather than picking by string prefix', () => {
    expect(() => deriveReports([row('r:year', 's', '2026'), row('r:mar', 's', '2026-03-01')], NO_TOPICS))
      .toThrow(/series 's': edition_sort 2026 \(r:year\) contains 2026-03-01 \(r:mar\)/);
  });

  it('orders mixed precisions that do not nest chronologically', () => {
    const out = deriveReports([row('r:2026', 's', '2026'), row('r:2027-03', 's', '2027-03')], NO_TOPICS);
    expect(out.find((r) => r.id === 'r:2027-03')!.current).toBe(true);
    expect(out.find((r) => r.id === 'r:2026')!.supersededBy).toBe('r:2027-03');
  });

  it('throws on two editions sharing a sort', () => {
    expect(() => deriveReports([row('r:a', 's', '2026'), row('r:b', 's', '2026')], NO_TOPICS))
      .toThrow(/r:a and r:b share edition_sort 2026/);
  });

  it('lists every problem on its own line, then the rule once, so a build abort is countable and actionable', () => {
    let message = '';
    try {
      deriveReports([row('r:a', 's', '2026-13'), row('r:b', 't', '2026'), row('r:c', 't', '2026')], NO_TOPICS);
    } catch (e) { message = (e as Error).message; }
    const lines = message.split('\n');
    expect(lines[0]).toBe('reports: invalid edition data (2):');
    expect(lines.filter((l) => l.startsWith('  - '))).toHaveLength(2);
    // No problem carries its own semicolon-joined remedy any more.
    expect(lines.filter((l) => l.startsWith('  - ')).every((l) => !l.includes(';'))).toBe(true);
    expect(message).toContain(EDITION_SORT_RULE);
    expect(message).toMatch(/seriesRecency in site\/scripts\/parser\/reports\.ts/);
  });

  it('throws on an impossible date, in a series or a one-off', () => {
    expect(() => deriveReports([row('r:a', 's', '2026-12'), row('r:b', 's', '2026-13')], NO_TOPICS))
      .toThrow(/"2026-13" is not a valid/);
    expect(() => deriveReports([row('r:oneoff', null, '2026-02-30')], NO_TOPICS)).toThrow(/"2026-02-30" is not a valid/);
  });

  it('prints a raw sort escaped, so a stray newline cannot split the one-problem-per-line output', () => {
    let message = '';
    try { deriveReports([row('r:nl', null, '2026\n')], NO_TOPICS); } catch (e) { message = (e as Error).message; }
    expect(message).toContain('edition_sort "2026\\n" is not a valid');
    expect(message.split('\n').filter((l) => l.startsWith('  - '))).toHaveLength(1);
  });

  it('throws on an empty edition_label, which api/reports.json would otherwise publish', () => {
    expect(() => deriveReports([{ ...row('r:a', null, '2026'), edition_label: '  ' }], NO_TOPICS))
      .toThrow(/r:a: missing or empty edition_label/);
  });

  it('treats a row with no series_slug key as a one-off, as SQLite import does', () => {
    const a = { ...row('r:a', null, '2026') } as Partial<ReportRow>;
    const b = { ...row('r:b', null, '2026') } as Partial<ReportRow>;
    delete a.series_slug; delete b.series_slug;
    const out = deriveReports([a as ReportRow, b as ReportRow], NO_TOPICS);
    expect(out.map((r) => [r.seriesSlug, r.current])).toEqual([[null, true], [null, true]]);
  });

  it('reports a hand-edited row missing its label or sort as a problem, not a TypeError', () => {
    const noLabel = { ...row('r:a', null, '2026') } as Partial<ReportRow>;
    delete noLabel.edition_label;
    expect(() => deriveReports([noLabel as ReportRow], NO_TOPICS)).toThrow(/r:a: missing or empty edition_label/);
    const noSort = { ...row('r:b', null, '2026') } as Partial<ReportRow>;
    delete noSort.edition_sort;
    expect(() => deriveReports([noSort as ReportRow], NO_TOPICS)).toThrow(/r:b: edition_sort undefined is not a valid/);
  });
});

describe('seriesRecency (the shared definition of latest)', () => {
  it('orders editions oldest to newest and names the single latest', () => {
    const { bySeries, problems } = seriesRecency([row('r:b', 's', '2025'), row('r:a', 's', '2024'), row('r:c', 's', '2026')]);
    expect(problems).toEqual([]);
    expect(bySeries.get('s')).toEqual({ editions: ['r:a', 'r:b', 'r:c'], latest: 'r:c' });
  });

  it('gives the same answer whatever order the rows arrive in (db:check and parse read differently)', () => {
    const rows = [row('r:a', 's', '2024'), row('r:b', 's', '2024'), row('r:c', 's', '2026')]
      .map((r, i) => ({ ...r, ordinal: i }));
    const forward = seriesRecency(rows);
    const reversed = seriesRecency([...rows].reverse());
    expect(reversed.bySeries).toEqual(forward.bySeries);
    expect(reversed.problems).toEqual(forward.problems);
    expect(forward.bySeries.get('s')!.editions).toEqual(['r:a', 'r:b', 'r:c']);
  });

  // The forward scan relies on every extension of a sort following it contiguously in string order.
  // Each case pins the EXACT set of nested pairs (outer>inner, by id), which an adjacent-only scan
  // would fail on every case with more than one pair.
  it.each([
    ['interleaved with non-nesting editions', ['2025-12', '2026', '2026-03-01', '2026-05', '2027'], ['r:1>r:2', 'r:1>r:3']],
    ['three levels deep', ['2026', '2026-03', '2026-03-01'], ['r:0>r:1', 'r:0>r:2', 'r:1>r:2']],
    ['a duplicate followed by a nest', ['2026', '2026', '2026-03'], ['r:0>r:2', 'r:1>r:2']],
    ['the nest listed first in the document', ['2026-03-01', '2027', '2026'], ['r:2>r:0']],
  ])('reports every nested pair %s', (_label, sorts, expected) => {
    const { problems } = seriesRecency(sorts.map((s, i) => ({ ...row(`r:${i}`, 's', s), ordinal: i })));
    const pairs = problems.flatMap((p) => {
      const m = / \((r:\d+)\) contains \S+ \((r:\d+)\)/.exec(p);
      return m ? [`${m[1]}>${m[2]}`] : [];
    });
    expect(pairs.sort()).toEqual([...expected].sort());
  });

  it('reports every nested pair, not only the first, so one rerun shows the whole problem', () => {
    const { problems } = seriesRecency(
      ['2026', '2026-03-01', '2026-05', '2027'].map((s, i) => ({ ...row(`r:${i}`, 's', s), ordinal: i })));
    expect(problems.filter((p) => / contains /.test(p))).toEqual([
      "series 's': edition_sort 2026 (r:0) contains 2026-03-01 (r:1), so neither can be ordered after the other",
      "series 's': edition_sort 2026 (r:0) contains 2026-05 (r:2), so neither can be ordered after the other",
    ]);
  });

  it('isEditionSort accepts the three forms and checks the calendar', () => {
    // 2000 is a leap year (divisible by 400), 1900 is not; 0004 checks years Date.UTC would misread.
    for (const ok of ['2026', '2026-01', '2026-12', '2026-01-31', '2024-02-29', '2000-02-29', '0004-02-29'])
      expect(isEditionSort(ok)).toBe(true);
    expect(isEditionSort('1900-02-29')).toBe(false);
    for (const bad of ['26', '2026-1', '2026-00', '2026-13', '2025-02-29', '2026-04-31', '2026-01-00', 'TBD', ' 2026'])
      expect(isEditionSort(bad)).toBe(false);
  });
});
