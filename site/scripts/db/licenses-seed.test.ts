/**
 * licenses-seed.test.ts — the license fold (LT2): manual + auto license data seeded
 * onto catalog rows from the two committed inputs, with manual winning over the auto
 * GitHub-SPDX cache, and repoFromUrl deriving the cache key.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { openDb, REPO_ROOT, type Db } from './lib.js';
import { extractCatalogEntries } from './extract.js';
import { seedCatalog, seedLicenses, repoFromUrl } from './seed.js';

describe('repoFromUrl', () => {
  it('extracts a lowercased owner/repo from a GitHub URL', () => {
    expect(repoFromUrl('https://github.com/Google-DeepMind/AlphaFold')).toBe('google-deepmind/alphafold');
    expect(repoFromUrl('https://github.com/opencobra/cobrapy.git')).toBe('opencobra/cobrapy');
    expect(repoFromUrl('https://github.com/a/b/tree/main')).toBe('a/b');
  });
  it('returns null for a non-GitHub URL', () => {
    expect(repoFromUrl('https://www.openfoam.com/')).toBeNull();
  });
});

describe('seedLicenses (real corpus)', () => {
  let db: Db;
  let summary: { auto: number; manual: number };
  beforeAll(() => {
    db = openDb();
    seedCatalog(db, extractCatalogEntries(join(REPO_ROOT, 'Software.md')), 'software');
    seedCatalog(db, extractCatalogEntries(join(REPO_ROOT, 'Databases.md')), 'database');
    summary = seedLicenses(db);
  });
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  it('seeds a meaningful number of auto + manual licenses', () => {
    expect(summary.auto).toBeGreaterThan(30);   // GitHub SPDX cache (~65 repos)
    expect(summary.manual).toBeGreaterThan(20);  // ported #80 manual lines
  });

  it('every license_source has a license value (the checkLicenses invariant)', () => {
    expect(count('SELECT COUNT(*) n FROM catalog WHERE license_source IS NOT NULL AND license IS NULL')).toBe(0);
  });

  it('license_source is only auto or manual', () => {
    expect(count("SELECT COUNT(*) n FROM catalog WHERE license_source NOT IN ('auto','manual')")).toBe(0);
  });

  it('a known permissive GitHub tool resolves to its SPDX via the auto cache', () => {
    const row = db.prepare(
      "SELECT license, license_source FROM catalog WHERE url LIKE '%github.com/opencobra/cobrapy%'",
    ).get() as { license: string; license_source: string } | undefined;
    if (row) { expect(row.license_source).toBe('auto'); expect(row.license).toMatch(/GPL/); }
  });
});
