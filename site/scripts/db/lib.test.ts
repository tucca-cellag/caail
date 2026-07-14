/**
 * lib.test.ts — the DB primitives: slug helpers, the NDJSON source contract, and
 * the FK-integrity gate on import.
 *
 *   A. Unit: slugify / frozenSlug / assignId; TABLES_PK covers every schema table;
 *      importNdjson rejects a foreign-key-broken source.
 *   B. Integration: the committed NDJSON round-trips idempotently (import -> export
 *      is byte-identical), so the tracked source is a stable fixed point.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  slugify, frozenSlug, assignId, TABLES_PK, SCHEMA_PATH, NDJSON_DIR,
  importNdjson, exportNdjson,
} from './lib.js';

// ---------------------------------------------------------------------------
// A. Unit
// ---------------------------------------------------------------------------

describe('slugify', () => {
  it('lowercases, hyphenates whitespace, and drops non-alphanumerics', () => {
    expect(slugify('AlphaFold')).toBe('alphafold');
    expect(slugify('GAN / VAE')).toBe('gan-vae');
    expect(slugify('Metabolic Modeling & Strain Design')).toBe('metabolic-modeling-strain-design');
  });
  it('collapses and trims stray hyphens', () => {
    expect(slugify('  a --- b  ')).toBe('a-b');
  });
});

describe('frozenSlug', () => {
  it('namespaces the slug and falls back to "entry" when empty', () => {
    expect(frozenSlug('CameoPy', 'sw')).toBe('sw:cameopy');
    expect(frozenSlug('***', 'db')).toBe('db:entry');
  });
});

describe('assignId', () => {
  it('keeps the base on first use and suffixes -2, -3 on collisions', () => {
    const seen = new Map<string, number>();
    expect(assignId(seen, 'sw:x')).toBe('sw:x');
    expect(assignId(seen, 'sw:x')).toBe('sw:x-2');
    expect(assignId(seen, 'sw:x')).toBe('sw:x-3');
    expect(assignId(seen, 'sw:y')).toBe('sw:y');
  });
});

describe('TABLES_PK', () => {
  it('lists every table declared in schema.sql (and no extras)', () => {
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    const declared = [...schema.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]).sort();
    expect(Object.keys(TABLES_PK).sort()).toEqual(declared);
  });
});

describe('importNdjson', () => {
  it('throws on a foreign-key-broken source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-badndjson-'));
    for (const table of Object.keys(TABLES_PK)) writeFileSync(join(dir, `${table}.ndjson`), '');
    // a papers row whose item_id has no matching items row -> FK violation
    writeFileSync(join(dir, 'papers.ndjson'),
      JSON.stringify({ item_id: 'paper:1', ref_id: 1, section: 'References', raw: 'x', code_url: null, data_url: null, ordinal: 0 }) + '\n');
    expect(() => importNdjson(dir)).toThrow(/foreign-key/i);
  });
});

// ---------------------------------------------------------------------------
// B. Integration — the committed NDJSON is an idempotent fixed point
// ---------------------------------------------------------------------------

describe('committed NDJSON round-trip', () => {
  it('import -> export reproduces byte-identical NDJSON', () => {
    const db = importNdjson(); // from committed NDJSON_DIR
    const out = mkdtempSync(join(tmpdir(), 'caail-ndjson-rt-'));
    exportNdjson(db, out);
    for (const file of readdirSync(out)) {
      expect(readFileSync(join(out, file), 'utf-8'),
        `${file} should be unchanged after import->export`)
        .toBe(readFileSync(join(NDJSON_DIR, file), 'utf-8'));
    }
  });
});
