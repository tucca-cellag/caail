/**
 * reports.test.ts — the field-reports pipeline skeleton (CAAIL-363).
 *
 *   A. extractReports: link-headed and unlinked H3 entries, with verbatim body slices.
 *   B. seedReports: frozen `report:` ids, registry rows, correct type.
 *   C. emitReportsFile: block-splice round-trip (prose preserved, entries from the DB)
 *      and the positional-count drift guard.
 *   D. Integration: the committed FieldReports.md round-trips (db:verify as a test), and
 *      its seeded item passes the checkIntegrity orphan/type/id guards.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, importNdjson, REPO_ROOT, type Db } from './lib.js';
import { extractReports } from './extract.js';
import { seedReports } from './seed.js';
import { emitReportsFile } from './emit.js';
import { checkIntegrity } from './check.js';

const TMP = mkdtempSync(join(tmpdir(), 'caail-reports-test-'));

/** Write a FieldReports.md fixture and return its path. */
function fixture(name: string, body: string): string {
  const p = join(TMP, name);
  writeFileSync(p, body);
  return p;
}

const SAMPLE = `# Field Reports

An intro paragraph that is narrative prose, not an entry, and must be preserved verbatim.

### [GFI State of the Industry](https://gfi.org/resource/state-of-the-industry-downloads/)

The Good Food Institute's annual reports across the cultivated, fermentation, and plant-based tracks.

### A Bare Unlinked Report

An entry whose heading carries no link, so its url is null (matching dataset_entries).
`;

describe('extractReports', () => {
  const entries = extractReports(fixture('extract.md', SAMPLE));

  it('finds every H3 entry in document order', () => {
    expect(entries.map((e) => e.name)).toEqual(['GFI State of the Industry', 'A Bare Unlinked Report']);
  });

  it('captures the link target, and null for an unlinked heading', () => {
    expect(entries[0].url).toBe('https://gfi.org/resource/state-of-the-industry-downloads/');
    expect(entries[1].url).toBeNull();
  });

  it('stores the full raw H3 markdown after "### " (GNPS fidelity)', () => {
    expect(entries[0].headingMd).toBe('[GFI State of the Industry](https://gfi.org/resource/state-of-the-industry-downloads/)');
    expect(entries[1].headingMd).toBe('A Bare Unlinked Report');
  });

  it('slices the body up to the next heading, and ignores the H1 + intro prose', () => {
    expect(entries[0].bodyMd).toContain("The Good Food Institute's annual reports");
    expect(entries[0].bodyMd).not.toContain('intro paragraph');
    expect(entries[1].bodyMd).toContain('null (matching dataset_entries)');
  });
});

describe('seedReports', () => {
  it('mints frozen `report:` ids and registers a type-report item', () => {
    const db = openDb();
    const n = seedReports(db, extractReports(fixture('seed.md', SAMPLE)));
    expect(n).toBe(2);
    const items = db.prepare("SELECT id,type,slug FROM items WHERE type='report' ORDER BY id").all() as
      { id: string; type: string; slug: string }[];
    expect(items).toEqual([
      { id: 'report:a-bare-unlinked-report', type: 'report', slug: 'a-bare-unlinked-report' },
      { id: 'report:gfi-state-of-the-industry', type: 'report', slug: 'gfi-state-of-the-industry' },
    ]);
    // The detail row references the registry item and preserves document order.
    const r = db.prepare("SELECT title,url,ordinal FROM reports WHERE item_id='report:gfi-state-of-the-industry'").get() as
      { title: string; url: string; ordinal: number };
    expect(r).toEqual({ title: 'GFI State of the Industry', url: 'https://gfi.org/resource/state-of-the-industry-downloads/', ordinal: 0 });
  });
});

describe('emitReportsFile', () => {
  it('round-trips a fixture: prose preserved verbatim, entries re-extract identically', () => {
    const src = fixture('roundtrip.md', SAMPLE);
    const db = openDb();
    seedReports(db, extractReports(src));
    const regenPath = join(TMP, 'roundtrip.out.md');
    writeFileSync(regenPath, emitReportsFile(db, src));
    expect(extractReports(regenPath)).toEqual(extractReports(src));
  });

  it('throws a clear, actionable error when the source H3 count and DB report count disagree', () => {
    // Seed ONE report, then emit against a TWO-entry source: the positional splice must fail
    // loud with both counts rather than mis-slice or crash on an undefined index.
    const oneEntry = `# Field Reports\n\n### [Only One](https://example.com/one)\n\nBody.\n`;
    const twoEntries = `# Field Reports\n\n### [Only One](https://example.com/one)\n\nBody.\n\n### [A Second](https://example.com/two)\n\nBody two.\n`;
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
    expect(original.length).toBeGreaterThanOrEqual(1);
    const regenPath = join(TMP, 'FieldReports.committed.md');
    writeFileSync(regenPath, emitReportsFile(db, src));
    expect(extractReports(regenPath)).toEqual(original);
  });

  it('every reports item has a registry row and is type report (checkIntegrity)', () => {
    const results = checkIntegrity(db);
    const reportGuards = results.filter((r) => r.label.includes('reports'));
    expect(reportGuards.length).toBeGreaterThanOrEqual(2); // orphan + type
    expect(reportGuards.every((r) => r.ok)).toBe(true);
  });
});
