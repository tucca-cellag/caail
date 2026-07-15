/**
 * dois-seed.test.ts — the DOI fold: curator-supplied associated-publication DOIs
 * seeded onto catalog + dataset_entries from the committed dois-manual.json (catalog by
 * url, datasets by ds: id, all `manual`), stored bare + lowercase. The DOI analog of
 * licenses-seed.test.ts.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { openDb, REPO_ROOT, type Db } from './lib.js';
import { extractCatalogEntries } from './extract.js';
import { seedCatalog, seedDois, bareDoi } from './seed.js';

describe('bareDoi', () => {
  it('strips the doi.org host, the doi: prefix, and lowercases', () => {
    expect(bareDoi('https://doi.org/10.1038/S41586-021-03819-2')).toBe('10.1038/s41586-021-03819-2');
    expect(bareDoi('https://dx.doi.org/10.1/X')).toBe('10.1/x');
    expect(bareDoi('doi:10.1/Y')).toBe('10.1/y');
    expect(bareDoi('10.1/Z')).toBe('10.1/z');
  });
  it('returns null for empty / whitespace input', () => {
    expect(bareDoi('')).toBeNull();
    expect(bareDoi('   ')).toBeNull();
  });
});

describe('seedDois (real corpus)', () => {
  let db: Db;
  let summary: { manual: number };
  beforeAll(() => {
    db = openDb();
    seedCatalog(db, extractCatalogEntries(join(REPO_ROOT, 'Software.md')), 'software');
    seedCatalog(db, extractCatalogEntries(join(REPO_ROOT, 'Databases.md')), 'database');
    summary = seedDois(db);
  });
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  it('seeds only manual DOIs (no auto resolver yet)', () => {
    expect(summary.manual).toBeGreaterThanOrEqual(0);
    expect(count("SELECT COUNT(*) n FROM catalog WHERE doi_source IS NOT NULL AND doi_source <> 'manual'")).toBe(0);
  });

  it('every doi_source has a doi value (the checkDois invariant)', () => {
    expect(count('SELECT COUNT(*) n FROM catalog WHERE doi_source IS NOT NULL AND doi IS NULL')).toBe(0);
  });

  it('stores DOIs bare + lowercase (no https://doi.org/ prefix, no uppercase)', () => {
    expect(count("SELECT COUNT(*) n FROM catalog WHERE doi LIKE 'http%' OR doi <> lower(doi)")).toBe(0);
  });
});
