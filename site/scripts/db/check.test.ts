/**
 * check.test.ts — proves the integrity/drift guards actually bite.
 *
 *   A. Unit: each guard flips to failing when its specific violation is injected
 *      (dangling FK, malformed id, unreachable primary, phantom/missing column).
 *   B. Integration: every guard passes on the real committed DB.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, importNdjson, type Db } from './lib.js';
import { checkIntegrity, checkReachability, checkColumnDrift, checkTopicTiers, checkCatalogHeadings, runChecks } from './check.js';

const failing = (results: { label: string; ok: boolean }[], match: RegExp) =>
  results.some((r) => match.test(r.label) && !r.ok);

/** Minimal, internally-consistent DB (FK enforcement off so tests can inject). */
function miniDb(): Db {
  const db = openDb();
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('INSERT INTO areas(key,label,header_md,ordinal) VALUES(?,?,?,?)')
    .run('media', 'Media Optimization', '[Media Optimization](./Taxonomy.md#media-optimization)', 0);
  db.prepare('INSERT INTO methods(label,header_md,ordinal) VALUES(?,?,?)')
    .run('Deep Learning', '[Deep Learning](./Taxonomy.md#deep-learning)', 0);
  db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)').run('paper:1', 'paper', '1');
  db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,code_url,data_url,ordinal) VALUES(?,?,?,?,?,?,?)')
    .run('paper:1', 1, 'References', '<a id="1">1</a> x', null, null, 0);
  db.prepare('INSERT INTO matrix_cells(method,area_key,ref_id,label,ordinal) VALUES(?,?,?,?,?)')
    .run('Deep Learning', 'media', 1, 'X', 0);
  return db;
}

// ---------------------------------------------------------------------------
// A. Unit — guards bite
// ---------------------------------------------------------------------------

describe('checkIntegrity', () => {
  it('passes on a consistent DB', () => {
    expect(checkIntegrity(miniDb()).every((r) => r.ok)).toBe(true);
  });
  it('flags a dangling matrix cell (FK violation)', () => {
    const db = miniDb();
    db.prepare('INSERT INTO matrix_cells(method,area_key,ref_id,label,ordinal) VALUES(?,?,?,?,?)')
      .run('Deep Learning', 'media', 999, 'ghost', 1); // ref_id 999 has no papers row
    expect(failing(checkIntegrity(db), /foreign-key/)).toBe(true);
  });
  it('flags a malformed / mistyped id', () => {
    const db = miniDb();
    db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)').run('not-namespaced', 'paper', '5');
    expect(failing(checkIntegrity(db), /namespaced/)).toBe(true);
  });
});

describe('checkReachability', () => {
  it('flags a primary reference cited by no matrix cell', () => {
    const db = miniDb();
    db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)').run('paper:2', 'paper', '2');
    db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,code_url,data_url,ordinal) VALUES(?,?,?,?,?,?,?)')
      .run('paper:2', 2, 'References', '<a id="2">2</a> y', null, null, 1); // never cited
    expect(failing(checkReachability(db), /cited/)).toBe(true);
  });
});

describe('checkColumnDrift', () => {
  const db = openDb();
  db.prepare('INSERT INTO areas(key,label,header_md,ordinal) VALUES(?,?,?,?)').run('media', 'Media Optimization', 'x', 0);
  db.prepare('INSERT INTO areas(key,label,header_md,ordinal) VALUES(?,?,?,?)').run('scaf', 'Scaffolding', 'x', 1);

  const fixtureRoot = (contributing: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-cols-'));
    writeFileSync(join(dir, 'CONTRIBUTING.md'), `Current matrix columns (research areas): ${contributing}.\n`);
    writeFileSync(join(dir, 'CLAUDE.md'), 'Current columns: Media Optimization, Scaffolding.\n');
    return dir;
  };

  it('passes when the prose column list matches the DB areas', () => {
    const res = checkColumnDrift(db, fixtureRoot('Media Optimization, Scaffolding'));
    expect(res.every((r) => r.ok)).toBe(true);
  });
  it('flags a phantom column (in prose, not in DB)', () => {
    const res = checkColumnDrift(db, fixtureRoot('Media Optimization, Scaffolding, Phantom'));
    expect(res.some((r) => /CONTRIBUTING/.test(r.label) && !r.ok)).toBe(true);
  });
  it('flags a missing column (in DB, not in prose)', () => {
    const res = checkColumnDrift(db, fixtureRoot('Media Optimization'));
    expect(res.some((r) => /CONTRIBUTING/.test(r.label) && !r.ok)).toBe(true);
  });
});

describe('checkTopicTiers', () => {
  it('passes on the real two-tier DB', () => {
    expect(checkTopicTiers(importNdjson()).every((r) => r.ok)).toBe(true);
  });
  it('flags a fine tag whose theme_slug is not a theme', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO items(id,type,slug) VALUES('topic:bad','topic','bad')").run();
    db.prepare("INSERT INTO topics(item_id,slug,label,tier,theme_slug,area_key) VALUES('topic:bad','bad','Bad','tag','no-theme',NULL)").run();
    expect(checkTopicTiers(db).some((r) => !r.ok && /parent theme/.test(r.label))).toBe(true);
  });
  it('schema CHECK rejects a theme that carries a theme_slug (even with FK off)', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO items(id,type,slug) VALUES('topic:y','topic','y')").run();
    expect(() => db.prepare("INSERT INTO topics(item_id,slug,label,tier,theme_slug,area_key) VALUES('topic:y','y','Y','theme','sensory-flavor',NULL)").run()).toThrow();
  });
  it('schema CHECK rejects a fine tag with a NULL theme_slug', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO items(id,type,slug) VALUES('topic:z','topic','z')").run();
    expect(() => db.prepare("INSERT INTO topics(item_id,slug,label,tier,theme_slug,area_key) VALUES('topic:z','z','Z','tag',NULL,NULL)").run()).toThrow();
  });
});

describe('checkCatalogHeadings', () => {
  const withCatalog = () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:tool','software','tool')").run();
    db.prepare("INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES('sw:tool','Tool','https://x','G','[Tool](https://x)','',0)").run();
    return db;
  };
  it('passes when name/url match the heading_md link (incl. a trailing annotation)', () => {
    const db = withCatalog();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('db:gnps','database','gnps')").run();
    db.prepare("INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES('db:gnps','GNPS','https://gnps','G','[GNPS](https://gnps) (cross-listed)','',1)").run();
    expect(checkCatalogHeadings(db).every((r) => r.ok)).toBe(true);
  });
  it('flags a url drifted from the heading_md link', () => {
    const db = withCatalog();
    db.prepare("UPDATE catalog SET url='https://DRIFTED' WHERE item_id='sw:tool'").run();
    expect(failing(checkCatalogHeadings(db), /name\/url match/)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Integration — the real committed DB passes every guard
// ---------------------------------------------------------------------------

describe('runChecks on the real corpus', () => {
  it('passes every guard', () => {
    const results = runChecks(importNdjson());
    const failed = results.filter((r) => !r.ok);
    expect(failed, failed.map((r) => `${r.label}: ${r.detail}`).join('; ')).toEqual([]);
  });
});
