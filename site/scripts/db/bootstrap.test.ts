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
import { preserveCuratedItemTopics } from './bootstrap.js';

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
