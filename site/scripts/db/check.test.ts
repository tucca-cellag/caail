/**
 * check.test.ts — proves the integrity/drift guards actually bite.
 *
 *   A. Unit: each guard flips to failing when its specific violation is injected
 *      (dangling FK, malformed id, unreachable primary, phantom/missing column).
 *   B. Integration: every guard passes on the real committed DB.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, importNdjson, REPO_ROOT, ACCESSION_SOURCE, type Db } from './lib.js';
import { checkIntegrity, checkReachability, checkColumnDrift, checkTaxonomyAxes, checkTopicTiers, checkAxisBijection, checkCatalogHeadings, checkLicenses, checkManualLicenseKeys, checkDois, checkManualDoiKeys, checkRelatedDois, checkSubseries, checkRowTagParity, checkFineTagSeedDrift, checkInventoryCells, INVENTORY_CELLS_LABEL, INVENTORY_CELLS_SHOWN, checkInventoryPages, INVENTORY_PAGES_LABEL, checkEntryRowTwins, ENTRY_ROW_TWINS_LABEL, checkAccessions, ACCESSIONS_LABEL, ACCESSION_FAMILIES, checkDataLinks, DATA_LINKS_LABEL, runChecks } from './check.js';
import { NON_DEPOSIT_LABELS, parseRowCells, readInventoryHeader, STATUS_WORDS, SUPPLEMENT_PREFIX } from '../parser/dataset-inventory.js';
import { THEME_SLUGS, FINE_TAGS } from './seed.js';

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
      // The methods preamble is part of a real Taxonomy.md, not decoration: it
      // states the contribution principle and names which rows restate it, and
      // checkTaxonomyAxes reads that line rather than holding its own list. A
      // fixture without it fails the same way the real file would, which is the
      // point. Only the FIRST method carries a clause and only it is named, so
      // `withFmDef`'s exact-string replace on the others still works.
      'A row records what a paper contributed, not what appears in its methods section.',
      '',
      `**Rows that restate it:** ${methods[0]}.`,
      '',
      ...methods.map((m, i) => `### ${m}\nMethod definition for ${m}.`
        + `${i === 0 ? ' Not a paper that merely invokes one.' : ''}\n`),
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

  it('passes when a column and a theme share a label (the tucca-cellag/caail#133 case is legal)', () => {
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

  // The contribution principle. Unlike the FM clauses above, these assert about the
  // FILE rather than about DB contents, so absence is a failure rather than silence:
  // a Taxonomy.md with no principle is the defect, not an empty corpus.
  it('flags a methods preamble that no longer states the contribution principle', () => {
    const body = taxonomyMd().replace(
      'A row records what a paper contributed', 'A row records something else');
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(body));
    expect(res.some((r) => !r.ok && /contribution principle/.test(r.label))).toBe(true);
  });

  // The vacuity probe, and it is the one that earns its keep. Delete the scope line
  // and the DERIVED row list is empty, so "every named row carries its clause" is
  // vacuously true and stays green while checking nothing. Without this assertion,
  // one deleted line silently disables the check below it.
  it('flags a missing scope line rather than passing vacuously', () => {
    const body = taxonomyMd().replace('**Rows that restate it:** Deep Learning.', '');
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(body));
    expect(res.some((r) => !r.ok && /names at least one row/.test(r.label))).toBe(true);
    // The per-row check is still green, which is exactly why the probe above exists.
    expect(res.some((r) => r.ok && /carries its contribution clause/.test(r.label))).toBe(true);
  });

  // Also the derivation test, which is why it uses `Deep Learning`. That label is
  // named nowhere in check.ts's logic — its only appearance there is inside a
  // comment — so the row is in scope solely because the fixture's scope line names
  // it. If the guard held its own list, this would pass while the row went
  // unchecked, and the list would be the second hand-typed copy the FM comment
  // above refuses to create.
  it('flags a named row whose definition dropped its contribution clause', () => {
    const body = taxonomyMd().replace(' Not a paper that merely invokes one.', '');
    const res = checkTaxonomyAxes(miniDb(), fixtureRoot(body));
    expect(res.some((r) => !r.ok && /carries its contribution clause/.test(r.label))).toBe(true);
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

describe('checkFineTagSeedDrift (tucca-cellag/caail-planning#339)', () => {
  it('passes on the committed corpus (seed.ts FINE_TAGS == committed topics)', () => {
    expect(checkFineTagSeedDrift(importNdjson()).every((r) => r.ok)).toBe(true);
  });
  it('bites when a seeded fine tag label drifts from seed.ts in the committed DB', () => {
    const db = importNdjson();
    const f = FINE_TAGS[0];
    db.prepare('UPDATE topics SET label=? WHERE slug=?').run(`${f.label} DRIFTED`, f.slug);
    expect(failing(checkFineTagSeedDrift(db), /fine tags:/)).toBe(true);
  });
  it('bites when a seeded fine tag is missing from the committed DB', () => {
    const db = importNdjson();
    const f = FINE_TAGS[0];
    // Detach the topic row (FK off so the item row can stay) to simulate a curator removing it.
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare('DELETE FROM topics WHERE slug=?').run(f.slug);
    expect(failing(checkFineTagSeedDrift(db), /fine tags:/)).toBe(true);
  });
});

describe('checkInventoryCells (tucca-cellag/caail-planning#740)', () => {
  const SPECIES = ['Study', 'Paper', 'Data', 'Type', 'Tissue', 'Description', 'Size', 'Area of research'];
  // Data at a position no real page uses, so reading the cell by index rather than by label fails.
  const SHIFTED = ['Study', 'Species', 'Paper', 'Data', 'Description'];
  // The table CrossSpecies carried before its rows went (tucca-cellag/caail-planning#752): a link
  // column, but no Data column, which no page may use now.
  const LINK_ONLY = ['Resource', 'Year', 'Format', 'Scope', 'DOI / URL', 'License'];
  const headers: Record<string, string[]> = {
    Cow: SPECIES, Shifted: SHIFTED, LinkOnly: LINK_ONLY, Odd: ['Study', 'Notes'],
  };
  const headerFor = (page: string) => (headers[page] ? { header: headers[page]! } : { problem: `Datasets/${page}.md does not exist` });
  const BADGE = '[`GSE1`](https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE1)';
  const cellsFor = (header: string[], cells: Record<string, string>): string[] => header.map((h) => cells[h] ?? 'x');
  const insRow = (db: Db, id: string, page: string, cells: string[]): void => {
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset',?)").run(id, id.slice(3));
    db.prepare('INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES(?,?,?,NULL,0)')
      .run(id, page, JSON.stringify(cells));
  };
  const result = (db: Db) => checkInventoryCells(db, undefined, headerFor).find((r) => r.label === INVENTORY_CELLS_LABEL)!;
  const withRow = (page: string, cells: Record<string, string>) => {
    const db = miniDb(); insRow(db, 'ds:study-a', page, cellsFor(headers[page]!, cells)); return result(db);
  };

  it('rejects a Data cell reading "on request", naming the row and the cell', () => {
    const r = withRow('Cow', { Data: 'on request' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ds:study-a');
    expect(r.detail).toContain('on request');
  });

  it('rejects the retired status words, a bare accession and an empty cell', () => {
    for (const data of ['none named', 'see paper', 'GSE1', '']) expect(withRow('Cow', { Data: data }).ok, data).toBe(false);
  });

  it('rejects a Data cell that links a paper rather than a deposit, and says where each fix goes', () => {
    const r = withRow('Cow', { Data: '[DOI](https://doi.org/10.1038/s41586-020-0001-1)' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('Paper cell');
    // A real deposit on a host the registrant list lacks fails too; the reason names the list to extend.
    expect(withRow('Cow', { Data: '[MassIVE](https://doi.org/10.25345/C5XYZ)' }).detail).toContain('DATA_REPOSITORY_REGISTRANTS');
  });

  it('rejects a link that is not to an http(s) address, or that wraps a status word', () => {
    for (const data of [
      '[on request](mailto:author@example.org)', '[Zenodo](#)', '[`GSE1`](geo/GSE1)',
      '[unavailable](https://example.org/embargo)', '[supplementary](https://example.org/s1.xlsx)',
    ]) {
      expect(withRow('Cow', { Data: data }).ok, data).toBe(false);
    }
    expect(withRow('Cow', { Data: '[Zenodo](mailto:author@example.org)' }).detail).toContain('http(s)');
    expect(withRow('Cow', { Data: '[supplementary](https://example.org/s1.xlsx)' }).detail).toContain('status word');
  });

  it('rejects a web link whose whole label names no deposit', () => {
    for (const data of ['[see paper](https://www.nature.com/articles/x)', '[None named](https://example.org)']) {
      const r = withRow('Cow', { Data: data });
      expect(r.ok, data).toBe(false);
      expect(r.detail, data).toContain('names no deposit');
    }
  });

  it('rejects a status word in the wrong case, and says so', () => {
    const r = withRow('Cow', { Data: 'Unavailable' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('write "unavailable"');
  });

  it('refuses a cell that is not a string, which the API build would crash on', () => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES('ds:study-n','dataset','study-n')").run();
    db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:study-n','Cow',?,NULL,0)")
      .run(JSON.stringify(['A', 'none named', 'supplementary', null, 'x', 'x', 'x', 'x']));
    const r = result(db);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('not a string');
  });

  it('reports a page-level problem once, however many rows the page has', () => {
    const db = miniDb();
    for (const id of ['ds:n1', 'ds:n2', 'ds:n3']) insRow(db, id, 'Nowhere', ['a', 'b']);
    for (const id of ['ds:o1', 'ds:o2']) insRow(db, id, 'Odd', ['a', 'b']);
    expect(result(db).detail).toMatch(/^2 problem\(s\):/);
  });

  it('points a supplement-labelled link at the bare word "supplementary"', () => {
    const r = withRow('Cow', { Data: '[Supplementary Table S1](https://www.nature.com/articles/x#MOESM1)' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('bare word "supplementary"');
  });

  it('judges any other label by shape alone, words inside it included', () => {
    // A word rule refused real deposits ("request via DAC") while passing "Embargoed"; the
    // guard checks shape, not truth, so these pass and curation catches the mislabelled ones.
    for (const data of [
      '[EGA (controlled access, request via DAC)](https://ega-archive.org/studies/EGAS00001000001)',
      '[upon request](https://lab.example.org)', '[on request](https://lab.example.org/contact)', '[Embargoed](https://example.org)',
    ]) {
      expect(withRow('Cow', { Data: data }).ok, data).toBe(true);
    }
  });

  it('rejects a badge whose text is more than one identifier', () => {
    const r = withRow('Cow', { Data: '[`see Table 2`](https://www.nature.com/articles/x)' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('not one identifier');
    expect(withRow('Cow', { Data: '[`OpenML-505`](https://www.openml.org/d/505)' }).ok).toBe(true);
  });

  it('names the one-link form for a link-shaped cell it cannot read, whatever the cause', () => {
    for (const data of [
      '[Zenodo](https://zenodo.org/records/a b)', '[`GSE1`](https://a.org), [`GSE2`](https://b.org)',
      '[Zenodo `v2`](https://zenodo.org/records/1)', '[Zenodo](https://zenodo.org/records/1) (v2)',
      '[`GSE1`](https://www.ncbi.nlm.nih.gov/geo "GEO")',
    ]) {
      expect(withRow('Cow', { Data: data }).detail, data).toContain('is not one link in a form the parser reads');
    }
  });

  it('calls an empty label an empty label', () => {
    expect(withRow('Cow', { Data: '[](https://zenodo.org/records/1)' }).detail).toContain('is a link with no text');
  });

  it('reports cell-count mismatches once per page, with the number of rows', () => {
    const db = miniDb();
    for (const id of ['ds:c1', 'ds:c2', 'ds:c3']) insRow(db, id, 'Cow', [BADGE]);
    expect(result(db).detail).toMatch(/^1 problem\(s\): page Cow: 3 row\(s\) have a cell count other than its 8 columns \(first ds:c1 has 1\)/);
  });

  it('rejects a link with blank text, or to an address with no host', () => {
    expect(withRow('Cow', { Data: '[ ](https://example.org)' }).detail).toContain('no text');
    expect(withRow('Cow', { Data: '[Zenodo](https://)' }).detail).toContain('with a host');
  });

  it('says when cells_json is not an array, rather than reporting a count mismatch', () => {
    for (const json of ['{}', 'null', '"x"']) {
      const db = miniDb();
      db.prepare("INSERT INTO items(id,type,slug) VALUES('ds:study-j','dataset','study-j')").run();
      db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:study-j','Cow',?,NULL,0)").run(json);
      expect(result(db).detail, json).toContain('not an array');
    }
  });

  it('builds its label from the status words, quoted as literals, so a new word cannot leave it stale', () => {
    for (const word of STATUS_WORDS) expect(INVENTORY_CELLS_LABEL).toContain(`"${word}"`);
  });

  it('reads stored cells through parseRowCells, which the API build shares', () => {
    expect(parseRowCells('{}')).toEqual({ problem: 'cells_json is not an array' });
    expect(parseRowCells('[1, "a"]')).toEqual({ problem: 'cells_json holds a cell that is not a string' });
    expect(parseRowCells('not json')).toEqual({ problem: 'cells_json is not JSON' });
    expect(parseRowCells('["a", "b"]')).toEqual({ cells: ['a', 'b'] });
  });

  it('agrees with Datasets/CLAUDE.md, whose Data bullet names every status word', () => {
    const doc = readFileSync(join(REPO_ROOT, 'Datasets', 'CLAUDE.md'), 'utf8');
    const bullet = doc.split('\n').find((l) => l.trimStart().startsWith('- **Data**'));
    expect(bullet, 'the Data bullet in Datasets/CLAUDE.md').toBeDefined();
    for (const word of STATUS_WORDS) expect(bullet, word).toContain(`\`${word}\``);
  });

  it('agrees with Datasets/CLAUDE.md on every label it refuses', () => {
    const doc = readFileSync(join(REPO_ROOT, 'Datasets', 'CLAUDE.md'), 'utf8');
    const bullet = doc.split('\n').find((l) => l.includes('**The Data vocabulary is checked.**'));
    expect(bullet, 'the "vocabulary is checked" bullet in Datasets/CLAUDE.md').toBeDefined();
    for (const label of [...NON_DEPOSIT_LABELS, SUPPLEMENT_PREFIX]) expect(bullet, label).toContain(`\`${label}\``);
  });

  it('accepts an accession badge, a named repository link and both status words', () => {
    for (const data of [BADGE, '[Zenodo](https://zenodo.org/records/1)', 'supplementary', 'unavailable']) {
      expect(withRow('Cow', { Data: data }).ok, data).toBe(true);
    }
  });

  it('finds the Data cell by its header label, not its position', () => {
    expect(withRow('Shifted', { Paper: BADGE, Data: 'on request' }).ok).toBe(false);
    expect(withRow('Shifted', { Paper: 'none named', Data: BADGE }).ok).toBe(true);
  });

  it(`names up to ${INVENTORY_CELLS_SHOWN} problems and counts them all`, () => {
    const db = miniDb();
    for (let i = 0; i < 12; i++) insRow(db, `ds:study-${String(i).padStart(2, '0')}`, 'Cow', cellsFor(SPECIES, { Data: 'on request' }));
    const r = result(db);
    expect(r.detail).toMatch(/^12 problem\(s\), first 10:/);
    expect(r.detail).toContain('ds:study-09');
    expect(r.detail).not.toContain('ds:study-10');
  });

  it('reads the header through readInventoryHeader, which refuses a repeated label', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-inv-'));
    mkdirSync(join(root, 'Datasets'));
    writeFileSync(join(root, 'Datasets', 'Dup.md'),
      '# Dup\n\n## Complete data inventory\n\n| Study | Data | Data |\n| --- | --- | --- |\n| A | on request | supplementary |\n');
    writeFileSync(join(root, 'Datasets', 'NoTable.md'), '# NoTable\n\nNo inventory yet.\n');
    // Each cause carries its own remedy, for the build error and the guard alike.
    expect(readInventoryHeader('Dup', root)).toEqual({ problem: expect.stringContaining('rename the duplicate') });
    expect(readInventoryHeader('Missing', root)).toEqual({ problem: expect.stringContaining('does not exist: restore the page') });
    expect(readInventoryHeader('NoTable', root)).toEqual({ problem: expect.stringContaining('restore the heading and table') });
    const db = miniDb(); insRow(db, 'ds:study-d', 'Dup', ['A', 'on request', 'supplementary']);
    const r = checkInventoryCells(db, root).find((x) => x.label === INVENTORY_CELLS_LABEL)!;
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('repeats a column label');
  });

  it('fails a page whose inventory has no Data column, rather than skipping it', () => {
    const r = withRow('Odd', {});
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('page Odd: has no Data column');
  });

  it('fails a link-column table with no Data column, the shape CrossSpecies carried, however good its link', () => {
    const r = withRow('LinkOnly', { 'DOI / URL': '[10.5281/zenodo.1](https://doi.org/10.5281/zenodo.1)' });
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('page LinkOnly: has no Data column');
  });

  it('fails a row on a page with no inventory table, and a row whose cell count differs from its header', () => {
    const noTable = miniDb(); insRow(noTable, 'ds:study-b', 'Nowhere', ['a', 'b']);
    expect(result(noTable).ok).toBe(false);
    const short = miniDb(); insRow(short, 'ds:study-c', 'Cow', [BADGE]);
    expect(result(short).ok).toBe(false);
  });
});

describe('checkInventoryPages (tucca-cellag/caail-planning#752)', () => {
  const TABLE = '## Complete data inventory\n\n| Study | Paper | Data |\n| --- | --- | --- |\n| A | none named | supplementary |\n';
  const rootWith = (pages: Record<string, string>): string => {
    const root = mkdtempSync(join(tmpdir(), 'caail-inv-pages-'));
    mkdirSync(join(root, 'Datasets'));
    for (const [page, body] of Object.entries(pages)) writeFileSync(join(root, 'Datasets', `${page}.md`), `# ${page}\n\n${body}`);
    return root;
  };
  const result = (root: string) => checkInventoryPages(root).find((r) => r.label === INVENTORY_PAGES_LABEL)!;

  it('fails an inventory table on a page outside INVENTORY_PAGES, CrossSpecies or an unlisted page, naming each', () => {
    const r = result(rootWith({ CrossSpecies: TABLE, Brandnew: TABLE, Cow: TABLE }));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('Datasets/CrossSpecies.md has a "## Complete data inventory" table');
    expect(r.detail).toContain('Datasets/Brandnew.md');
    expect(r.detail).not.toContain('Cow.md');
  });

  it('passes an inventory table on an inventory page, and a reference page of entries only', () => {
    expect(result(rootWith({ Cow: TABLE, CrossSpecies: '## Section\n\n### An entry\n\nProse.\n' })).ok).toBe(true);
  });

  it('says what becomes of the rows, which differs between a page of entries and a page in no list', () => {
    const lines = result(rootWith({ CrossSpecies: TABLE, Brandnew: TABLE })).detail.split('; ');
    const cross = lines.find((l) => l.includes('CrossSpecies.md'))!;
    const unlisted = lines.find((l) => l.includes('Brandnew.md'))!;
    expect(cross).toContain('db:emit would regenerate the table empty');
    expect(unlisted).toContain('in no page list');
    expect(unlisted).not.toContain('db:emit would regenerate');
  });

  it("tells the directory's README to move its rows rather than join a page list", () => {
    const detail = result(rootWith({ README: TABLE })).detail;
    expect(detail).toContain('Datasets/README.md has a "## Complete data inventory" table');
    expect(detail).toContain('move the rows to a dataset page');
    expect(detail).not.toContain('add the page to INVENTORY_PAGES');
  });
});

describe('checkEntryRowTwins (tucca-cellag/caail-planning#752)', () => {
  const SPECIES = ['Study', 'Paper', 'Data', 'Type', 'Tissue', 'Description', 'Size', 'Area of research'];
  const headers: Record<string, string[]> = { Cow: SPECIES, Pig: SPECIES };
  const headerFor = (page: string) => (headers[page] ? { header: headers[page]! } : { problem: `Datasets/${page}.md does not exist` });
  const PAPER = '10.1038/s41586-020-0001-1';
  const DEPOSIT = 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE1';
  const ZENODO = '10.5281/zenodo.11357327';
  const REPO = 'https://github.com/example/data';
  const row = (db: Db, id: string, page: string, cells: Record<string, string>): void => {
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset',?)").run(id, id.slice(3));
    db.prepare('INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES(?,?,?,NULL,0)')
      .run(id, page, JSON.stringify(headers[page]!.map((h) => cells[h] ?? 'x')));
  };
  const entry = (
    db: Db, id: string, page: string, url: string | null, doi: string | null,
    lists: { accessions?: string[]; dataLinks?: string[] } = {},
  ): void => {
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset',?)").run(id, id.slice(3));
    db.prepare(`INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,doi,doi_source,accessions,data_links,ordinal)
      VALUES(?,'An entry',?,?,'S','other',?,'body',?,?,?,?,0)`)
      .run(id, url, page, url ? `[An entry](${url})` : 'An entry', doi, doi ? 'manual' : null,
        lists.accessions ? JSON.stringify(lists.accessions) : null, lists.dataLinks ? JSON.stringify(lists.dataLinks) : null);
  };
  const result = (db: Db) => checkEntryRowTwins(db, undefined, headerFor).find((r) => r.label === ENTRY_ROW_TWINS_LABEL)!;

  it("fails an entry whose own deposit DOI is a row's Data deposit, naming both", () => {
    const db = miniDb();
    entry(db, 'ds:entry-a', 'Cow', `https://zenodo.org/records/11357327`, ZENODO);
    row(db, 'ds:row-a', 'Cow', { Paper: `[DOI](https://doi.org/${PAPER})`, Data: `[Zenodo](https://doi.org/${ZENODO})` });
    const r = result(db);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ds:entry-a and ds:row-a on Cow both name DOI 10.5281/zenodo.11357327');
  });

  it("fails an entry whose heading links a row's deposit, whatever the trailing slash or case", () => {
    const db = miniDb();
    entry(db, 'ds:entry-c', 'Cow', `${DEPOSIT.toUpperCase()}/`, null);
    row(db, 'ds:row-c', 'Cow', { Data: `[\`GSE1\`](${DEPOSIT})` });
    expect(result(db).ok).toBe(false);
  });

  it("fails an entry whose accessions name a row's badge, whatever the case or version suffix", () => {
    const db = miniDb();
    entry(db, 'ds:entry-h', 'Cow', `https://doi.org/${PAPER}`, PAPER, { accessions: ['GSE1'] });
    row(db, 'ds:row-h', 'Cow', { Data: '[`gse1.2`](https://example.org/geo/gse1)' });
    const r = result(db);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('accession GSE1');
  });

  it("fails an entry whose dataLinks name a row's deposit link", () => {
    const db = miniDb();
    entry(db, 'ds:entry-i', 'Cow', `https://doi.org/${PAPER}`, PAPER, { dataLinks: [REPO] });
    row(db, 'ds:row-i', 'Cow', { Data: `[GitHub](${REPO}/)` });
    expect(result(db).ok).toBe(false);
  });

  it('fails a twin whatever the scheme, and reads a Zenodo record page as its DOI', () => {
    const db = miniDb();
    entry(db, 'ds:entry-m', 'Cow', 'http://example.org/data/x', null);
    row(db, 'ds:row-m', 'Cow', { Data: '[Lab](https://example.org/data/x)' });
    entry(db, 'ds:entry-n', 'Pig', `https://doi.org/${PAPER}`, ZENODO);
    row(db, 'ds:row-n', 'Pig', { Data: '[Zenodo](https://zenodo.org/record/11357327)' });
    const r = result(db);
    expect(r.detail).toMatch(/^2 twin\(s\): /);
    expect(r.detail).toContain('ds:entry-n and ds:row-n on Pig both name DOI 10.5281/zenodo.11357327');
  });

  it('reports a pair once, naming every deposit the two share', () => {
    const db = miniDb();
    entry(db, 'ds:entry-j', 'Cow', DEPOSIT, null, { accessions: ['GSE1'] });
    row(db, 'ds:row-j', 'Cow', { Data: `[\`GSE1\`](${DEPOSIT})` });
    const r = result(db);
    expect(r.detail).toMatch(/^1 twin\(s\): /);
    expect(r.detail).toContain('and accession GSE1');
  });

  it("fails an entry whose data link names a row's badge accession as a whole token", () => {
    const db = miniDb();
    entry(db, 'ds:entry-o', 'Cow', `https://doi.org/${PAPER}`, PAPER, { dataLinks: ['https://www.ncbi.nlm.nih.gov/sra/SRR1234567'] });
    row(db, 'ds:row-o', 'Cow', { Data: '[`SRR1234567`](https://trace.ncbi.nlm.nih.gov/Traces/?run=SRR1234567)' });
    const r = result(db);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('ds:entry-o and ds:row-o on Cow both name accession SRR1234567');
  });

  it("fails an entry whose accession a row's deposit link names", () => {
    const db = miniDb();
    entry(db, 'ds:entry-p', 'Cow', `https://doi.org/${PAPER}`, PAPER, { accessions: ['PRJEB14330'] });
    row(db, 'ds:row-p', 'Cow', { Data: '[ENA](https://www.ebi.ac.uk/ena/browser/view/PRJEB14330)' });
    expect(result(db).detail).toContain('ds:entry-p and ds:row-p on Cow both name accession PRJEB14330');
  });

  it('passes a badge a link holds only inside a longer segment or in its host', () => {
    const db = miniDb();
    entry(db, 'ds:entry-r', 'Cow', 'https://github.com/SysBioChalmers/Zebrafish-GEM-v2', null);
    row(db, 'ds:row-r', 'Cow', { Data: '[`Zebrafish-GEM`](https://github.com/SysBioChalmers/Zebrafish-GEM)' });
    entry(db, 'ds:entry-s', 'Pig', `https://doi.org/${PAPER}`, PAPER, { dataLinks: ['https://zenodo.org/records/7'] });
    row(db, 'ds:row-s', 'Pig', { Data: '[`zenodo.5`](https://example.org/z5)' });
    const r = result(db);
    expect(r.ok, r.detail).toBe(true);
  });

  it('passes a repository named like a badge in another case, as the data-links guard reads a path segment', () => {
    const db = miniDb();
    entry(db, 'ds:entry-t', 'Cow', `https://doi.org/${PAPER}`, PAPER, { dataLinks: ['https://github.com/lab/cra2/tree/main/data'] });
    row(db, 'ds:row-t', 'Cow', { Data: '[`CRA2`](https://ngdc.cncb.ac.cn/gsa/browse/CRA2)' });
    const r = result(db);
    expect(r.ok, r.detail).toBe(true);
  });

  it('fails a link naming a badge in a path segment as written, or in a query value in any case', () => {
    const db = miniDb();
    entry(db, 'ds:entry-v', 'Cow', `https://doi.org/${PAPER}`, PAPER, { dataLinks: ['https://www.ncbi.nlm.nih.gov/sra/?term=srr1234567'] });
    row(db, 'ds:row-v', 'Cow', { Data: '[`SRR1234567`](https://trace.ncbi.nlm.nih.gov/Traces/?run=SRR1234567)' });
    entry(db, 'ds:entry-w', 'Pig', 'https://github.com/SysBioChalmers/Zebrafish-GEM', null);
    row(db, 'ds:row-w', 'Pig', { Data: '[`Zebrafish-GEM`](https://doi.org/10.5281/zenodo.9)' });
    const r = result(db);
    expect(r.detail).toMatch(/^2 twin\(s\): /);
    expect(r.detail).toContain('ds:entry-v and ds:row-v on Cow both name accession SRR1234567');
    expect(r.detail).toContain('ds:entry-w and ds:row-w on Pig both name accession ZEBRAFISH-GEM');
  });

  it('passes a link that holds an accession only inside a longer one', () => {
    const db = miniDb();
    entry(db, 'ds:entry-q', 'Cow', `https://doi.org/${PAPER}`, PAPER, { dataLinks: ['https://www.ncbi.nlm.nih.gov/sra/SRR12345678'] });
    row(db, 'ds:row-q', 'Cow', { Data: '[`SRR1234567`](https://trace.ncbi.nlm.nih.gov/Traces/?run=SRR1234567)' });
    expect(result(db).ok).toBe(true);
  });

  it('passes an entry and a row that share only their paper, since one paper can describe several deposits', () => {
    const db = miniDb();
    entry(db, 'ds:entry-k', 'Cow', `https://doi.org/${PAPER}`, PAPER, { dataLinks: [REPO] });
    row(db, 'ds:row-k', 'Cow', { Paper: `[DOI](https://doi.org/${PAPER})`, Data: `[\`GSE1\`](${DEPOSIT})` });
    expect(result(db).ok).toBe(true);
  });

  it('passes a row whose Data cell is a status word, which names no deposit', () => {
    const db = miniDb();
    entry(db, 'ds:entry-l', 'Cow', `https://doi.org/${PAPER}`, PAPER);
    row(db, 'ds:row-l', 'Cow', { Paper: `[DOI](https://doi.org/${PAPER})`, Data: 'supplementary' });
    expect(result(db).ok).toBe(true);
  });

  it('passes the same deposit on two species pages, since a multi-species resource counts once per species (tucca-cellag/caail-planning#791)', () => {
    const db = miniDb();
    entry(db, 'ds:entry-d', 'Pig', DEPOSIT, null, { accessions: ['GSE1'] });
    row(db, 'ds:row-d', 'Cow', { Data: `[\`GSE1\`](${DEPOSIT})` });
    expect(result(db).ok).toBe(true);
  });

  it("passes a deposit a row only mentions in its Description, which names data it reuses, not its own", () => {
    const db = miniDb();
    entry(db, 'ds:entry-f', 'Cow', REPO, null);
    row(db, 'ds:row-f', 'Cow', { Description: `reuses [their data](${REPO})`, Data: `[\`GSE1\`](${DEPOSIT})` });
    expect(result(db).ok).toBe(true);
  });
});

describe('checkAccessions (tucca-cellag/caail-planning#752)', () => {
  const ENTRY = 'ds:atlas-a';
  const withEntry = (
    stored: string | null,
    body = 'Deposited at ENA (PRJEB27455, PRJEB27111), ArrayExpress E-MTAB-9622 and GEO `GSE1`.',
  ): Db => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset','atlas-a')").run(ENTRY);
    db.prepare(`INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,accessions,ordinal)
      VALUES(?,'An atlas',NULL,'Cow','S','atlas','An atlas',?,?,0)`)
      .run(ENTRY, body, stored);
    db.prepare("INSERT INTO items(id,type,slug) VALUES('ds:row-a','dataset','row-a')").run();
    db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:row-a','Cow','[]',NULL,0)").run();
    return db;
  };
  const fileWith = (datasets: Record<string, unknown>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-accessions-'));
    const path = join(dir, 'dataset-accessions.json');
    writeFileSync(path, JSON.stringify({ datasets }));
    return path;
  };
  const result = (db: Db, path: string) => checkAccessions(db, path).find((r) => r.label === ACCESSIONS_LABEL)!;

  it('passes a curated entry whose distinct accessions are stored as the file lists them', () => {
    const list = ['PRJEB27455', 'PRJEB27111', 'E-MTAB-9622'];
    expect(result(withEntry(JSON.stringify(list)), fileWith({ [ENTRY]: list })).ok).toBe(true);
  });

  it('passes an empty file with nothing stored', () => {
    expect(result(withEntry(null), fileWith({})).ok).toBe(true);
  });

  it('rejects a key that is an inventory row or no item at all', () => {
    for (const id of ['ds:row-a', 'ds:nowhere']) {
      const r = result(withEntry(null), fileWith({ [id]: ['GSE1'] }));
      expect(r.ok, id).toBe(false);
      expect(r.detail, id).toContain('not a curated dataset entry');
    }
  });

  it('rejects a value that is not one bare accession from the shared families', () => {
    for (const bad of ['prjeb27455', 'https://www.ebi.ac.uk/ena/browser/view/PRJEB27455', 'CNP0000198', 'GSE1 GSE2', '']) {
      const r = result(withEntry(JSON.stringify([bad])), fileWith({ [ENTRY]: [bad] }));
      expect(r.ok, bad).toBe(false);
      expect(r.detail, bad).toContain('not one bare accession');
    }
  });

  it('refuses an accession its entry names nowhere, such as one missing a digit', () => {
    for (const typo of ['PRJEB2745', 'PRJEB27456']) {
      const r = result(withEntry(JSON.stringify([typo])), fileWith({ [ENTRY]: [typo] }));
      expect(r.ok, typo).toBe(false);
      expect(r.detail, typo).toContain('named nowhere in its heading or description');
    }
  });

  it('finds an accession its entry writes with a version suffix', () => {
    const r = result(withEntry(JSON.stringify(['PRJEB27455']), 'Deposited at ENA as PRJEB27455.1.'), fileWith({ [ENTRY]: ['PRJEB27455'] }));
    expect(r.ok).toBe(true);
  });

  it('sends an accession outside the families to the data links, rather than leaving it nowhere', () => {
    const r = result(withEntry(JSON.stringify(['SRA051669'])), fileWith({ [ENTRY]: ['SRA051669'] }));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('dataset-data-links.json as its link');
  });

  it('names every family ACCESSION_SOURCE admits, read from it rather than typed beside it', () => {
    const families = ACCESSION_SOURCE.split('|');
    expect(families.length).toBeGreaterThan(5);
    const detail = result(withEntry(JSON.stringify(['x'])), fileWith({ [ENTRY]: ['x'] })).detail;
    for (const alt of families) {
      const prefix = alt.match(/^[A-Z-]+/)![0];
      expect(ACCESSION_FAMILIES, alt).toContain(`${prefix}…`);
      expect(detail, alt).toContain(`${prefix}…`);
    }
  });

  it('rejects an accession listed twice, and an empty list', () => {
    expect(result(withEntry(JSON.stringify(['GSE1', 'GSE1'])), fileWith({ [ENTRY]: ['GSE1', 'GSE1'] })).detail).toContain('twice');
    expect(result(withEntry(null), fileWith({ [ENTRY]: [] })).detail).toContain('non-empty list');
  });

  it('rejects a stored column that differs from the file, in either direction', () => {
    expect(result(withEntry(null), fileWith({ [ENTRY]: ['GSE1'] })).detail).toContain('db:reseed-axes');
    expect(result(withEntry(JSON.stringify(['GSE1'])), fileWith({})).detail).toContain('db:reseed-axes');
  });
});

describe('checkDataLinks (tucca-cellag/caail-planning#752)', () => {
  const ENTRY = 'ds:texture-a';
  const PAPER = '10.1016/j.actbio.2025.07.002';
  const HEADING = `https://doi.org/${PAPER}`;
  const REPO = 'https://github.com/LivingMatterLab/CANN/tree/main/ARTMEAT/FungiSteak';
  const ZENODO = 'https://doi.org/10.5281/zenodo.11357327';
  const BODY = `The data are in [the authors' repository](${REPO}) and at [Zenodo](${ZENODO}).`;
  const withEntry = (stored: string | null, doi: string | null = PAPER, body: string = BODY): Db => {
    const db = miniDb();
    db.prepare("INSERT INTO items(id,type,slug) VALUES(?,'dataset','texture-a')").run(ENTRY);
    db.prepare(`INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,doi,doi_source,data_links,ordinal)
      VALUES(?,'A texture reference',?,'CrossSpecies','S','other',?,?,?,?,?,0)`)
      .run(ENTRY, HEADING, `[A texture reference](${HEADING})`, body, doi, doi ? 'manual' : null, stored);
    db.prepare("INSERT INTO items(id,type,slug) VALUES('ds:row-a','dataset','row-a')").run();
    db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:row-a','Cow','[]',NULL,0)").run();
    return db;
  };
  const fileWith = (datasets: Record<string, unknown>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-data-links-'));
    const path = join(dir, 'dataset-data-links.json');
    writeFileSync(path, JSON.stringify({ datasets }));
    return path;
  };
  const result = (db: Db, path: string) => checkDataLinks(db, path).find((r) => r.label === DATA_LINKS_LABEL)!;
  const listed = (list: unknown[]) => result(withEntry(JSON.stringify(list)), fileWith({ [ENTRY]: list }));

  it('passes a code repository and a data host DOI link, stored as the file lists them', () => {
    expect(listed([REPO, ZENODO]).ok).toBe(true);
  });

  it('passes an empty file with nothing stored', () => {
    expect(result(withEntry(null), fileWith({})).ok).toBe(true);
  });

  it('rejects a key that is an inventory row or no item at all', () => {
    for (const id of ['ds:row-a', 'ds:nowhere']) {
      const r = result(withEntry(null), fileWith({ [id]: [REPO] }));
      expect(r.ok, id).toBe(false);
      expect(r.detail, id).toContain('not a curated dataset entry');
    }
  });

  it('rejects a value that is not one link to an http(s) address with a host', () => {
    for (const bad of ['github.com/a/b', 'mailto:author@example.org', 'https://', 'https://example.org/a b', '', 7]) {
      const r = listed([bad]);
      expect(r.ok, String(bad)).toBe(false);
      expect(r.detail, String(bad)).toContain('not one link to an http(s) address');
    }
  });

  it("rejects the entry's own paper, as its heading link, as its doi, or as any paper's DOI", () => {
    expect(listed([HEADING]).detail).toContain('already its heading link');
    expect(listed([`${HEADING.toUpperCase()}/`]).detail).toContain('already its heading link');
    // Another host form of the heading's DOI is the same link.
    expect(listed([`https://dx.doi.org/${PAPER}`]).detail).toContain('already its heading link');
    const other = listed(['https://doi.org/10.1038/s41586-020-0001-1']);
    expect(other.ok).toBe(false);
    expect(other.detail).toContain('DATA_REPOSITORY_REGISTRANTS');
  });

  it("rejects a link that repeats an entry's own deposit DOI, the Zenodo record page for it included", () => {
    const r = result(withEntry(JSON.stringify([ZENODO]), '10.5281/zenodo.11357327'), fileWith({ [ENTRY]: [ZENODO] }));
    expect(r.detail).toContain('already its doi');
    const record = 'https://zenodo.org/records/11357327';
    const page = result(withEntry(JSON.stringify([record]), '10.5281/zenodo.11357327', `[Zenodo](${record})`), fileWith({ [ENTRY]: [record] }));
    expect(page.detail).toContain('already its doi');
  });

  it("rejects a publisher's article page whose path carries a paper DOI", () => {
    const article = 'https://onlinelibrary.wiley.com/doi/10.1002/jsfa.12345';
    const r = result(withEntry(JSON.stringify([article]), PAPER, `See [the article](${article}).`), fileWith({ [ENTRY]: [article] }));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('links 10.1002/jsfa.12345');
    // A data host's DOI in a path is a deposit, and passes.
    const record = 'https://zenodo.org/doi/10.5281/zenodo.11357327';
    expect(result(withEntry(JSON.stringify([record]), PAPER, `At [Zenodo](${record}).`), fileWith({ [ENTRY]: [record] })).ok).toBe(true);
  });

  it("rejects a publisher's article page whose query value is a paper DOI, encoded or not", () => {
    for (const [article, doi] of [
      ['https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0123456', '10.1371/journal.pone.0123456'],
      ['https://example.org/view?type=html&doi=10.1002%2Fjsfa.12345', '10.1002/jsfa.12345'],
    ] as const) {
      const r = result(withEntry(JSON.stringify([article]), PAPER, `See [the article](${article}).`), fileWith({ [ENTRY]: [article] }));
      expect(r.ok, article).toBe(false);
      expect(r.detail, article).toContain(`links ${doi}, whose registrant is not a data host`);
    }
    // A data host's DOI in a query value is a deposit, and passes.
    const deposit = 'https://example.org/browse?doi=10.5281/zenodo.11357327';
    expect(result(withEntry(JSON.stringify([deposit]), PAPER, `At [the browser](${deposit}).`), fileWith({ [ENTRY]: [deposit] })).ok).toBe(true);
  });

  it('refuses a link its entry names nowhere, such as one cut short', () => {
    const cut = REPO.slice(0, -1);
    expect(listed([cut]).detail).toContain('named nowhere in its heading or description');
  });

  it('refuses a link cut short at a dot, a ? or a #, and passes one that ends a sentence', () => {
    const body = 'At https://doi.org/10.5281/zenodo.11357327, [the query](https://example.org/data?id=1), ' +
      '[the docs](https://example.org/docs#data), and https://github.com/a/b.';
    for (const cut of ['https://doi.org/10.5281/zenodo', 'https://example.org/data', 'https://example.org/docs']) {
      const r = result(withEntry(JSON.stringify([cut]), PAPER, body), fileWith({ [ENTRY]: [cut] }));
      expect(r.detail, cut).toContain('named nowhere in its heading or description');
    }
    const whole = 'https://github.com/a/b';
    expect(result(withEntry(JSON.stringify([whole]), PAPER, body), fileWith({ [ENTRY]: [whole] })).ok).toBe(true);
  });

  it('refuses a link whose path segment or query value is an accession dataset-accessions.json takes, and passes others', () => {
    const at = (link: string) => result(withEntry(JSON.stringify([link]), PAPER, `At [the archive](${link}).`), fileWith({ [ENTRY]: [link] }));
    for (const [link, accession] of [
      ['https://www.ebi.ac.uk/ena/browser/view/PRJEB27455', 'PRJEB27455'],
      ['https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSE12345', 'GSE12345'],
      ['https://www.ebi.ac.uk/pride/archive/projects/PXD012345.1', 'PXD012345'],
    ] as const) {
      const r = at(link);
      expect(r.ok, link).toBe(false);
      expect(r.detail, link).toContain(`names ${accession},`);
      expect(r.detail, link).toContain(`list ${accession} there instead`);
    }
    // An archive the families leave out, a family prefix inside a longer segment or a file name,
    // and a lowercase lookalike (the families are uppercase) are links.
    for (const link of [
      'https://www.ncbi.nlm.nih.gov/sra/SRR1234567', 'https://github.com/example/gsm8k-data',
      'https://github.com/lab/cra2/tree/main/data', 'https://zenodo.org/records/5/files/GSE1.csv',
    ]) {
      expect(at(link).ok, link).toBe(true);
    }
  });

  it('refuses a link cut short before any address character, and passes one followed by punctuation and a space', () => {
    const body = 'See [ENA](https://www.ebi.ac.uk/ena/browser/view?acc=ERP1&display=xml), ' +
      '[the set](https://example.org/data%20set) and https://github.com/a/b: the code.';
    for (const cut of ['https://www.ebi.ac.uk/ena/browser/view?acc', 'https://www.ebi.ac.uk/ena/browser/view?acc=ERP1', 'https://example.org/data']) {
      const r = result(withEntry(JSON.stringify([cut]), PAPER, body), fileWith({ [ENTRY]: [cut] }));
      expect(r.detail, cut).toContain('named nowhere in its heading or description');
    }
    const whole = 'https://github.com/a/b';
    expect(result(withEntry(JSON.stringify([whole]), PAPER, body), fileWith({ [ENTRY]: [whole] })).ok).toBe(true);
  });

  it('refuses a link ending in punctuation copied with it, though the prose holds the copy verbatim', () => {
    const body = 'Code: [FoodML](https://github.com/sezinata/FoodML), at https://github.com/a/b. ' +
      'See (https://example.org/x) and "https://example.org/y"; *https://example.org/z* or https://example.org/w!';
    for (const copied of [
      'https://github.com/sezinata/FoodML),', 'https://github.com/sezinata/FoodML)', 'https://github.com/a/b.',
      'https://example.org/x)', 'https://example.org/y"', 'https://example.org/y";', 'https://example.org/z*',
      'https://example.org/w!',
    ]) {
      const r = result(withEntry(JSON.stringify([copied]), PAPER, body), fileWith({ [ENTRY]: [copied] }));
      expect(r.ok, copied).toBe(false);
      expect(r.detail, copied).toContain(`ends in "${copied.slice(-1)}", punctuation copied with the link`);
    }
    for (const whole of ['https://github.com/sezinata/FoodML', 'https://github.com/a/b']) {
      expect(result(withEntry(JSON.stringify([whole]), PAPER, body), fileWith({ [ENTRY]: [whole] })).ok, whole).toBe(true);
    }
  });

  it('refuses a Zenodo record page, naming the DOI link to write instead', () => {
    const record = 'https://zenodo.org/records/123';
    const r = result(withEntry(JSON.stringify([record]), PAPER, `At [Zenodo](${record}).`), fileWith({ [ENTRY]: [record] }));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('write its DOI link, https://doi.org/10.5281/zenodo.123');
  });

  it('refuses a family accession in a query value whatever its case', () => {
    const link = 'https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=gse158430';
    const r = result(withEntry(JSON.stringify([link]), PAPER, `At [GEO](${link}).`), fileWith({ [ENTRY]: [link] }));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain('names GSE158430,');
  });

  it('rejects a link listed twice, however its case or trailing slash, and an empty list', () => {
    expect(listed([REPO, `${REPO.toLowerCase()}/`]).detail).toContain('twice');
    expect(listed([REPO, REPO.replace('https://', 'http://')]).detail).toContain('twice');
    // One DOI written on two hosts, in two cases, is one deposit.
    expect(listed([ZENODO, 'https://dx.doi.org/10.5281/ZENODO.11357327/']).detail).toContain('twice');
    expect(result(withEntry(null), fileWith({ [ENTRY]: [] })).detail).toContain('non-empty list');
  });

  it('rejects a stored column that differs from the file, in either direction', () => {
    expect(result(withEntry(null), fileWith({ [ENTRY]: [REPO] })).detail).toContain('db:reseed-axes');
    expect(result(withEntry(JSON.stringify([REPO])), fileWith({})).detail).toContain('db:reseed-axes');
  });
});

describe('runChecks on the real corpus', () => {
  it('passes every guard', () => {
    const results = runChecks(importNdjson());
    const failed = results.filter((r) => !r.ok);
    expect(failed, failed.map((r) => `${r.label}: ${r.detail}`).join('; ')).toEqual([]);
  });
});
