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
import { checkIntegrity, checkReachability, checkColumnDrift, checkTaxonomyAxes, checkTopicTiers, checkAxisBijection, checkCatalogHeadings, checkLicenses, checkManualLicenseKeys, checkDois, checkManualDoiKeys, checkRelatedDois, checkSubseries, checkRowTagParity, runChecks } from './check.js';
import { THEME_SLUGS } from './seed.js';

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

describe('checkTaxonomyAxes', () => {
  // The theme count is derived from the same backbone the guard compares against,
  // so this fixture cannot drift from THEME_SLUGS the way a literal 8 would.
  const themes = THEME_SLUGS.map((slug, i) => `### Theme ${i + 1} (${slug})\nBlurb ${i + 1}.\n`).join('\n');

  const taxonomyMd = (opts: {
    areas?: string[];
    methods?: string[];
    themeCount?: number;
    extraAreaDupe?: boolean;
  } = {}) => {
    const areas = opts.areas ?? ['Media Optimization'];
    const methods = opts.methods ?? ['Deep Learning'];
    const themeBlock = opts.themeCount === undefined
      ? themes
      : THEME_SLUGS.slice(0, opts.themeCount).map((s, i) => `### Theme ${i + 1} (${s})\nBlurb ${i + 1}.\n`).join('\n');
    return [
      '# Matrix taxonomy fixture',
      '',
      '## Research areas (columns)',
      '',
      ...areas.map((a) => `### ${a}\nColumn scope for ${a}. Out of scope: everything else.\n`),
      ...(opts.extraAreaDupe ? [`### ${areas[0]}\nA second definition of the same column.\n`] : []),
      '## AI/ML methods (rows)',
      '',
      ...methods.map((m) => `### ${m}\nMethod definition for ${m}.\n`),
      '## Subject themes (topic tags)',
      '',
      themeBlock,
    ].join('\n');
  };

  const fixtureRoot = (body: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-tax-'));
    writeFileSync(join(dir, 'Taxonomy.md'), body);
    return dir;
  };

  it('passes when every DB axis label is defined under its own H2', () => {
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(taxonomyMd()));
    expect(res.every((r) => r.ok)).toBe(true);
  });

  it('passes when a column and a theme share a label (the GH #133 case is legal)', () => {
    // 'Media Optimization' as both an area and a theme must not fail: sharing
    // across axes is the behaviour the axis keying exists to permit.
    const body = taxonomyMd().replace(
      `### Theme 1 (${THEME_SLUGS[0]})`,
      '### Media Optimization',
    );
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(body));
    expect(res.every((r) => r.ok)).toBe(true);
  });

  it('flags an area the DB has but Taxonomy.md does not define', () => {
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(taxonomyMd({ areas: ['Scaffolding'] })));
    expect(failing(res, /DB area/)).toBe(true);
    expect(res.some((r) => /Media Optimization/.test(r.detail))).toBe(true);
  });

  it('flags a method the DB has but Taxonomy.md does not define', () => {
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(taxonomyMd({ methods: ['GNN'] })));
    expect(failing(res, /DB method/)).toBe(true);
    expect(res.some((r) => /Deep Learning/.test(r.detail))).toBe(true);
  });

  it('flags a theme count that does not match the DB backbone', () => {
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(taxonomyMd({ themeCount: THEME_SLUGS.length - 1 })));
    expect(failing(res, /backbone themes/)).toBe(true);
  });

  it('reports a within-axis duplicate as a failing check, not a thrown error', () => {
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(taxonomyMd({ extraAreaDupe: true })));
    expect(failing(res, /exactly one axis/)).toBe(true);
    expect(res.some((r) => /defined twice/.test(r.detail))).toBe(true);
  });

  it('returns a failing check (not an ENOENT crash) when Taxonomy.md is missing', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'caail-notax-'));
    const res = checkTaxonomyAxes(miniDb(), emptyDir);
    expect(res.every((r) => !r.ok)).toBe(true);
    expect(res.some((r) => /not found/.test(r.detail))).toBe(true);
  });

  const FM = 'Foundation Models: Masked Language Modeling';
  const fmDb = () => {
    const db = miniDb();
    db.prepare('INSERT INTO methods(label,header_md,ordinal) VALUES(?,?,?)')
      .run(FM, `[${FM}](./Taxonomy.md#fm)`, 1);
    return db;
  };
  const withFmDef = (def: string) =>
    taxonomyMd({ methods: ['Deep Learning', FM] }).replace(`Method definition for ${FM}.`, def);

  it('passes when every Foundation Models row carries both shared clauses', () => {
    const res = checkTaxonomyAxes(fmDb(), fixtureRoot(withFmDef(
      'Pretrained models. Not a paper that merely invokes one. Raise it for re-audit instead.')));
    expect(res.every((r) => r.ok)).toBe(true);
  });

  it('flags a Foundation Models row missing the built-vs-called exclusion', () => {
    const res = checkTaxonomyAxes(fmDb(), fixtureRoot(withFmDef(
      'Pretrained models, and nothing about who may call them. Raise it for re-audit instead.')));
    expect(res.some((r) => !r.ok && /built-vs-called/.test(r.label))).toBe(true);
  });

  it('flags a Foundation Models row missing the raise-rather-than-unseat clause', () => {
    const res = checkTaxonomyAxes(fmDb(), fixtureRoot(withFmDef(
      'Pretrained models. Not a paper that merely invokes one.')));
    expect(res.some((r) => !r.ok && /raise-rather-than-unseat/.test(r.label))).toBe(true);
  });

  // The stated trade: the guard reads the DB's row list, so a corpus with no such
  // rows is silent rather than failing. Worth pinning, because the alternative
  // (assert at least one exists) would fail every fixture in this file.
  it('is silent, not failing, on a DB with no Foundation Models rows', () => {
    expect(checkTaxonomyAxes(miniDb(), fixtureRoot(taxonomyMd())).every((r) => r.ok)).toBe(true);
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

describe('checkRelatedDois', () => {
  const NOFILE = join(tmpdir(), 'no-such-dois-related.json'); // skip the file-key check; test the stored column
  const insCat = (db: Db, id: string, url: string, doi: string | null, related: string | null): void => {
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'software',?)").run(id, id.slice(3));
    db.prepare(
      'INSERT INTO catalog(item_id,name,url,grp,heading_md,body_md,doi,doi_source,related_dois,ordinal) ' +
      'VALUES(?,?,?,?,?,?,?,?,?,0)',
    ).run(id, 'N', url, 'G', `[N](${url})`, '', doi, doi ? 'manual' : null, related);
  };
  // The one stored-column result (the file-key checks are skipped with NOFILE).
  const relResult = (db: Db) => checkRelatedDois(db, NOFILE).find((r) => /valid bare arrays/.test(r.label))!;
  it('passes on a valid bare-lowercase related array', () => {
    const db = miniDb(); insCat(db, 'sw:a', 'https://a', '10.1234/x', '["10.1234/y","10.1234/z"]');
    expect(relResult(db).ok).toBe(true);
  });
  it('flags a related DOI that repeats the primary (double-count)', () => {
    const db = miniDb(); insCat(db, 'sw:b', 'https://b', '10.1234/x', '["10.1234/x"]');
    const r = relResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/repeats the primary/);
  });
  it('flags a malformed related DOI', () => {
    const db = miniDb(); insCat(db, 'sw:c', 'https://c', '10.1234/x', '["not-a-doi"]');
    const r = relResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/bad DOI/);
  });
  it('flags an uppercase related DOI', () => {
    const db = miniDb(); insCat(db, 'sw:e', 'https://e', '10.1234/x', '["10.1234/UPPER"]');
    const r = relResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/bad DOI/);
  });
  it('flags related_dois that is not a JSON array', () => {
    const db = miniDb(); insCat(db, 'sw:d', 'https://d', '10.1234/x', '{"a":1}');
    const r = relResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/not an array/);
  });
  it('flags a duplicate DOI within one array', () => {
    const db = miniDb(); insCat(db, 'sw:f', 'https://f', '10.1234/x', '["10.1234/y","10.1234/y"]');
    const r = relResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/duplicate/);
  });
  it('flags the same sibling DOI listed under two different resources (cross-resource double-count)', () => {
    const db = miniDb();
    insCat(db, 'db:g', 'https://g', '10.1234/g', '["10.1234/shared"]');
    insCat(db, 'db:h', 'https://h', '10.1234/h', '["10.1234/shared"]');
    const r = relResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/under 2 different resources/);
  });
  it('allows a dual-listed resource (same url) to share a related set', () => {
    const db = miniDb();
    insCat(db, 'sw:dual', 'https://dual', '10.1234/d', '["10.1234/sib"]');
    insCat(db, 'db:dual', 'https://dual', '10.1234/d', '["10.1234/sib"]'); // same url -> not a cross-resource dup
    expect(relResult(db).ok).toBe(true);
  });
});

describe('checkSubseries', () => {
  const NOFILE = join(tmpdir(), 'no-such-subseries.json'); // skip the file-key check; test the stored column
  const insRow = (db: Db, id: string, subseries: string | null): void => {
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset',?)").run(id, id.slice(3));
    db.prepare('INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES(?,?,?,?,0)')
      .run(id, 'Cow', '["a"]', subseries);
  };
  const subResult = (db: Db) => checkSubseries(db, NOFILE).find((r) => /valid accession arrays/.test(r.label))!;

  it('passes on a valid member array', () => {
    const db = miniDb(); insRow(db, 'ds:gse173199', '["GSE173196","GSE173198"]');
    expect(subResult(db).ok).toBe(true);
  });

  // The confusion that produced the defect: a SuperSeries accession reads like a dataset.
  it('flags a row listing itself as its own subseries', () => {
    const db = miniDb(); insRow(db, 'ds:gse173199', '["GSE173199"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/lists itself/);
  });

  it('flags a malformed accession', () => {
    const db = miniDb(); insRow(db, 'ds:gse1', '["not-an-accession"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/bad accession/);
  });

  it('flags a lowercase accession', () => {
    const db = miniDb(); insRow(db, 'ds:gse1', '["gse173198"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/bad accession/);
  });

  // The guard's allowlist had diverged from the id minter's, which accepts SRP and GSM.
  // 12 SRP rows exist in the corpus, so a curator recording one would have been told a
  // perfectly valid accession was malformed. Both now read one shared constant.
  it('accepts every accession family the id minter mints', () => {
    const db = miniDb();
    insRow(db, 'ds:parent', '["GSE1","GSM2","PRJNA3","SRP4","PXD5","CRA6","E-MTAB-7"]');
    expect(subResult(db).ok).toBe(true);
  });

  // rowAccession used to strip a trailing `-\d+`, reducing e-mtab-9622 to E-MTAB. Two
  // different ArrayExpress parents then keyed the same and a real conflict read as one.
  it('keeps hyphenated E-MTAB parents distinct', () => {
    const db = miniDb();
    insRow(db, 'ds:e-mtab-9622', '["GSE100"]');
    insRow(db, 'ds:e-mtab-1234', '["GSE100"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/claimed by 2 different parents/);
  });

  it('flags an E-MTAB row listing itself', () => {
    const db = miniDb(); insRow(db, 'ds:e-mtab-9622', '["E-MTAB-9622"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/lists itself/);
  });

  it('flags a duplicate member within one array', () => {
    const db = miniDb(); insRow(db, 'ds:gse1', '["GSE2","GSE2"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/duplicate member/);
  });

  it('flags subseries that is not a JSON array', () => {
    const db = miniDb(); insRow(db, 'ds:gse1', '{"a":1}');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/not an array/);
  });

  it('flags an empty array (NULL means "not a SuperSeries"; [] is ambiguous)', () => {
    const db = miniDb(); insRow(db, 'ds:gse1', '[]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/is empty/);
  });

  // A GEO subseries has exactly one parent, so two claims mean one of them is wrong.
  it('flags one member claimed by two different parent accessions', () => {
    const db = miniDb();
    insRow(db, 'ds:gse100', '["GSE999"]');
    insRow(db, 'ds:gse200', '["GSE999"]');
    const r = subResult(db); expect(r.ok).toBe(false); expect(r.detail).toMatch(/claimed by 2 different parents/);
  });

  // But one accession fanned out per species is still ONE parent, and must not trip that.
  it('allows the per-species fan-out of one accession to share a member list', () => {
    const db = miniDb();
    insRow(db, 'ds:gse158430', '["GSE158412"]');
    insRow(db, 'ds:gse158430-2', '["GSE158412"]'); // same GEO accession, different species page
    expect(subResult(db).ok).toBe(true);
  });

  it('flags a subseries.json key that matches no inventory row', () => {
    const db = miniDb(); insRow(db, 'ds:gse173199', '["GSE173198"]');
    const dir = mkdtempSync(join(tmpdir(), 'caail-subseries-'));
    const path = join(dir, 'subseries.json');
    writeFileSync(path, JSON.stringify({ datasets: { 'ds:nope': ['GSE1'] } }));
    const r = checkSubseries(db, path).find((x) => /every override id matches/.test(x.label))!;
    expect(r.ok).toBe(false); expect(r.detail).toMatch(/ds:nope/);
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

describe('checkRowTagParity', () => {
  it('passes on the real committed DB', () => {
    expect(checkRowTagParity(importNdjson()).every((r) => r.ok)).toBe(true);
  });

  it('flags a ref in the row that is missing the tag', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("DELETE FROM item_topics WHERE topic_id='topic:comparative-study' AND item_id='paper:253'").run();
    expect(checkRowTagParity(db).some((r) => !r.ok && /carries the/.test(r.label))).toBe(true);
  });

  it('flags a ref carrying the tag that is not in the row', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    // Ref 1 is a Genetic Algorithms paper and has no business in this row.
    db.prepare("INSERT INTO item_topics(item_id,topic_id) VALUES('paper:1','topic:comparative-study')").run();
    expect(checkRowTagParity(db).some((r) => !r.ok && /sits in the/.test(r.label))).toBe(true);
  });

  // The failure mode this guard is most likely to die of is not a bad pairing, it is a
  // rename: drop either side and a naive implementation compares two empty sets and
  // reports success forever. So the resolution of both sides is asserted first, and
  // that assertion is itself tested.
  it('fails loudly when the row it names no longer exists, rather than passing vacuously', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("DELETE FROM matrix_cells WHERE method='Comparative Studies'").run();
    db.prepare("DELETE FROM methods WHERE label='Comparative Studies'").run();
    const results = checkRowTagParity(db);
    expect(results.some((r) => !r.ok && /both resolve/.test(r.label))).toBe(true);
  });
});

describe('checkAxisBijection', () => {
  it('passes on the real committed DB', () => {
    expect(checkAxisBijection(importNdjson()).every((r) => r.ok)).toBe(true);
  });

  it('flags a theme that names no research area (the null area_key gap)', () => {
    // The exact hole this guard was added to close: checkTopicTiers only asserts a
    // NON-NULL area_key resolves, so it passes on this DB and this one must not.
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("UPDATE topics SET area_key=NULL WHERE slug='food-safety'").run();
    expect(checkTopicTiers(db).every((r) => r.ok)).toBe(true);
    expect(failing(checkAxisBijection(db), /names a research area/)).toBe(true);
  });

  it('flags a research area no theme names', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO areas(key,label,header_md,ordinal) VALUES('orphan','Orphan Column','x',99)").run();
    expect(failing(checkAxisBijection(db), /exactly one theme/)).toBe(true);
  });

  it('flags a research area named by two themes', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("UPDATE topics SET area_key='sensory' WHERE slug='food-safety'").run();
    expect(failing(checkAxisBijection(db), /exactly one theme/)).toBe(true);
  });

  it('flags a new column added without a ResearchAreas page mapping', () => {
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO areas(key,label,header_md,ordinal) VALUES('newcol','New Column','x',99)").run();
    expect(failing(checkAxisBijection(db), /covers exactly the DB areas/)).toBe(true);
  });

  it('flags a mapped page whose file is absent from disk', () => {
    const emptyRoot = mkdtempSync(join(tmpdir(), 'caail-nopages-'));
    expect(failing(checkAxisBijection(importNdjson(), emptyRoot), /page on disk/)).toBe(true);
  });

  it('flags seed THEMES drifting from the committed themes (the silent bootstrap revert)', () => {
    // Both halves of the real defect. A bootstrap re-creates the topic vocabulary from
    // THEMES, so a stale entry there overwrites curated data rather than failing:
    // an `area` that matches no area LABEL seeds area_key null, and a stale `label`
    // re-mints the theme under its old name. The label half is invisible to every
    // other guard here, which is why this one compares labels even though the
    // bijection assertion above deliberately does not.
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("UPDATE topics SET label='Bioprocess & Scale-Up' WHERE slug='bioprocess-scale-up'").run();
    expect(failing(checkAxisBijection(db), /seed THEMES reproduces/)).toBe(true);

    const db2 = importNdjson(); db2.exec('PRAGMA foreign_keys=OFF');
    db2.prepare("UPDATE topics SET area_key='sensory' WHERE slug='food-safety'").run();
    expect(failing(checkAxisBijection(db2), /seed THEMES reproduces/)).toBe(true);
  });

  it('flags the parser AREAS registry drifting from the DB areas', () => {
    // The silent one: parseMatrix warns and skips an unknown column header, so a column
    // present in the DB but missing from the parser orphans its refs with a green parse.
    const db = importNdjson(); db.exec('PRAGMA foreign_keys=OFF');
    db.prepare("INSERT INTO areas(key,label,header_md,ordinal) VALUES('newcol','New Column','x',99)").run();
    expect(failing(checkAxisBijection(db), /parser AREAS registry/)).toBe(true);
  });

  it('does not compare labels: the paired theme and column are deliberately named differently', () => {
    // Bioprocess is the pair that once shared a label and caused the taxonomy.json
    // overwrite. The names now differ on purpose, so a label-equality guard would
    // fail here on a correct repo. This asserts the guard joins on area_key instead.
    const db = importNdjson();
    const theme = db.prepare("SELECT label FROM topics WHERE slug='bioprocess-scale-up'").get() as { label: string };
    const area = db.prepare("SELECT label FROM areas WHERE key='bioprocess'").get() as { label: string };
    expect(theme.label).not.toBe(area.label);
    expect(checkAxisBijection(db).every((r) => r.ok)).toBe(true);
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
