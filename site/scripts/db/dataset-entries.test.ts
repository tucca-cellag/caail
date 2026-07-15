/**
 * dataset-entries.test.ts — the curated `### …` dataset-entry ETL (T1): extract the
 * featured atlases / GEMs / reference entries out of the Datasets/ pages, and seed
 * them as first-class ds: records sharing the inventory-row id namespace.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { buildPapersModel } from '../parser/papers.js';
import { openDb, REPO_ROOT, type Db } from './lib.js';
import { extractDatasetEntries } from './extract.js';
import { seedPapers, seedDatasets } from './seed.js';

const CHICKEN = join(REPO_ROOT, 'Datasets', 'Chicken.md');
const HUMAN = join(REPO_ROOT, 'Datasets', 'HumanReference.md');

describe('extractDatasetEntries', () => {
  it('captures a featured atlas (linked, url present) and a GEM (unlinked, url null)', () => {
    const entries = extractDatasetEntries(CHICKEN);
    const atlas = entries.find((e) => e.name === 'ChickenGTEx-Portal');
    expect(atlas).toBeDefined();
    expect(atlas!.url).toBe('https://chicken.farmgtex.org/');
    expect(atlas!.section).toBe('Featured atlases');
    expect(atlas!.kind).toBe('atlas');

    const gem = entries.find((e) => e.name.startsWith('iES1300'));
    expect(gem).toBeDefined();
    expect(gem!.url).toBeNull(); // '### iES1300 — *Gallus gallus* (chicken)' has no link
    expect(gem!.kind).toBe('gem');
    expect(gem!.headingMd).toContain('*Gallus gallus*'); // emphasis preserved verbatim
  });

  it('never captures a `## Complete data inventory` row as an entry', () => {
    const entries = extractDatasetEntries(CHICKEN);
    expect(entries.every((e) => e.section !== 'Complete data inventory')).toBe(true);
  });

  it('captures every H3 on a reference page (all curated entries)', () => {
    const entries = extractDatasetEntries(HUMAN);
    expect(entries.length).toBeGreaterThanOrEqual(9);
    expect(entries.some((e) => e.name === 'Genecorpus-30M' && e.url?.includes('huggingface'))).toBe(true);
    // an unlinked reference GEM heading
    expect(entries.some((e) => e.name.startsWith('Recon3D') && e.url === null)).toBe(true);
  });

  it('folds nested H4 sub-sections into the parent H3 body, not separate/lost entries', () => {
    // Regression: `### Arc Virtual Cell Atlas` is an umbrella H3 with two nested
    // `#### Tahoe-100M` / `#### scBaseCount` sub-sections. The body-capture loop must break
    // only at the next H2/H3 — else the H4s are neither their own entries nor part of Arc's
    // body, silently vanishing from the DB (and the /topics/ hub) while emit's byte-offset
    // fallback masks the loss at the Markdown level.
    const entries = extractDatasetEntries(HUMAN);
    const arc = entries.find((e) => e.name === 'Arc Virtual Cell Atlas');
    expect(arc).toBeDefined();
    // The H4 sub-sections are NOT their own entries (only H3s are curated entries).
    expect(entries.some((e) => e.name === 'Tahoe-100M')).toBe(false);
    expect(entries.some((e) => e.name === 'scBaseCount')).toBe(false);
    // …and their content lives in the parent entry's body (was truncated at the first H4).
    expect(arc!.bodyMd).toContain('Tahoe-100M');
    expect(arc!.bodyMd).toContain('scBaseCount');
  });
});

describe('seedDatasets (rows + entries share the ds: namespace)', () => {
  let db: Db;
  beforeAll(() => {
    db = openDb();
    const papersPath = join(REPO_ROOT, 'Papers.md');
    seedPapers(db, buildPapersModel(papersPath), papersPath); // areas exist for FK
    seedDatasets(db);
  });

  const all = (sql: string) => db.prepare(sql).all() as any[];

  it('seeds >=1 curated entry with a nullable url and a valid kind', () => {
    const entries = all('SELECT * FROM dataset_entries');
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => ['atlas', 'gem', 'other'].includes(e.kind))).toBe(true);
    expect(entries.some((e) => e.url === null)).toBe(true); // GEM entries carry no url
  });

  it('assigns unique ds: ids across BOTH dataset_rows and dataset_entries', () => {
    const rowIds = all("SELECT item_id FROM dataset_rows").map((r) => r.item_id);
    const entryIds = all('SELECT item_id FROM dataset_entries').map((r) => r.item_id);
    const union = [...rowIds, ...entryIds];
    expect(new Set(union).size).toBe(union.length); // no collision
    expect(union.every((id) => id.startsWith('ds:'))).toBe(true);
  });

  it('every dataset item is in EXACTLY one of the two detail tables', () => {
    const both = all(
      `SELECT r.item_id FROM dataset_rows r JOIN dataset_entries e ON e.item_id = r.item_id`,
    );
    expect(both.length).toBe(0);
    const datasetItems = all("SELECT id FROM items WHERE type='dataset'").length;
    const rows = all('SELECT item_id FROM dataset_rows').length;
    const entries = all('SELECT item_id FROM dataset_entries').length;
    expect(rows + entries).toBe(datasetItems);
  });
});
