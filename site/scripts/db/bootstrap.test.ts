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

describe('preserveCuratedItemTopics', () => {
  it('replaces the classifier-derived tags with the committed set (curation wins)', () => {
    const db = dbWith();
    const dir = tmp();
    writeFileSync(join(dir, 'item_topics.ndjson'), JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:media' }) + '\n');
    expect(preserveCuratedItemTopics(db, dir)).toBe(1);
    expect(tags(db)).toEqual([{ topic_id: 'topic:media' }]); // 'ai' replaced by the committed 'media'
  });
  it('keeps the classifier output on a first import (no committed file)', () => {
    const db = dbWith();
    expect(preserveCuratedItemTopics(db, tmp())).toBe(0); // empty dir → no item_topics.ndjson
    expect(tags(db)).toEqual([{ topic_id: 'topic:ai' }]);
  });
  it('throws on a committed tag referencing an unknown topic (vocabulary drift)', () => {
    const db = dbWith();
    const dir = tmp();
    writeFileSync(join(dir, 'item_topics.ndjson'), JSON.stringify({ item_id: 'sw:x', topic_id: 'topic:gone' }) + '\n');
    expect(() => preserveCuratedItemTopics(db, dir)).toThrow(/unknown item\/topic/);
  });
});
