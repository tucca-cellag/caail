/**
 * generate-data.test.ts — tests for the generateData() core function.
 *
 * Imports the pure core export; never triggers CLI side effects (the isMain
 * guard in generate-data.ts ensures the isMain branch never runs during import).
 *
 * Uses a fresh OS temp dir — never writes to the real src/content/data/.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

import { generateData } from './generate-data.js';
import { PapersDataSchema, CountsSchema, CatalogSchema, TalksSchema } from './types.js';

// ---------------------------------------------------------------------------
// Temp directory setup / teardown
// ---------------------------------------------------------------------------

const tmpDir = mkdtempSync(join(os.tmpdir(), 'caail-generate-data-'));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateData()', () => {
  // Run generateData once; subsequent assertions reuse the result.
  const result = generateData(tmpDir);

  it('returns an object with papersRefs and counts', () => {
    expect(result).toHaveProperty('papersRefs');
    expect(result).toHaveProperty('counts');
  });

  it('papersRefs === 193', () => {
    // 193 = current Papers.md reference count; bump when refs are added.
    expect(result.papersRefs).toBe(193);
  });

  it('counts.papers === 193', () => {
    // 193 = current Papers.md reference count; bump when refs are added.
    expect(result.counts.papers).toBe(193);
  });

  it('writes papers.json to the output directory', () => {
    expect(existsSync(join(tmpDir, 'papers.json'))).toBe(true);
  });

  it('writes counts.json to the output directory', () => {
    expect(existsSync(join(tmpDir, 'counts.json'))).toBe(true);
  });

  it('papers.json is valid JSON and passes PapersDataSchema', () => {
    const raw = readFileSync(join(tmpDir, 'papers.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = PapersDataSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('counts.json is valid JSON and passes CountsSchema', () => {
    const raw = readFileSync(join(tmpDir, 'counts.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const result = CountsSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('parsed papers.json has references.length === 193', () => {
    const raw = readFileSync(join(tmpDir, 'papers.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    // 193 = current Papers.md reference count; bump when refs are added.
    expect(parsed.references.length).toBe(193);
  });

  it('parsed counts.json has papers === 193', () => {
    const raw = readFileSync(join(tmpDir, 'counts.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    // 193 = current Papers.md reference count; bump when refs are added.
    expect(parsed.papers).toBe(193);
  });

  it('papers.json is pretty-printed (contains newlines)', () => {
    const raw = readFileSync(join(tmpDir, 'papers.json'), 'utf-8');
    expect(raw).toContain('\n');
  });

  it('counts.json is pretty-printed (contains newlines)', () => {
    const raw = readFileSync(join(tmpDir, 'counts.json'), 'utf-8');
    expect(raw).toContain('\n');
  });

  it('returns catalogEntries and talks tallies', () => {
    expect(result).toHaveProperty('catalogEntries');
    expect(result).toHaveProperty('talks');
    expect(result.catalogEntries).toBe(result.counts.software + result.counts.databases);
    expect(result.talks).toBe(result.counts.talks);
  });

  it('writes catalog.json (valid, passes CatalogSchema, counts match)', () => {
    const path = join(tmpDir, 'catalog.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(CatalogSchema.safeParse(parsed).success).toBe(true);
    expect(parsed.software.length).toBe(result.counts.software);
    expect(parsed.databases.length).toBe(result.counts.databases);
  });

  it('writes talks.json (valid, passes TalksSchema, count matches)', () => {
    const path = join(tmpDir, 'talks.json');
    expect(existsSync(path)).toBe(true);
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    expect(TalksSchema.safeParse(parsed).success).toBe(true);
    const items = parsed.sections.flatMap((s: { items: unknown[] }) => s.items);
    expect(items.length).toBe(result.counts.talks);
  });
});
