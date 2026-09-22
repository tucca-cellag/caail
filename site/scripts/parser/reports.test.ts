/**
 * reports.test.ts (parser) — buildReportsModel folds the committed reports NDJSON into the
 * reports.json model, and deriveReports computes the recency fields (CAAIL-363 + CAAIL-364).
 */

import { describe, it, expect } from 'vitest';
import { buildReportsModel, deriveReports, type ReportRow } from './reports.js';
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
});
