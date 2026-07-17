/**
 * reseed-axes.test.ts — the license/DOI-only fold (issue #100). Proves the property
 * that distinguishes `db:reseed-axes` from `db:bootstrap`: it re-seeds the side axes
 * (license, doi) but leaves `item_topics` and catalog `ordinal`s byte-for-byte intact,
 * so folding a curated DOI/license never reverts `db:add` topic curation or renumbers.
 *
 * Runs against the committed NDJSON in memory; never writes files.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { importNdjson, type Db } from './lib.js';
import { reseedAxes } from './reseed-axes.js';

describe('reseedAxes (real corpus, in memory)', () => {
  let db: Db;
  let topicsBefore: string;
  let ordinalsBefore: string;
  let summary: ReturnType<typeof reseedAxes>;

  const topicsSnapshot = (d: Db) =>
    JSON.stringify(d.prepare('SELECT item_id, topic_id FROM item_topics ORDER BY item_id, topic_id').all());
  const ordinalsSnapshot = (d: Db) =>
    JSON.stringify(d.prepare('SELECT item_id, ordinal FROM catalog ORDER BY item_id').all());
  const num = (sql: string) => (db.prepare(sql).get() as { n: number }).n;

  beforeAll(() => {
    db = importNdjson(); // committed NDJSON -> :memory:
    topicsBefore = topicsSnapshot(db);
    ordinalsBefore = ordinalsSnapshot(db);
    summary = reseedAxes(db);
  });

  it('leaves item_topics untouched (no topic reversion, unlike db:bootstrap)', () => {
    expect(topicsSnapshot(db)).toBe(topicsBefore);
  });

  it('leaves catalog ordinals untouched (no renumbering, unlike db:bootstrap)', () => {
    expect(ordinalsSnapshot(db)).toBe(ordinalsBefore);
  });

  it('seeds the license + DOI axes (both present on the corpus)', () => {
    expect(summary.licenses.auto + summary.licenses.manual).toBeGreaterThan(0);
    expect(summary.dois.manual).toBeGreaterThan(0);
  });

  it('clears a stale value NOT backed by the manual file (reconciles a removal)', () => {
    // Simulates a curator deleting a bad override then re-folding: a plain re-seed
    // only UPDATEs keys still present, so without the clear step the retracted value
    // would persist. Use a fresh import so the shared `db` above is untouched.
    const fresh = importNdjson();
    const blank = fresh.prepare('SELECT item_id FROM catalog WHERE doi IS NULL LIMIT 1').get() as { item_id: string };
    fresh.prepare("UPDATE catalog SET doi='10.9999/stale-removed', doi_source='manual' WHERE item_id=?").run(blank.item_id);
    reseedAxes(fresh);
    const row = fresh.prepare('SELECT doi, doi_source FROM catalog WHERE item_id=?').get(blank.item_id) as { doi: string | null; doi_source: string | null };
    expect(row.doi).toBeNull();
    expect(row.doi_source).toBeNull();
  });

  it('is idempotent on the committed corpus (axes already folded → no value drift)', () => {
    // The committed NDJSON already has the seeded values, so a second pass is a no-op:
    // every license/doi row stays both-set-or-both-null (the db:check invariant).
    expect(num('SELECT COUNT(*) n FROM catalog WHERE (doi IS NULL) <> (doi_source IS NULL)')).toBe(0);
    expect(num('SELECT COUNT(*) n FROM catalog WHERE (license IS NULL) <> (license_source IS NULL)')).toBe(0);
    const before = topicsSnapshot(db);
    reseedAxes(db);
    expect(topicsSnapshot(db)).toBe(before);
  });
});
