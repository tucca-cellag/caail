/**
 * bootstrap.test.ts — preserveCuratedItemTopics (#100 option b): on a re-bootstrap the
 * committed item_topics (authored by db:add) must win over seedTopics' classifier output,
 * so re-running db:bootstrap can't silently revert topic curation.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, type Db } from './lib.js';
import { preserveCuratedItemTopics, preserveCuratedTopics } from './bootstrap.js';

/** A DB with a 2-topic vocabulary, one item, and a classifier-derived tag (→ ai). */
function dbWith(): Db {
  const db = openDb();
  for (const [id, slug, label] of [['topic:media', 'media', 'Media'], ['topic:ai', 'ai', 'AI']]) {
    db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)').run(id, 'topic', slug);
    db.prepare('INSERT INTO topics(item_id,slug,label,tier,theme_slug,area_key) VALUES(?,?,?,?,?,?)').run(id, slug, label, 'theme', null, null);
  }
  db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:x','software','x')").run();
  db.prepare("INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES('sw:x','X','https://x','G','[X](https://x)','',0)").run();
  db.prepare("INSERT INTO item_topics(item_id,topic_id) VALUES('sw:x','topic:ai')").run(); // the classifier's guess
  return db;
}
const tmp = () => mkdtempSync(join(tmpdir(), 'caail-bootstrap-'));
const tags = (db: Db) => db.prepare('SELECT topic_id FROM item_topics ORDER BY topic_id').all();

/** Add a second software item, classifier-tagged topic:ai, NOT in the committed snapshot. */
function addUntagged(db: Db): void {
  db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:y','software','y')").run();
  db.prepare("INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES('sw:y','Y','https://y','G','[Y](https://y)','',1)").run();
  db.prepare("INSERT INTO item_topics(item_id,topic_id) VALUES('sw:y','topic:ai')").run();
}
const tagsOf = (db: Db, id: string) => db.prepare('SELECT topic_id FROM item_topics WHERE item_id=? ORDER BY topic_id').all(id);

describe('preserveCuratedItemTopics', () => {
  it('replaces a curated item\'s classifier tags with the committed set (curation wins)', () => {
    const db = dbWith();
    const dir = tmp();
    writeFileSync(join(dir, 'item_topics.ndjson'), JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:media' }) + '\n');
    expect(preserveCuratedItemTopics(db, dir)).toBe(1);
    expect(tags(db)).toEqual([{ topic_id: 'topic:media' }]); // 'ai' replaced by the committed 'media'
  });
  it('keeps the classifier seed for an item ABSENT from the snapshot (per-item scope, not a whole-table wipe)', () => {
    const db = dbWith();
    addUntagged(db); // sw:y is classifier-tagged but not in the committed file
    const dir = tmp();
    writeFileSync(join(dir, 'item_topics.ndjson'), JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:media' }) + '\n');
    preserveCuratedItemTopics(db, dir);
    expect(tagsOf(db, 'sw:x')).toEqual([{ topic_id: 'topic:media' }]); // curated item replaced
    expect(tagsOf(db, 'sw:y')).toEqual([{ topic_id: 'topic:ai' }]); // untagged-in-snapshot item KEPT its seed
  });
  it('keeps the classifier output on a first import (no committed file)', () => {
    const db = dbWith();
    expect(preserveCuratedItemTopics(db, tmp())).toBe(0); // empty dir → no item_topics.ndjson
    expect(tags(db)).toEqual([{ topic_id: 'topic:ai' }]);
  });
  it('tolerates a stray blank line in the committed file', () => {
    const db = dbWith();
    const dir = tmp();
    writeFileSync(join(dir, 'item_topics.ndjson'),
      JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:media' }) + '\n\n' + JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:ai' }) + '\n');
    expect(() => preserveCuratedItemTopics(db, dir)).not.toThrow();
    expect(tags(db)).toEqual([{ topic_id: 'topic:ai' }, { topic_id: 'topic:media' }]);
  });
  it('throws on an unknown-ref tag and leaves item_topics UNCHANGED (validate before mutate)', () => {
    const db = dbWith();
    const dir = tmp();
    writeFileSync(join(dir, 'item_topics.ndjson'), JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:gone' }) + '\n');
    expect(() => preserveCuratedItemTopics(db, dir)).toThrow(/unknown item\/topic/);
    expect(tags(db)).toEqual([{ topic_id: 'topic:ai' }]); // original tag not wiped
  });
});

/** A committed topics.ndjson: the 2 backbone themes + one curator-minted fine tag under `ai`. */
function writeTopicsFile(dir: string, extra: object[] = []): void {
  const rows = [
    { item_id: 'topic:media', slug: 'media', label: 'Media', tier: 'theme', theme_slug: null, area_key: null },
    { item_id: 'topic:ai', slug: 'ai', label: 'AI', tier: 'theme', theme_slug: null, area_key: null },
    { item_id: 'topic:comparative-study', slug: 'comparative-study', label: 'Comparative studies', tier: 'tag', theme_slug: 'ai', area_key: null },
    ...extra,
  ];
  writeFileSync(join(dir, 'topics.ndjson'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

describe('preserveCuratedTopics (CAAIL-371)', () => {
  it('folds a curator-minted fine tag the seed vocabulary lacks (verbatim: tier + parent theme)', () => {
    const db = dbWith(); // seeds only the `media` + `ai` backbone themes
    const dir = tmp();
    writeTopicsFile(dir);
    expect(preserveCuratedTopics(db, dir)).toBe(1); // only comparative-study is missing
    const row = db.prepare("SELECT slug,tier,theme_slug FROM topics WHERE item_id='topic:comparative-study'").get();
    expect(row).toEqual({ slug: 'comparative-study', tier: 'tag', theme_slug: 'ai' });
  });

  it('is the fix: with the vocabulary folded first, an item tag on the minted topic no longer throws', () => {
    // The exact bug — a committed item_topics tag references a curator-minted topic the seed
    // vocabulary omits, so preserveCuratedItemTopics threw and aborted the whole bootstrap.
    const db = dbWith();
    const dir = tmp();
    writeTopicsFile(dir);
    writeFileSync(join(dir, 'item_topics.ndjson'), JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:comparative-study' }) + '\n');
    expect(() => preserveCuratedItemTopics(db, dir)).toThrow(/unknown item\/topic/); // before the fold: throws
    preserveCuratedTopics(db, dir); // the fix
    expect(() => preserveCuratedItemTopics(db, dir)).not.toThrow(); // after: resolves
    expect(tagsOf(db, 'sw:x')).toEqual([{ topic_id: 'topic:comparative-study' }]);
  });

  it('does not duplicate a topic the seed already created', () => {
    const db = dbWith();
    const dir = tmp();
    writeTopicsFile(dir);
    preserveCuratedTopics(db, dir);
    const n = (db.prepare("SELECT COUNT(*) c FROM topics WHERE slug='ai'").get() as { c: number }).c;
    expect(n).toBe(1); // the `ai` theme was already seeded, not re-inserted
  });

  it('folds nothing on a first import (no committed topics file)', () => {
    expect(preserveCuratedTopics(dbWith(), tmp())).toBe(0);
  });

  it('does NOT overwrite a seeded tag from committed (a seed.ts edit is not silently discarded)', () => {
    // A tag the seed already created, present in committed with a DRIFTED label. Insert-only means
    // the seeded row is left as seedTopics wrote it — committed does not win for a seeded tag.
    const db = dbWith();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('topic:seeded-tag','topic','seeded-tag')").run();
    db.prepare("INSERT INTO topics(item_id,slug,label,tier,theme_slug,area_key) VALUES('topic:seeded-tag','seeded-tag','Seed label','tag','ai',NULL)").run();
    const dir = tmp();
    writeTopicsFile(dir, [{ item_id: 'topic:seeded-tag', slug: 'seeded-tag', label: 'DRIFTED label', tier: 'tag', theme_slug: 'ai', area_key: null }]);
    expect(preserveCuratedTopics(db, dir)).toBe(1); // only comparative-study inserted; seeded-tag skipped
    const row = db.prepare("SELECT label FROM topics WHERE slug='seeded-tag'").get() as { label: string };
    expect(row.label).toBe('Seed label'); // NOT overwritten by the committed drift
  });

  it('throws on a genuinely orphaned tag (parent theme in NEITHER seed nor committed)', () => {
    const db = dbWith();
    const dir = tmp();
    writeTopicsFile(dir, [{ item_id: 'topic:orphan', slug: 'orphan', label: 'Orphan', tier: 'tag', theme_slug: 'ghost', area_key: null }]);
    expect(() => preserveCuratedTopics(db, dir)).toThrow(/not a known theme/);
  });

  it('throws on a fine tag carrying an area_key (a theme-only column)', () => {
    const db = dbWith();
    const dir = tmp();
    writeTopicsFile(dir, [{ item_id: 'topic:withareakey', slug: 'withareakey', label: 'X', tier: 'tag', theme_slug: 'ai', area_key: 'media' }]);
    expect(() => preserveCuratedTopics(db, dir)).toThrow(/carries an area_key/);
  });

  it('throws a clear message (not a raw UNIQUE error) when a tag slug collides with a theme slug', () => {
    const db = dbWith();
    const dir = tmp();
    writeTopicsFile(dir, [{ item_id: 'topic:ai', slug: 'ai', label: 'AI (as a tag)', tier: 'tag', theme_slug: 'media', area_key: null }]);
    expect(() => preserveCuratedTopics(db, dir)).toThrow(/collides with a theme slug/);
  });

  it('throws a clear message on a duplicate fine-tag slug (not a raw UNIQUE error mid-insert)', () => {
    const db = dbWith();
    const dir = tmp();
    writeTopicsFile(dir, [
      { item_id: 'topic:dup', slug: 'dup', label: 'Dup A', tier: 'tag', theme_slug: 'ai', area_key: null },
      { item_id: 'topic:dup-2', slug: 'dup', label: 'Dup B', tier: 'tag', theme_slug: 'ai', area_key: null },
    ]);
    expect(() => preserveCuratedTopics(db, dir)).toThrow(/duplicate fine-tag slug/);
  });

  it('counts bad ROWS, not messages: one row with two issues reports as 1 bad tag', () => {
    const db = dbWith();
    const dir = tmp();
    // A single row that both collides with a theme slug AND names an unknown theme → two issues.
    writeTopicsFile(dir, [{ item_id: 'topic:ai', slug: 'ai', label: 'X', tier: 'tag', theme_slug: 'ghost', area_key: null }]);
    expect(() => preserveCuratedTopics(db, dir)).toThrow(/1 committed fine tag\(s\)/);
  });
});
