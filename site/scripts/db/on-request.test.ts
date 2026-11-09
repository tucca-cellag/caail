/**
 * on-request.test.ts — the Data on request list (tucca-cellag/caail-planning#750): studies whose
 * data are shared only on request, kept findable without being counted as datasets.
 *
 *   A. Emit: the section is created before `## Further reading` (or at the page end), its
 *      table is replaced with prose kept, and it goes when a page's last row goes.
 *   B. Extract: the table reads back to the rows, and a hand-edited shape throws.
 *   C. Seed and guard: bootstrap re-seeds from the page; db:check refuses a bad row.
 *   D. Real corpus: every page round-trips, and the parser serves the committed rows.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, importNdjson, exportNdjson, REPO_ROOT, type Db } from './lib.js';
import { emitDatasetPage } from './emit.js';
import { isDbOwnedDatasetPage } from './emit-files.js';
import { extractOnRequest, ON_REQUEST_HEADING, readPagesOnRequest } from './extract.js';
import { seedOnRequest } from './seed.js';
import { checkOnRequest, ON_REQUEST_LABEL } from './check.js';
import { isEntryHeading, ON_REQUEST_PAGES } from '../parser/datasets.js';
import { cellText } from '../parser/dataset-inventory.js';
import { buildOnRequestStudies, onRequestDrift, readOnRequestRows } from '../parser/datasets-on-request.js';

const TMP = mkdtempSync(join(tmpdir(), 'caail-onreq-'));
const ROW = { doi: '10.1000/abc', study: 'A study (Author et al. 2024)', statement: 'Data will be made available on request.' };

/** An empty DB holding only the given on-request rows for a page. */
function dbWith(page: string, rows: { doi: string; study: string; statement: string }[]): Db {
  const db = openDb();
  const ins = db.prepare('INSERT INTO datasets_on_request(doi,page,study,statement,ordinal) VALUES(?,?,?,?,?)');
  rows.forEach((r, i) => ins.run(r.doi, page, r.study, r.statement, i));
  return db;
}

/** The Data on request guard's result for a DB. */
const result = (db: Db, root = REPO_ROOT) => checkOnRequest(db, root).find((r) => r.label === ON_REQUEST_LABEL)!;

/** Emit a fixture page and read the result back. */
function emitFixture(name: string, text: string, rows: typeof ROW[]): string {
  const src = join(TMP, `${name}.md`);
  writeFileSync(src, text);
  return emitDatasetPage(dbWith(name, rows), src, name);
}

describe('emitDatasetPage: the Data on request section', () => {
  it('creates the section just before ## Further reading when the page has rows but no section', () => {
    const out = emitFixture('Fresh', '# Fresh\n\nIntro.\n\n## Further reading\n\n- a link\n', [ROW]);
    expect(out.indexOf(`## ${ON_REQUEST_HEADING}`)).toBeGreaterThan(out.indexOf('Intro.'));
    expect(out.indexOf(`## ${ON_REQUEST_HEADING}`)).toBeLessThan(out.indexOf('## Further reading'));
    expect(out).toContain('| A study (Author et al. 2024) | [DOI](https://doi.org/10.1000/abc) | "Data will be made available on request." |');
  });

  it('closes the page with the section when there is no ## Further reading', () => {
    const out = emitFixture('NoFooter', '# NoFooter\n\nIntro.\n', [ROW]);
    expect(out.trimEnd().endsWith('| "Data will be made available on request." |')).toBe(true);
  });

  it('replaces the table and keeps the prose between the heading and the table', () => {
    const page =
      '# Kept\n\n## Data on request\n\nA curator\'s own lede.\n\n| Study | Paper | Data availability statement |\n|---|---|---|\n' +
      '| Old study | [DOI](https://doi.org/10.1000/old) | "Old." |\n\n## Further reading\n\n- a link\n';
    const out = emitFixture('Kept', page, [ROW]);
    expect(out).toContain('A curator\'s own lede.');
    expect(out).not.toContain('Old study');
    expect(out).toContain('10.1000/abc');
  });

  it('removes the whole section when the page has no rows left, and leaves a page without one untouched', () => {
    const page =
      '# Gone\n\n## Data on request\n\nLede.\n\n| Study | Paper | Data availability statement |\n|---|---|---|\n' +
      '| Old study | [DOI](https://doi.org/10.1000/old) | "Old." |\n\n## Further reading\n\n- a link\n';
    const out = emitFixture('Gone', page, []);
    expect(out).not.toContain(ON_REQUEST_HEADING);
    expect(out).not.toContain('Lede.');
    expect(out).toContain('## Further reading');
    const plain = '# Plain\n\nIntro.\n\n## Further reading\n\n- a link\n';
    expect(emitFixture('Plain', plain, [])).toBe(plain);
  });

  it('writes a table that reads back to the rows it was given', () => {
    const rows = [ROW, { doi: '10.1000/xyz', study: 'Second (*Species name*) study', statement: 'Ask the "corresponding" author.' }];
    const src = join(TMP, 'RoundTrip.md');
    writeFileSync(src, emitFixture('RoundTrip', '# RoundTrip\n\n## Further reading\n\n- a link\n', rows));
    expect(extractOnRequest(src)).toEqual(rows);
  });
});

describe('edges: entry counting, verbatim text, row order, placement, drift and held DOIs', () => {
  it('never counts the list\'s heading, or a ### under it, as a dataset entry, on Benchmarks or any page', () => {
    expect(isEntryHeading('Benchmarks', 'Data on request', '')).toBe(false);
    expect(isEntryHeading('Benchmarks', 'data on Request', '')).toBe(false);
    expect(isEntryHeading('Cow', 'A note', 'Data on request')).toBe(false);
    expect(isEntryHeading('Cow', 'An atlas', 'Featured atlases')).toBe(true);
  });

  it('keeps a statement verbatim through emit and read-back, email addresses, URLs and underscores included', () => {
    const rows = [{ ...ROW, statement: 'Ask a.b@uni.edu or see https://zenodo.org/r/1 and data_v1_final.' }];
    const src = join(TMP, 'Verbatim.md');
    writeFileSync(src, emitFixture('Verbatim', '# Verbatim\n\n## Further reading\n\n- a link\n', rows));
    expect(extractOnRequest(src)).toEqual(rows);
  });

  it('orders rows that share an ordinal by DOI, so every run emits one order', () => {
    const db = openDb();
    const ins = db.prepare('INSERT INTO datasets_on_request(doi,page,study,statement,ordinal) VALUES(?,?,?,?,?)');
    ins.run('10.1000/zzz', 'Tie', 'Z study', 'Ask.', 0);
    ins.run('10.1000/aaa', 'Tie', 'A study', 'Ask.', 0);
    const src = join(TMP, 'Tie.md');
    writeFileSync(src, '# Tie\n\n## Further reading\n\n- a link\n');
    const out = emitDatasetPage(db, src, 'Tie');
    expect(out.indexOf('10.1000/aaa')).toBeLessThan(out.indexOf('10.1000/zzz'));
  });

  it('regenerates an existing section where it stands rather than adding a second, and finds a footer in any case', () => {
    const after =
      '# After\n\n## Further reading\n\n- a link\n\n## Data on request\n\n| Study | Paper | Data availability statement |\n' +
      '|---|---|---|\n| Old | [DOI](https://doi.org/10.1000/old) | "Old." |\n';
    expect(emitFixture('After', after, [ROW]).match(/## Data on request/g)).toHaveLength(1);
    const capital = emitFixture('Capital', '# Capital\n\n## Further Reading\n\n- a link\n', [ROW]);
    expect(capital.indexOf('## Data on request')).toBeLessThan(capital.indexOf('## Further Reading'));
  });

  it('reports the first difference between stored rows and the pages, beyond a count', () => {
    const stored = [{ page: 'Cow', doi: '10.1/a', study: 'S', statement: 'Ask.' }];
    expect(onRequestDrift(stored, stored)).toBeNull();
    expect(onRequestDrift(stored, [{ ...stored[0]!, statement: 'Edited.' }])).toContain('statement differs');
    expect(onRequestDrift(stored, [{ ...stored[0]!, study: 'Edited' }])).toContain('study differs');
    expect(onRequestDrift(stored, [])).toContain('stored but its page does not list it');
    expect(onRequestDrift([], stored)).toContain('on the page but not stored');
  });

  it('refuses an on-request DOI that an inventory row names as its paper or a curated entry carries', () => {
    const inRow = dbWith('Cow', [ROW]);
    inRow.exec('PRAGMA foreign_keys = OFF');
    // Cow's real header has eight columns: Study | Paper | Data | Type | Tissue | Description | Size | Area of research.
    inRow.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:held-row','Cow',?,NULL,0)")
      .run(JSON.stringify(['Held', '[DOI](https://doi.org/10.1000/abc)', 'supplementary', 'x', 'x', 'x', 'x', 'x']));
    expect(result(inRow).detail).toContain('also the paper of ds:held-row');
    const inEntry = dbWith('Cow', [ROW]);
    inEntry.exec('PRAGMA foreign_keys = OFF');
    inEntry.prepare("INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,doi,doi_source,ordinal) VALUES('ds:held-entry','E',NULL,'Cow','S','other','E','b','10.1000/abc','manual',0)").run();
    expect(result(inEntry).detail).toContain('also the paper of ds:held-entry');
  });

  it('refuses an on-request DOI that a Paper cell links even when a data host registered it', () => {
    // 10.17605 is OSF's registrant, so the row's identity reads it as the item's own DOI, not a paper's.
    const osf = '10.17605/osf.io/abcd';
    const db = dbWith('Cow', [{ ...ROW, doi: osf }]);
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:osf-row','Cow',?,NULL,0)")
      .run(JSON.stringify(['Held', `[preprint](https://doi.org/${osf})`, 'supplementary', 'x', 'x', 'x', 'x', 'x']));
    expect(result(db).detail).toContain('also the paper of ds:osf-row');
  });

  it('reads a Paper cell DOI that holds parentheses whole', () => {
    const doi = '10.1016/s0092-8674(20)30001-1';
    const db = dbWith('Cow', [{ ...ROW, doi }]);
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare("INSERT INTO dataset_rows(item_id,page,cells_json,subseries,ordinal) VALUES('ds:paren-row','Cow',?,NULL,0)")
      .run(JSON.stringify(['Held', `[DOI](https://doi.org/${doi})`, 'supplementary', 'x', 'x', 'x', 'x', 'x']));
    expect(result(db).detail).toContain('also the paper of ds:paren-row');
  });

  it('refuses a DOI its [DOI](…) link could not hold: an angle bracket or an unbalanced parenthesis', () => {
    for (const doi of ['10.1000/a<b>c', '10.1000/a(b', '10.1000/a)b']) {
      expect(result(dbWith('Cow', [{ ...ROW, doi }])).detail, doi).toContain(`${doi}: cannot sit whole in its [DOI](https://doi.org/…) link`);
    }
    expect(result(dbWith('Cow', [{ ...ROW, doi: '10.1000/a(b)c' }])).ok).toBe(true);
  });

  it('refuses a page\'s first row numbered anything but 0', () => {
    const db = openDb();
    db.prepare('INSERT INTO datasets_on_request(doi,page,study,statement,ordinal) VALUES(?,?,?,?,?)').run('10.1000/a', 'Cow', 'S', 'Ask.', 5);
    expect(result(db).detail).toContain('10.1000/a: ordinal 5 is out of place');
  });
});

describe('one section per page, one page per study', () => {
  const TABLE = '| Study | Paper | Data availability statement |\n|---|---|---|\n';
  const line = (doi: string) => `| S | [DOI](https://doi.org/${doi}) | "Ask." |\n`;

  it('refuses a second section, in extract and in emit, and a DOI listed twice in one table', () => {
    const two = `# Two\n\n## Data on request\n\n${TABLE}${line('10.1000/a')}\n## Data on request\n\n${TABLE}${line('10.1000/b')}`;
    const src = join(TMP, 'Two.md');
    writeFileSync(src, two);
    expect(() => extractOnRequest(src)).toThrow(/2 "## Data on request" sections/);
    expect(() => emitFixture('Two', two, [ROW])).toThrow(/2 "## Data on request" sections/);
    const twice = join(TMP, 'Twice.md');
    writeFileSync(twice, `# Twice\n\n## Data on request\n\n${TABLE}${line('10.1000/a')}${line('10.1000/a')}`);
    expect(() => extractOnRequest(twice)).toThrow(/10\.1000\/a is listed twice/);
  });

  it('refuses a second table in the section, in extract and in emit', () => {
    const two = `# TwoTables\n\n## Data on request\n\n${TABLE}${line('10.1000/a')}\n${TABLE}${line('10.1000/b')}`;
    const src = join(TMP, 'TwoTables.md');
    writeFileSync(src, two);
    expect(() => extractOnRequest(src)).toThrow(/holds 2 tables/);
    expect(() => emitFixture('TwoTables', two, [ROW])).toThrow(/holds 2 tables/);
  });

  it('has bootstrap and parse refuse a Data on request section on Benchmarks, rather than drop it', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-onreq-bench-'));
    mkdirSync(join(root, 'Datasets'));
    writeFileSync(join(root, 'Datasets', 'Benchmarks.md'), `# Benchmarks\n\n## Data on request\n\n${TABLE}${line('10.1000/a')}`);
    expect(() => readPagesOnRequest(root)).toThrow(/Benchmarks\.md has a "## Data on request" section/);
    expect(() => seedOnRequest(openDb(), root)).toThrow(/Benchmarks\.md/);
  });

  it('has db:emit refuse a section whose shape was changed by hand, rather than overwrite it', () => {
    const renamed = `# Renamed\n\n## Data on request\n\n| Study | Paper | Note |\n|---|---|---|\n| S | [DOI](https://doi.org/10.1000/a) | "Ask." |\n`;
    expect(() => emitFixture('Renamed', renamed, [ROW])).toThrow(/columns are/);
    const extra = `# Extra\n\n## Data on request\n\n${TABLE}| S | [DOI](https://doi.org/10.1000/a) | "Ask." | a note |\n`;
    expect(() => emitFixture('Extra', extra, [ROW])).toThrow(/row 1 has 4 cells/);
  });

  it('refuses one study on two pages, naming both, in bootstrap and in the parse check', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-onreq-two-pages-'));
    mkdirSync(join(root, 'Datasets'));
    for (const p of ['Cow', 'Pig']) writeFileSync(join(root, 'Datasets', `${p}.md`), `# ${p}\n\n## Data on request\n\n${TABLE}${line('10.1000/a')}`);
    expect(() => seedOnRequest(openDb(), root)).toThrow(/10\.1000\/a is listed on Cow and Pig/);
    const row = { doi: '10.1000/a', study: 'S', statement: 'Ask.' };
    expect(onRequestDrift([{ ...row, page: 'Cow' }], [{ ...row, page: 'Cow' }, { ...row, page: 'Pig' }]))
      .toContain('listed on Cow and on Pig');
  });

  it('has db:emit own a page that holds nothing but the list, and one whose last row went', () => {
    const bare = join(TMP, 'Bare.md');
    writeFileSync(bare, '# Bare\n\nA stub.\n\n## Further reading\n\n- a link\n');
    expect(isDbOwnedDatasetPage(openDb(), bare, 'Bare')).toBe(false);
    expect(isDbOwnedDatasetPage(dbWith('Bare', [ROW]), bare, 'Bare')).toBe(true);
    const stale = join(TMP, 'Stale.md');
    writeFileSync(stale, `# Stale\n\n## Data on request\n\n${TABLE}${line('10.1000/a')}\n## Further reading\n\n- a link\n`);
    expect(isDbOwnedDatasetPage(openDb(), stale, 'Stale')).toBe(true);
  });

  it('orders stored rows that share an ordinal as SQLite does, by code unit, not by locale', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-onreq-ndjson-'));
    // '1' (U+0031) sorts before '_' (U+005F) by code unit; a locale collation puts punctuation first.
    const rows = [{ doi: '10.1000/_x', ordinal: 0 }, { doi: '10.1000/1x', ordinal: 0 }]
      .map((r) => JSON.stringify({ ...r, page: 'Cow', study: 'S', statement: 'Ask.' }));
    writeFileSync(join(dir, 'datasets_on_request.ndjson'), rows.join('\n') + '\n');
    expect(readOnRequestRows(dir).map((r) => r.doi)).toEqual(['10.1000/1x', '10.1000/_x']);
  });
});

describe('extractOnRequest', () => {
  const page = (table: string): string => {
    const src = join(TMP, `x-${Math.random().toString(36).slice(2)}.md`);
    writeFileSync(src, `# P\n\n## Data on request\n\n${table}\n`);
    return src;
  };

  it('is null for a page with no Data on request section', () => {
    const src = join(TMP, 'None.md');
    writeFileSync(src, '# None\n\nNothing here.\n');
    expect(extractOnRequest(src)).toBeNull();
  });

  it('refuses a table it would not write: wrong columns, a Paper cell that is not a DOI link, an unquoted statement', () => {
    expect(() => extractOnRequest(page('| Study | Data | Note |\n|---|---|---|\n| a | b | c |'))).toThrow(/columns/);
    expect(() => extractOnRequest(page('| Study | Paper | Data availability statement |\n|---|---|---|\n| a | https://doi.org/10.1/x | "s" |')))
      .toThrow(/row 1/);
    expect(() => extractOnRequest(page('| Study | Paper | Data availability statement |\n|---|---|---|\n| a | [DOI](https://doi.org/10.1/x) | s |')))
      .toThrow(/row 1/);
    expect(() => extractOnRequest(page('Prose but no table.'))).toThrow(/no table/);
    expect(() => extractOnRequest(page('| Study | Paper | Data availability statement |\n|---|---|---|\n| a | [DOI](https://doi.org/10.1/x) | "s" | extra |')))
      .toThrow(/row 1 has 4 cells/);
  });
});

describe('seedOnRequest and checkOnRequest', () => {
  it('seeds rows from a page\'s section, in page then document order', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-onreq-root-'));
    mkdirSync(join(root, 'Datasets'));
    writeFileSync(join(root, 'Datasets', 'Cow.md'),
      '# Cow\n\n## Data on request\n\n| Study | Paper | Data availability statement |\n|---|---|---|\n' +
      '| One | [DOI](https://doi.org/10.1000/one) | "Ask." |\n| Two | [DOI](https://doi.org/10.1000/two) | "Ask too." |\n');
    const db = openDb();
    expect(seedOnRequest(db, root)).toBe(2);
    expect(db.prepare('SELECT doi,page,study,statement,ordinal FROM datasets_on_request ORDER BY ordinal').all()).toEqual([
      { doi: '10.1000/one', page: 'Cow', study: 'One', statement: 'Ask.', ordinal: 0 },
      { doi: '10.1000/two', page: 'Cow', study: 'Two', statement: 'Ask too.', ordinal: 1 },
    ]);
  });

  it('passes a well-formed row', () => {
    expect(result(dbWith('Cow', [ROW])).ok).toBe(true);
  });

  it('refuses a row that is not a bare lowercase DOI, sits on Benchmarks or an unknown page, or would break the table', () => {
    const bad: [string, string, typeof ROW][] = [
      ['uppercase DOI', 'Cow', { ...ROW, doi: '10.1000/ABC' }],
      ['not a DOI', 'Cow', { ...ROW, doi: 'https://doi.org/10.1000/abc' }],
      ['Benchmarks', 'Benchmarks', ROW],
      ['unknown page', 'Narnia', ROW],
      ['pipe in statement', 'Cow', { ...ROW, statement: 'a | b' }],
      ['line break in study', 'Cow', { ...ROW, study: 'a\nb' }],
      ['trailing space in study', 'Cow', { ...ROW, study: 'A study (Author et al. 2024) ' }],
      ['empty statement', 'Cow', { ...ROW, statement: '  ' }],
    ];
    for (const [why, page, row] of bad) {
      const r = result(dbWith(page, [row]));
      expect(r.ok, why).toBe(false);
      expect(r.detail, why).toContain(row.doi);
    }
  });

  it('refuses a row whose page has no Markdown file', () => {
    const empty = mkdtempSync(join(tmpdir(), 'caail-onreq-empty-'));
    expect(result(dbWith('Cow', [ROW]), empty).detail).toContain('does not exist');
  });
});

describe('held DOIs, link-safe DOIs and statements the page shows as stored', () => {
  it('refuses an on-request DOI that a curated entry\'s heading links, when its doi column is empty', () => {
    const db = dbWith('Cow', [ROW]);
    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare("INSERT INTO dataset_entries(item_id,name,url,page,section,kind,heading_md,body_md,doi,doi_source,ordinal) VALUES('ds:linked-entry','E','https://doi.org/10.1000/ABC','Cow','S','other','[E](https://doi.org/10.1000/ABC)','b',NULL,NULL,0)").run();
    expect(result(db).detail).toContain('also the paper of ds:linked-entry');
  });

  it('refuses a DOI whose [DOI](…) link would resolve to another one: a ?, #, % or backslash', () => {
    for (const doi of ['10.1000/a?b', '10.1000/a#b', '10.1000/a%41', '10.1000/a\\_b']) {
      const r = result(dbWith('Cow', [{ ...ROW, doi }]));
      expect(r.ok, doi).toBe(false);
      expect(r.detail, doi).toContain(`${doi}: cannot sit whole in its [DOI](https://doi.org/…) link`);
    }
  });

  it('refuses a statement holding Markdown or HTML the page would render differently from the stored words', () => {
    const altered = [
      'See *Table 1*.', 'the _final_ data', 'Data ~~withdrawn~~ on request.', 'Ask the author<sup>1</sup>.',
      'Data \\* on request.', 'Use `code`.', 'R&amp;D data.', 'See [here](https://x.org).', 'See <https://x.org>.',
    ];
    for (const statement of altered) {
      const r = result(dbWith('Cow', [{ ...ROW, statement }]));
      expect(r.ok, statement).toBe(false);
      expect(r.detail, statement).toContain(`${ROW.doi}: statement holds Markdown or HTML`);
    }
  });

  it('passes a statement whose bare URL or email address the page links but shows unchanged', () => {
    expect(result(dbWith('Cow', [{ ...ROW, statement: 'Ask a.b@uni.edu or see https://zenodo.org/r/1 and data_v1_final.' }])).ok).toBe(true);
  });

  it('refuses a statement stored inside its own quotes, which the page would show doubled', () => {
    const r = result(dbWith('Cow', [{ ...ROW, statement: '"Data will be made available on request."' }]));
    expect(r.ok).toBe(false);
    expect(r.detail).toContain(`${ROW.doi}: statement is stored inside its own quotes`);
    expect(result(dbWith('Cow', [{ ...ROW, statement: '"Raw" data will be made available on request.' }])).ok).toBe(true);
  });
});

describe('ordinals number each page\'s list on its own', () => {
  const insert = (db: Db, rows: [string, string, number][]) => {
    const ins = db.prepare('INSERT INTO datasets_on_request(doi,page,study,statement,ordinal) VALUES(?,?,?,?,?)');
    for (const [doi, page, ordinal] of rows) ins.run(doi, page, 'S', 'Ask.', ordinal);
    return db;
  };

  it('passes a row added on one page without renumbering another', () => {
    const db = insert(openDb(), [['10.1000/cow-a', 'Cow', 0], ['10.1000/cow-b', 'Cow', 1], ['10.1000/fish', 'Fish', 0]]);
    expect(result(db).ok).toBe(true);
  });

  it('refuses an ordinal out of place on its own page: a gap, or two rows given one ordinal', () => {
    const gap = insert(openDb(), [['10.1000/a', 'Cow', 0], ['10.1000/b', 'Cow', 2], ['10.1000/fish', 'Fish', 0]]);
    expect(result(gap).detail).toContain('10.1000/b: ordinal 2 is out of place');
    expect(result(gap).detail).not.toContain('10.1000/fish');
    const tie = insert(openDb(), [['10.1000/a', 'Cow', 0], ['10.1000/b', 'Cow', 0]]);
    expect(result(tie).detail).toContain('10.1000/b: ordinal 0 is out of place');
  });

  it('has bootstrap number each page\'s rows from 0, in table order', () => {
    const root = mkdtempSync(join(tmpdir(), 'caail-onreq-per-page-'));
    mkdirSync(join(root, 'Datasets'));
    const table = (dois: string[]) => '# P\n\n## Data on request\n\n| Study | Paper | Data availability statement |\n|---|---|---|\n' +
      dois.map((d) => `| S | [DOI](https://doi.org/${d}) | "Ask." |\n`).join('');
    writeFileSync(join(root, 'Datasets', 'Cow.md'), table(['10.1000/cow']));
    writeFileSync(join(root, 'Datasets', 'Fish.md'), table(['10.1000/fish-a', '10.1000/fish-b']));
    const db = openDb();
    seedOnRequest(db, root);
    expect(db.prepare('SELECT doi,page,ordinal FROM datasets_on_request ORDER BY page, ordinal').all()).toEqual([
      { doi: '10.1000/cow', page: 'Cow', ordinal: 0 },
      { doi: '10.1000/fish-a', page: 'Fish', ordinal: 0 },
      { doi: '10.1000/fish-b', page: 'Fish', ordinal: 1 },
    ]);
  });

  it('serves the rows in ON_REQUEST_PAGES order, then each page\'s own order', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-onreq-api-order-'));
    const rows = [['10.1000/a', 'CHOReference', 0], ['10.1000/b', 'Cow', 0], ['10.1000/c', 'Cow', 1]] as const;
    writeFileSync(join(dir, 'datasets_on_request.ndjson'),
      rows.map(([doi, page, ordinal]) => JSON.stringify({ doi, page, study: 'S', statement: 'Ask.', ordinal })).join('\n') + '\n');
    expect(readOnRequestRows(dir).map((r) => r.doi)).toEqual(['10.1000/b', '10.1000/c', '10.1000/a']);
  });

  it('exports the NDJSON grouped by page, so a row added on one page moves no other page\'s lines', () => {
    const db = insert(openDb(), [['10.1000/cow-a', 'Cow', 0], ['10.1000/fish', 'Fish', 0], ['10.1000/cow-b', 'Cow', 1]]);
    const dir = mkdtempSync(join(tmpdir(), 'caail-onreq-export-'));
    exportNdjson(db, dir);
    const lines = readFileSync(join(dir, 'datasets_on_request.ndjson'), 'utf-8').trim().split('\n');
    expect(lines.map((l) => (JSON.parse(l) as { doi: string }).doi)).toEqual(['10.1000/cow-a', '10.1000/cow-b', '10.1000/fish']);
  });
});

describe('a section on a page no page list names', () => {
  const SECTION = '## Data on request\n\n| Study | Paper | Data availability statement |\n|---|---|---|\n| S | [DOI](https://doi.org/10.1000/a) | "Ask." |\n';
  const rootWith = (name: string, text: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'caail-onreq-unlisted-'));
    mkdirSync(join(root, 'Datasets'));
    writeFileSync(join(root, 'Datasets', name), text);
    return root;
  };

  it('has bootstrap and parse refuse it on a new dataset page or the index, rather than ignore it', () => {
    expect(() => readPagesOnRequest(rootWith('Rabbit.md', `# Rabbit\n\n${SECTION}`))).toThrow(/Rabbit\.md has a "## Data on request" section/);
    expect(() => seedOnRequest(openDb(), rootWith('Rabbit.md', `# Rabbit\n\n${SECTION}`))).toThrow(/Rabbit\.md/);
    expect(() => readPagesOnRequest(rootWith('README.md', `# Datasets\n\n${SECTION}`))).toThrow(/README\.md has a "## Data on request" section/);
  });

  it('leaves the directory\'s CLAUDE.md and a private .local.md alone, since neither is a published page', () => {
    expect(readPagesOnRequest(rootWith('CLAUDE.md', `# Schema\n\n${SECTION}`))).toEqual([]);
    expect(readPagesOnRequest(rootWith('Rabbit.local.md', `# Notes\n\n${SECTION}`))).toEqual([]);
  });
});

describe('the Data on request list on the real corpus', () => {
  it('round-trips every page that may carry one', () => {
    const db = importNdjson();
    for (const page of ON_REQUEST_PAGES) {
      const src = join(REPO_ROOT, 'Datasets', `${page}.md`);
      const out = join(TMP, `real-${page}.md`);
      writeFileSync(out, emitDatasetPage(db, src, page));
      expect(extractOnRequest(out), page).toEqual(extractOnRequest(src));
    }
  });

  it('is what a fresh seed from the pages writes, ordinals included', () => {
    const db = openDb();
    seedOnRequest(db, REPO_ROOT);
    type Placed = { page: string; ordinal: number };
    const byPlace = (a: Placed, b: Placed): number => a.page.localeCompare(b.page) || a.ordinal - b.ordinal;
    const seeded = db.prepare('SELECT doi, page, study, statement, ordinal FROM datasets_on_request').all() as Placed[];
    expect(seeded.sort(byPlace)).toEqual(readOnRequestRows().sort(byPlace));
  });

  it('serves every committed row through the parser, in order, marked on-request and never as a dataset id', () => {
    const stored = readOnRequestRows();
    const studies = buildOnRequestStudies();
    expect(stored.length).toBeGreaterThan(0);
    expect(studies).toEqual(stored.map((r) => ({
      page: r.page, study: cellText(r.study), paperDoi: r.doi, statement: r.statement, dataStatus: 'on-request',
    })));
  });

  it('serves the study as plain text where the page\'s cell carries Markdown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'caail-onreq-plain-'));
    writeFileSync(join(dir, 'datasets_on_request.ndjson'),
      JSON.stringify({ doi: '10.1000/abc', page: 'Fish', study: 'Cells from flounder (*Paralichthys olivaceus*)', statement: 'Ask.', ordinal: 0 }) + '\n');
    expect(buildOnRequestStudies(readOnRequestRows(dir))[0]!.study).toBe('Cells from flounder (Paralichthys olivaceus)');
  });
});
