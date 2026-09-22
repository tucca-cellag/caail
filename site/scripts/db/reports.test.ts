/**
 * reports.test.ts — the field-reports pipeline (CAAIL-363 skeleton + CAAIL-364 series).
 *
 *   A. extractReports: series (H2) + editions (H3), the italic edition line, unlinked + one-off.
 *   B. seedReports: frozen `report:` ids, series/edition columns.
 *   C. emitReportsFile: block-splice round-trip (H2s + prose preserved) and the count guard.
 *   D. Integration: the committed FieldReports.md round-trips and passes checkIntegrity + checkSeries.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, importNdjson, REPO_ROOT, type Db } from './lib.js';
import { extractReports } from './extract.js';
import { seedReports } from './seed.js';
import { emitReportsFile } from './emit.js';
import { checkIntegrity, checkSeries } from './check.js';

const TMP = mkdtempSync(join(tmpdir(), 'caail-reports-test-'));

function fixture(name: string, body: string): string {
  const p = join(TMP, name);
  writeFileSync(p, body);
  return p;
}

// A top-level one-off (before any series H2, so seriesSlug null; unlinked, so url null),
// then a two-edition series.
const SAMPLE = `# Field Reports

An intro paragraph, narrative prose that must be preserved verbatim.

### A One-Off Report 2025

*Edition 2025, published 2025-06.*

A top-level, unlinked one-off before any series section.

## Example Series

A series intro paragraph, also narrative prose.

### [Example 2026](https://example.com/2026)

*Edition 2026, published 2026.*

The current edition body.

### [Example 2024](https://example.com/2024)

*Edition 2024, published 2024.*

The prior edition body.
`;

describe('extractReports', () => {
  const entries = extractReports(fixture('extract.md', SAMPLE));

  it('finds every H3 entry in document order', () => {
    expect(entries.map((e) => e.name)).toEqual(['A One-Off Report 2025', 'Example 2026', 'Example 2024']);
  });

  it('tracks the enclosing H2 as the series slug; null for a top-level one-off', () => {
    expect(entries[0].seriesSlug).toBeNull();
    expect(entries[1].seriesSlug).toBe('example-series');
    expect(entries[2].seriesSlug).toBe('example-series');
  });

  it('parses the italic edition line into label + sort', () => {
    expect(entries[0].editionLabel).toBe('2025');
    expect(entries[0].editionSort).toBe('2025-06');
    expect(entries[1].editionLabel).toBe('2026');
    expect(entries[1].editionSort).toBe('2026');
  });

  it('captures the link target, and null for an unlinked heading', () => {
    expect(entries[0].url).toBeNull();
    expect(entries[1].url).toBe('https://example.com/2026');
  });

  it('keeps the edition line inside body_md (so it round-trips and reaches llms-full)', () => {
    expect(entries[1].bodyMd).toContain('*Edition 2026, published 2026.*');
  });

  it('throws when a report body has no edition line', () => {
    const bad = `# Field Reports\n\n### [No Edition](https://example.com/x)\n\nBody with no edition line.\n`;
    expect(() => extractReports(fixture('bad.md', bad))).toThrow(/no "\*Edition <label>, published <sort>\.\*" line/);
  });
});

describe('seedReports', () => {
  it('mints frozen `report:` ids and stores series + edition columns', () => {
    const db = openDb();
    const n = seedReports(db, extractReports(fixture('seed.md', SAMPLE)));
    expect(n).toBe(3);
    const r = db.prepare("SELECT series_slug,edition_label,edition_sort,ordinal FROM reports WHERE item_id='report:example-2026'").get() as
      { series_slug: string; edition_label: string; edition_sort: string; ordinal: number };
    expect(r).toEqual({ series_slug: 'example-series', edition_label: '2026', edition_sort: '2026', ordinal: 1 });
    const oneoff = db.prepare("SELECT series_slug FROM reports WHERE item_id='report:a-one-off-report-2025'").get() as { series_slug: string | null };
    expect(oneoff.series_slug).toBeNull();
    // checkSeries is satisfied (each series has exactly one latest edition).
    expect(checkSeries(db).every((c) => c.ok)).toBe(true);
  });
});

describe('checkSeries edition_sort precision (CAAIL-373)', () => {
  /** A one-off at `oneoffSort`, then a series whose editions carry `sorts` (label = sort). */
  function seriesDb(sorts: string[], oneoffSort = '2025-06'): Db {
    const editions = sorts.map((s, i) =>
      `### [Example ${i}](https://example.com/${i})\n\n*Edition ${s}, published ${s}.*\n\nBody ${i}.\n`).join('\n');
    const md = `# Field Reports\n\n### A One-Off\n\n*Edition x, published ${oneoffSort}.*\n\nOne-off.\n\n` +
      `## Example Series\n\n${editions}`;
    const db = openDb();
    seedReports(db, extractReports(fixture(`precision-${sorts.join('_')}.md`, md)));
    return db;
  }

  it('fails a series that mixes YYYY and YYYY-MM-DD, naming the series and its sorts', () => {
    // String order puts '2026' first by prefix, so the year-only edition would lose "latest"
    // to the March one whichever was really published later.
    const [res] = checkSeries(seriesDb(['2026', '2026-03-01']));
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/series 'example-series': edition_sort mixes precisions \(2026, 2026-03-01\)/);
  });

  it('fails a YYYY / YYYY-MM mix, and a YYYY-MM / YYYY-MM-DD mix', () => {
    expect(checkSeries(seriesDb(['2025', '2026-06']))[0].detail).toMatch(/mixes precisions \(2025, 2026-06\)/);
    // '2026-06' < '2026-06-01' < '2026-07' by prefix: the same misorder one precision down.
    expect(checkSeries(seriesDb(['2026-06', '2026-06-01']))[0].detail).toMatch(/mixes precisions \(2026-06, 2026-06-01\)/);
  });

  it('reports a malformed edition_sort once, not also as a precision mix', () => {
    const [res] = checkSeries(seriesDb(['2026', '2026-6']));
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/edition_sort '2026-6' is not a valid YYYY, YYYY-MM or YYYY-MM-DD date/);
    expect(res.detail).not.toMatch(/mixes precisions/);
  });

  it('rejects shape-valid but impossible dates, which would otherwise sort as latest', () => {
    for (const bad of ['2026-13', '2026-00', '2026-02-30', '2025-02-29', '2026-04-31']) {
      expect(checkSeries(seriesDb([bad]))[0].detail).toMatch(new RegExp(`'${bad}' is not a valid`));
    }
  });

  it('passes a series that keeps one precision throughout, leap day included', () => {
    expect(checkSeries(seriesDb(['2026-03-01', '2026-11-01'])).every((c) => c.ok)).toBe(true);
    expect(checkSeries(seriesDb(['2024-05', '2025-05'])).every((c) => c.ok)).toBe(true);
    expect(checkSeries(seriesDb(['2023-02-28', '2024-02-29'])).every((c) => c.ok)).toBe(true);
  });

  it('does not compare a one-off against a series: differing precision across them is fine', () => {
    expect(checkSeries(seriesDb(['2024', '2026'], '2026-06-15')).every((c) => c.ok)).toBe(true);
  });
});

describe('emitReportsFile', () => {
  it('round-trips a fixture: H2s + prose preserved, entries re-extract identically', () => {
    const src = fixture('roundtrip.md', SAMPLE);
    const db = openDb();
    seedReports(db, extractReports(src));
    const regenPath = join(TMP, 'roundtrip.out.md');
    writeFileSync(regenPath, emitReportsFile(db, src));
    expect(extractReports(regenPath)).toEqual(extractReports(src));
  });

  it('throws a clear error when the source H3 count and DB report count disagree', () => {
    const oneEntry = `# Field Reports\n\n### [Only One](https://example.com/one)\n\n*Edition 2026, published 2026.*\n\nBody.\n`;
    const twoEntries = oneEntry + `\n### [A Second](https://example.com/two)\n\n*Edition 2024, published 2024.*\n\nBody two.\n`;
    const db = openDb();
    seedReports(db, extractReports(fixture('one.md', oneEntry)));
    expect(() => emitReportsFile(db, fixture('two.md', twoEntries))).toThrow(/source has 2 report ### entr\(ies\) but the DB has 1/);
  });
});

describe('the committed FieldReports.md (integration)', () => {
  let db: Db;
  const src = join(REPO_ROOT, 'FieldReports.md');
  beforeAll(() => { db = importNdjson(); });

  it('round-trips identically from the committed DB (db:verify as a test)', () => {
    const original = extractReports(src);
    expect(original.length).toBeGreaterThanOrEqual(2);
    const regenPath = join(TMP, 'FieldReports.committed.md');
    writeFileSync(regenPath, emitReportsFile(db, src));
    expect(extractReports(regenPath)).toEqual(original);
  });

  it('passes checkIntegrity (reports orphan/type) and checkSeries', () => {
    const reportGuards = checkIntegrity(db).filter((r) => r.label.includes('reports'));
    expect(reportGuards.length).toBeGreaterThanOrEqual(2);
    expect(reportGuards.every((r) => r.ok)).toBe(true);
    expect(checkSeries(db).every((c) => c.ok)).toBe(true);
  });
});
