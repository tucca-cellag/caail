/**
 * seed.test.ts — the topic auto-tag seed (the #78 cross-content payoff). Freshly
 * seeds the real corpus and asserts the shared subject axis it produces: canonical
 * topics span multiple content types, area topics tag their papers, every catalog
 * item is covered, and the alias map is consistent.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { buildPapersModel } from '../parser/papers.js';
import { openDb, REPO_ROOT, type Db } from './lib.js';
import { extractCatalogEntries } from './extract.js';
import { seedPapers, seedCatalog, seedDatasets, seedTopics } from './seed.js';

let db: Db;
let summary: { topics: number; tags: number };

beforeAll(() => {
  db = openDb();
  const papersPath = join(REPO_ROOT, 'Papers.md');
  seedPapers(db, buildPapersModel(papersPath), papersPath);
  seedCatalog(db, extractCatalogEntries(join(REPO_ROOT, 'Software.md')), 'software');
  seedCatalog(db, extractCatalogEntries(join(REPO_ROOT, 'Databases.md')), 'database');
  seedDatasets(db);
  summary = seedTopics(db);
});

const count = (sql: string, ...args: unknown[]) =>
  (db.prepare(sql).get(...(args as never[])) as { n: number }).n;

describe('seedTopics', () => {
  it('produces topics and tags', () => {
    expect(summary.topics).toBeGreaterThan(0);
    expect(summary.tags).toBeGreaterThan(0);
  });

  it('the metabolic-modeling topic spans >=3 content types (the cross-content hub)', () => {
    const types = count(
      "SELECT COUNT(DISTINCT i.type) n FROM item_topics it JOIN items i ON i.id=it.item_id WHERE it.topic_id='topic:metabolic-modeling'",
    );
    expect(types).toBeGreaterThanOrEqual(3);
  });

  it('an area topic links to its matrix area and tags papers in that area', () => {
    const area = db.prepare("SELECT area_key FROM topics WHERE item_id='topic:media-optimization'").get() as { area_key: string | null };
    expect(area?.area_key).toBeTruthy();
    const papers = count(
      "SELECT COUNT(*) n FROM item_topics it JOIN items i ON i.id=it.item_id WHERE it.topic_id='topic:media-optimization' AND i.type='paper'",
    );
    expect(papers).toBeGreaterThan(0);
  });

  it('every catalog item is tagged with >=1 topic (full coverage)', () => {
    const untagged = count(
      'SELECT COUNT(*) n FROM catalog c WHERE NOT EXISTS (SELECT 1 FROM item_topics it WHERE it.item_id=c.item_id)',
    );
    expect(untagged).toBe(0);
  });

  it('every alias resolves to an existing topic', () => {
    const dangling = count(
      'SELECT COUNT(*) n FROM aliases a WHERE NOT EXISTS (SELECT 1 FROM topics t WHERE t.item_id=a.topic_id)',
    );
    expect(dangling).toBe(0);
  });

  it('supports multi-tagging (some item carries >1 topic)', () => {
    const maxTags = count('SELECT MAX(c) n FROM (SELECT COUNT(*) c FROM item_topics GROUP BY item_id)');
    expect(maxTags).toBeGreaterThan(1);
  });
});
