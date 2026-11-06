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
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDb, importNdjson, REPO_ROOT, type Db } from './lib.js';
import { emitDatasetPage } from './emit.js';
import { extractOnRequest, ON_REQUEST_HEADING } from './extract.js';
import { seedOnRequest } from './seed.js';
import { checkOnRequest, ON_REQUEST_LABEL } from './check.js';
import { isEntryHeading, ON_REQUEST_PAGES } from '../parser/datasets.js';
import { buildOnRequestStudies, onRequestDrift } from '../parser/datasets-on-request.js';

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

describe('round 1 fixes', () => {
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

  it('serves the committed rows through the parser, each marked on-request and never as a dataset id', () => {
    const studies = buildOnRequestStudies();
    expect(studies.map((s) => s.paperDoi)).toEqual([
      '10.1016/j.ygeno.2024.110903', '10.3390/cells12182325', '10.1002/bit.70190', '10.1038/s41598-023-49257-0',
    ]);
    for (const s of studies) {
      expect(s.dataStatus).toBe('on-request');
      expect(Object.keys(s)).not.toContain('id');
    }
    // The page's cell italicises the species; the API serves the title as plain text.
    expect(studies.find((s) => s.paperDoi === '10.3390/cells12182325')!.study).toContain('(Paralichthys olivaceus)');
  });
});
