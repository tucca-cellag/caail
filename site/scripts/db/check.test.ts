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
import { checkIntegrity, checkReachability, checkColumnDrift, checkTopicTiers, checkCatalogHeadings, checkLicenses, checkManualLicenseKeys, checkDois, checkManualDoiKeys, runChecks } from './check.js';

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
  db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)')
    .run('paper:1', 1, 'References', '<a id="1">1</a> x', null, 0);
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
  it('flags a catalog item whose registry type is not software/database (C3-5)', () => {
    const db = miniDb(); // has paper:1 (type paper)
    db.prepare("INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES('paper:1','X','https://x','G','[X](https://x)','',0)").run();
    expect(failing(checkIntegrity(db), /catalog item is type/)).toBe(true);
  });
  it('flags a retired ref_id that is also live in papers (resurrection) (C14)', () => {
    const db = miniDb(); // paper:1 has ref_id 1
    db.prepare('INSERT INTO retired_paper_ids(ref_id) VALUES(1)').run(); // #1 tombstoned AND live
    expect(failing(checkIntegrity(db), /no retired ref_id is also live/)).toBe(true);
  });
  it('flags a dataset item present in NEITHER detail table', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('ds:ghost','dataset','ghost')").run();
    expect(failing(checkIntegrity(db), /in dataset_rows or dataset_entries/)).toBe(true);
  });
  it('flags a dataset item present in BOTH detail tables', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('ds:dup','dataset','dup')").run();
    db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,ordinal) VALUES('ds:dup','Cow','[]',0)").run();
    db.prepare("INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,ordinal) VALUES('ds:dup','Dup',NULL,'Cow','Featured atlases','atlas','Dup','',0)").run();
    expect(failing(checkIntegrity(db), /in both dataset_rows and dataset_entries/)).toBe(true);
  });
});

describe('checkReachability', () => {
  it('flags a primary reference cited by no matrix cell', () => {
    const db = miniDb();
    db.prepare('INSERT INTO items(id,type,slug) VALUES(?,?,?)').run('paper:2', 'paper', '2');
    db.prepare('INSERT INTO papers(item_id,ref_id,section,raw,blockquotes_md,ordinal) VALUES(?,?,?,?,?,?)')
      .run('paper:2', 2, 'References', '<a id="2">2</a> y', null, 1); // never cited
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
  it('returns a failing check (not an ENOENT crash) when a source file is missing', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'caail-nocols-'));
    const res = checkColumnDrift(db, emptyDir); // no CONTRIBUTING.md / CLAUDE.md present
    expect(res.every((r) => !r.ok)).toBe(true);
    expect(res.some((r) => /not found/.test(r.detail))).toBe(true);
  });
});

describe('checkLicenses', () => {
  it('passes on a DB with no license provenance set', () => {
    expect(checkLicenses(miniDb()).every((r) => r.ok)).toBe(true);
  });
  it('flags a catalog license_source with no license value', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:ghost','software','ghost')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,license,license_source,ordinal) " +
      "VALUES('sw:ghost','Ghost','https://x','G','[Ghost](https://x)','',NULL,'auto',0)",
    ).run();
    expect(failing(checkLicenses(db), /both set or both null/)).toBe(true);
  });
  it('flags a catalog license value with no source (would mislabel as auto)', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:orphan','software','orphan')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,license,license_source,ordinal) " +
      "VALUES('sw:orphan','Orphan','https://o','G','[Orphan](https://o)','','MIT',NULL,0)",
    ).run();
    expect(failing(checkLicenses(db), /both set or both null/)).toBe(true);
  });
  it('passes when license + source are both set', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:ok','software','ok')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,license,license_source,ordinal) " +
      "VALUES('sw:ok','Ok','https://y','G','[Ok](https://y)','','MIT','auto',0)",
    ).run();
    expect(checkLicenses(db).every((r) => r.ok)).toBe(true);
  });
});

describe('checkManualLicenseKeys', () => {
  const withCatalog = () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:tool','software','tool')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) " +
      "VALUES('sw:tool','Tool','https://tool.dev','G','[Tool](https://tool.dev)','',0)",
    ).run();
    return db;
  };
  const writeManual = (obj: unknown) => {
    const p = join(mkdtempSync(join(tmpdir(), 'caail-manlic-')), 'licenses-manual.json');
    writeFileSync(p, JSON.stringify(obj));
    return p;
  };

  it('is a no-op when the manual file is absent', () => {
    expect(checkManualLicenseKeys(miniDb(), join(tmpdir(), 'does-not-exist-manlic.json')).every((r) => r.ok)).toBe(true);
  });
  it('passes when every override url resolves to a catalog entry', () => {
    const path = writeManual({ catalog: { 'https://tool.dev': 'MIT' }, datasets: {} });
    expect(checkManualLicenseKeys(withCatalog(), path).every((r) => r.ok)).toBe(true);
  });
  it('flags a catalog override url that matches no entry (e.g. trailing-slash drift)', () => {
    const path = writeManual({ catalog: { 'https://tool.dev/': 'MIT' }, datasets: {} });
    expect(failing(checkManualLicenseKeys(withCatalog(), path), /catalog override url matches/)).toBe(true);
  });
  it('flags a datasets override id that matches no dataset entry', () => {
    const path = writeManual({ catalog: {}, datasets: { 'ds:ghost': 'CC-BY-4.0' } });
    expect(failing(checkManualLicenseKeys(withCatalog(), path), /datasets override id matches/)).toBe(true);
  });
});

describe('checkDois', () => {
  it('passes on a DB with no doi provenance set', () => {
    expect(checkDois(miniDb()).every((r) => r.ok)).toBe(true);
  });
  it('flags a catalog doi_source with no doi value', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:ghost','software','ghost')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,doi,doi_source,ordinal) " +
      "VALUES('sw:ghost','Ghost','https://x','G','[Ghost](https://x)','',NULL,'manual',0)",
    ).run();
    expect(failing(checkDois(db), /both set or both null/)).toBe(true);
  });
  it('flags a catalog doi value with no source', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:orphan','software','orphan')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,doi,doi_source,ordinal) " +
      "VALUES('sw:orphan','Orphan','https://o','G','[Orphan](https://o)','','10.1/x',NULL,0)",
    ).run();
    expect(failing(checkDois(db), /both set or both null/)).toBe(true);
  });
  it('passes when doi + source are both set', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:ok','software','ok')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,doi,doi_source,ordinal) " +
      "VALUES('sw:ok','Ok','https://y','G','[Ok](https://y)','','10.1/y','manual',0)",
    ).run();
    expect(checkDois(db).every((r) => r.ok)).toBe(true);
  });
});

describe('checkManualDoiKeys', () => {
  const withCatalog = () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('sw:tool','software','tool')").run();
    db.prepare(
      "INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) " +
      "VALUES('sw:tool','Tool','https://tool.dev','G','[Tool](https://tool.dev)','',0)",
    ).run();
    return db;
  };
  const writeManual = (obj: unknown) => {
    const p = join(mkdtempSync(join(tmpdir(), 'caail-mandoi-')), 'dois-manual.json');
    writeFileSync(p, JSON.stringify(obj));
    return p;
  };

  it('is a no-op when the manual file is absent', () => {
    expect(checkManualDoiKeys(miniDb(), join(tmpdir(), 'does-not-exist-mandoi.json')).every((r) => r.ok)).toBe(true);
  });
  it('passes when every override url resolves to a catalog entry', () => {
    const path = writeManual({ catalog: { 'https://tool.dev': '10.1/x' }, datasets: {} });
    expect(checkManualDoiKeys(withCatalog(), path).every((r) => r.ok)).toBe(true);
  });
  it('flags a catalog override url that matches no entry (e.g. trailing-slash drift)', () => {
    const path = writeManual({ catalog: { 'https://tool.dev/': '10.1/x' }, datasets: {} });
    expect(failing(checkManualDoiKeys(withCatalog(), path), /catalog override url matches/)).toBe(true);
  });
  it('flags a datasets override id that matches no dataset entry', () => {
    const path = writeManual({ catalog: {}, datasets: { 'ds:ghost': '10.1/y' } });
    expect(failing(checkManualDoiKeys(withCatalog(), path), /datasets override id matches/)).toBe(true);
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
  it('does not false-positive on a URL containing parentheses', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('db:wiki','database','wiki')").run();
    db.prepare("INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,ordinal) VALUES('db:wiki','Wiki','https://en.wikipedia.org/wiki/File_(system)','G','[Wiki](https://en.wikipedia.org/wiki/File_(system))','',0)").run();
    expect(checkCatalogHeadings(db).every((r) => r.ok)).toBe(true);
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
