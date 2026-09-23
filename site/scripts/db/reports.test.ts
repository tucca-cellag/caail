/**
 * reports.test.ts — the field-reports pipeline (CAAIL-363 skeleton + CAAIL-364 series).
 *
 *   A. extractReports: series (H2) + editions (H3), the italic edition line, unlinked + one-off.
 *   B. seedReports: frozen `report:` ids, series/edition columns.
 *   C. emitReportsFile: block-splice round-trip (H2s + prose preserved) and the count guard.
 *   D. Integration: the committed FieldReports.md round-trips and passes checkIntegrity + checkSeries.
 *   E. edition_sort rules (CAAIL-373): checkSeries on nesting / duplicates / invalid dates, and
 *      extractReports refusing an invalid published date at seed time.
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
import { EDITION_SORT_RULE, parseReportsNdjson } from '../parser/reports.js';

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

describe('checkSeries edition_sort rules (CAAIL-373)', () => {
  /** A one-off at `oneoffSort`, then a series whose editions carry `sorts` (label = sort). */
  function seriesDb(sorts: string[], oneoffSort = '2025-06'): Db {
    const editions = sorts.map((s, i) =>
      `### [Example ${i}](https://example.com/${i})\n\n*Edition ${s}, published ${s}.*\n\nBody ${i}.\n`).join('\n');
    const md = `# Field Reports\n\n### A One-Off\n\n*Edition x, published ${oneoffSort}.*\n\nOne-off.\n\n` +
      `## Example Series\n\n${editions}`;
    const db = openDb();
    seedReports(db, extractReports(fixture(`series-${sorts.join('_')}-${oneoffSort}.md`, md)));
    return db;
  }
  /** extractReports now refuses an invalid sort, so one reaches db:check only via hand-edited NDJSON. */
  function withSort(db: Db, id: string, sort: string): Db {
    db.prepare('UPDATE reports SET edition_sort = ? WHERE item_id = ?').run(sort, id);
    return db;
  }

  it('fails a nested pair: a year cannot be ordered against a date inside it', () => {
    // String order puts '2026' first by prefix, so the year-only edition would lose "latest"
    // to the March one whichever was really published later.
    const [res] = checkSeries(seriesDb(['2026', '2026-03-01']));
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/series 'example-series': edition_sort 2026 \(report:example-0\) contains 2026-03-01 \(report:example-1\)/);
    // '2026-06' < '2026-06-01' < '2026-07' by prefix: the same ambiguity one precision down.
    expect(checkSeries(seriesDb(['2026-06', '2026-06-01']))[0].detail).toMatch(/2026-06 .* contains 2026-06-01/);
  });

  it('passes mixed precisions that do not nest, so historical YYYY editions need no rewrite', () => {
    // Every committed GFI series is year-only; its next edition may be dated without touching them.
    expect(checkSeries(seriesDb(['2024', '2025', '2026', '2027-03'])).every((c) => c.ok)).toBe(true);
    expect(checkSeries(seriesDb(['2025-11-30', '2026'])).every((c) => c.ok)).toBe(true);
  });

  it('fails two editions sharing a sort, at the max or below it', () => {
    expect(checkSeries(seriesDb(['2024', '2026', '2026']))[0].detail).toMatch(/share edition_sort 2026/);
    expect(checkSeries(seriesDb(['2024', '2024', '2026']))[0].detail).toMatch(/share edition_sort 2024/);
  });

  it('reports an invalid edition_sort once, and not also as a nest', () => {
    // '2026-6' starts with '2026-', so if it were not excluded it would also read as nesting in '2026'.
    const [res] = checkSeries(withSort(seriesDb(['2026', '2027']), 'report:example-1', '2026-6'));
    expect(res.ok).toBe(false);
    expect(res.detail).toMatch(/edition_sort "2026-6" is not a valid YYYY, YYYY-MM or YYYY-MM-DD date/);
    // Only the problem list, not the rule prose appended after it, which may itself use the word.
    expect(res.detail.split(EDITION_SORT_RULE)[0]).not.toMatch(/contains/);
  });

  it('rejects shape-valid but impossible dates, which would otherwise sort as latest', () => {
    for (const bad of ['2026-13', '2026-00', '2026-02-30', '2025-02-29', '2026-04-31']) {
      expect(checkSeries(withSort(seriesDb(['2026-01']), 'report:example-0', bad))[0].detail)
        .toMatch(new RegExp(`"${bad}" is not a valid`));
    }
  });

  it('carries the fix rule in its detail, since in CI it can be the first failure a curator sees', () => {
    const [res] = checkSeries(seriesDb(['2026', '2026-03-01']));
    expect(res.detail).toContain(EDITION_SORT_RULE);
    expect(checkSeries(seriesDb(['2025', '2026']))[0].detail).toBe('');
  });

  it('lists recency problems alongside empty labels rather than behind them', () => {
    const db = seriesDb(['2026', '2026-03-01']);
    db.prepare("UPDATE reports SET edition_label = '' WHERE item_id IN ('report:a-one-off', 'report:example-1')").run();
    const [res] = checkSeries(db);
    // Document order: the one-off's label, then example-1's label, then the series nest.
    expect(res.detail).toMatch(
      /report:a-one-off: missing or empty edition_label; report:example-1: missing or empty edition_label; .* contains /);
  });

  it('passes a well-formed series, leap day included', () => {
    expect(checkSeries(seriesDb(['2026-03-01', '2026-11-01'])).every((c) => c.ok)).toBe(true);
    expect(checkSeries(seriesDb(['2023-02-28', '2024-02-29'])).every((c) => c.ok)).toBe(true);
  });

  it('never compares a one-off against a series, even when the two would nest', () => {
    expect(checkSeries(seriesDb(['2024', '2026'], '2026-06-15')).every((c) => c.ok)).toBe(true);
  });
});

describe('extractReports edition_sort validation', () => {
  it('refuses a report whose published date is not a valid edition_sort, naming it', () => {
    const bad = `# Field Reports\n\n### [Bad Date](https://example.com/x)\n\n*Edition 2026, published June 2026.*\n\nBody.\n`;
    expect(() => extractReports(fixture('bad-sort.md', bad)))
      .toThrow(/"Bad Date" .*: edition_sort "June 2026" is not a valid YYYY, YYYY-MM or YYYY-MM-DD date/);
  });

  it('prints no fix instruction, since its callers (db:bootstrap, db:verify) need opposite fixes', () => {
    const bad = `# Field Reports\n\n### [Bad Date](https://example.com/x)\n\n*Edition 2026, published 2026-13.*\n\nBody.\n`;
    let message = '';
    try { extractReports(fixture('bad-sort-2.md', bad)); } catch (e) { message = (e as Error).message; }
    expect(message).toMatch(/Rules: seriesRecency in site\/scripts\/parser\/reports\.ts\.$/);
    // Derived from the constant, so a reworded rule cannot make this pass vacuously.
    for (const sentence of EDITION_SORT_RULE.split('. ')) expect(message).not.toContain(sentence);
  });

  it('parseReportsNdjson defaults exactly the reports columns schema.sql leaves nullable', () => {
    // Its default list is typed by hand beside schema.sql; this fails when the two disagree, e.g.
    // when the planned license/doi columns land on reports without a matching default.
    const cols = openDb().prepare('PRAGMA table_info(reports)').all() as { name: string; notnull: number; pk: number }[];
    const required = cols.filter((c) => c.notnull || c.pk);
    const nullable = cols.filter((c) => !c.notnull && !c.pk).map((c) => c.name).sort();
    const line = JSON.stringify(Object.fromEntries(required.map((c) => [c.name, c.name === 'ordinal' ? 0 : 'x'])));
    const [parsed] = parseReportsNdjson(line);
    const defaulted = Object.keys(parsed).filter((k) => !required.some((c) => c.name === k)).sort();
    expect(defaulted).toEqual(nullable);
  });

  it('reports every problem on the line, not only the first', () => {
    const both = `# Field Reports\n\n### [Both Bad](https://example.com/x)\n\n*Edition  , published 2026-13.*\n\nBody.\n`;
    expect(() => extractReports(fixture('both-bad.md', both)))
      .toThrow(/missing or empty edition_label, and edition_sort "2026-13" is not a valid/);
  });

  it('refuses a whitespace-only edition label at seed time, as it does a bad date', () => {
    const blank = `# Field Reports\n\n### [Blank Label](https://example.com/x)\n\n*Edition  , published 2026.*\n\nBody.\n`;
    expect(() => extractReports(fixture('blank-label.md', blank))).toThrow(/"Blank Label" .*: missing or empty edition_label/);
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
