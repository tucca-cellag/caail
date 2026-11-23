/**
 * llms-corpus-date.test.ts: both llmstxt.org files carry the corpus date the agent API carries,
 * written by parse and never typed (tucca-cellag/caail-planning#289). llms-full.txt's header is
 * checked in llms-full.test.ts, against the text that suite already builds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SITE_URL } from '../../src/content/site-config.ts';
import { corpusDateNote, findCorpusDateLine, stampCorpusDate } from './llms-corpus-date.js';
import { CORPUS_DATE_COVERS, CORPUS_DATE_EXCLUDES } from './corpus-date-format.js';
import { PUBLIC_DIR } from './llms-full.js';

describe('corpusDateNote', () => {
  it('says what the date dates, where the canonical copy is, and that matching dates prove nothing', () => {
    expect(corpusDateNote('2026-11-14', 'llms.txt')).toBe(
      `Corpus date: 2026-11-14, the date stamped on the newest version of ${CORPUS_DATE_COVERS}, ` +
        'which the agent API serves as corpusDate. It can differ from the day that version went live (usually earlier), ' +
        `and it does not date ${CORPUS_DATE_EXCLUDES}. ` +
        `The canonical copy of this file is ${SITE_URL}llms.txt. ` +
        'Its prose can change without moving that date, so a copy read anywhere else may be out of date ' +
        'even when the dates match: fetch the canonical copy before relying on it.',
    );
  });

  it('names the canonical copy of the file it is written into', () => {
    expect(corpusDateNote('2026-11-14', 'llms-full.txt')).toContain(`is ${SITE_URL}llms-full.txt. `);
    expect(corpusDateNote('2026-11-14', 'llms-full.txt')).not.toContain(`${SITE_URL}llms.txt`);
  });

  it('never tells a reader that comparing dates shows a copy is current', () => {
    // The date moves only with the corpus stamp, and the prose moves without it, so a stale
    // copy can carry the canonical copy's date.
    expect(corpusDateNote('2026-11-14', 'llms.txt')).not.toMatch(/compar/i);
  });

  it('refuses anything that is not a YYYY-MM-DD date', () => {
    for (const bad of ['', '2026-11-1', 'Nov 14 2026', '2026-11-14T00:00:00Z']) {
      expect(() => corpusDateNote(bad, 'llms.txt'), bad).toThrow(/not a YYYY-MM-DD date/);
    }
  });
});

describe('findCorpusDateLine', () => {
  it('returns the index of the one line that starts with the prefix', () => {
    expect(findCorpusDateLine(['# Title', 'The phrase Corpus date: mid-line', 'Corpus date: x', ''], 'llms.txt')).toBe(2);
  });

  it('finds a bare placeholder whose trailing space an editor trimmed', () => {
    // The refusal below tells a maintainer to keep one such line and let parse write the rest,
    // so the line they are told to keep has to be found with or without the space after it.
    expect(findCorpusDateLine(['# Title', '', 'Corpus date:', ''], 'llms.txt')).toBe(2);
    expect(findCorpusDateLine(['# Title', '', 'Corpus date:\r', ''], 'llms.txt')).toBe(2);
  });

  it('refuses none and two, naming the file', () => {
    expect(() => findCorpusDateLine(['# Title'], 'site/public/llms.txt')).toThrow(/^site\/public\/llms\.txt: .*found 0/);
    expect(() => findCorpusDateLine(['Corpus date: a', 'Corpus date: b'], 'llms.txt')).toThrow(/found 2/);
  });
});

describe('stampCorpusDate', () => {
  const page = ['# Title', '', '> Summary.', '', 'Corpus date: (pnpm parse writes this line)', '', 'Body.'].join('\n');

  it('replaces the one corpus-date line and leaves every other line as it was', () => {
    const out = stampCorpusDate(page, '2026-11-14', 'llms.txt').split('\n');
    expect(out[4]).toBe(corpusDateNote('2026-11-14', 'llms.txt'));
    expect(out.filter((_, i) => i !== 4)).toEqual(page.split('\n').filter((_, i) => i !== 4));
  });

  it('writes the note over a bare placeholder as it does over a full line', () => {
    const bare = page.replace('Corpus date: (pnpm parse writes this line)', 'Corpus date:');
    expect(stampCorpusDate(bare, '2026-11-14', 'llms.txt')).toBe(stampCorpusDate(page, '2026-11-14', 'llms.txt'));
  });

  it('is idempotent, so a second parse changes nothing', () => {
    const once = stampCorpusDate(page, '2026-11-14', 'llms.txt');
    expect(stampCorpusDate(once, '2026-11-14', 'llms.txt')).toBe(once);
  });

  it('refuses a file with no corpus-date line, rather than leaving it undated', () => {
    expect(() => stampCorpusDate('# Title\n\nBody.', '2026-11-14', 'llms.txt')).toThrow(/found 0/);
  });

  it('refuses a file with two, rather than leaving a reader to choose', () => {
    expect(() => stampCorpusDate(`${page}\nCorpus date: again`, '2026-11-14', 'llms.txt')).toThrow(/found 2/);
  });

  describe('on a CRLF checkout', () => {
    const crlf = (text: string) => text.split('\n').join('\r\n');

    it('returns a file already carrying the date byte for byte, so parse reports it unchanged', () => {
      const current = crlf(`${stampCorpusDate(page, '2026-11-14', 'llms.txt')}\n`);
      expect(stampCorpusDate(current, '2026-11-14', 'llms.txt')).toBe(current);
    });

    it('keeps CRLF on every line when it rewrites an old date', () => {
      const old = crlf(`${stampCorpusDate(page, '2026-01-02', 'llms.txt')}\n`);
      const out = stampCorpusDate(old, '2026-11-14', 'llms.txt');
      expect(out.replaceAll('\r\n', '')).not.toContain('\n');
      expect(out).toBe(crlf(`${stampCorpusDate(page, '2026-11-14', 'llms.txt')}\n`));
    });
  });

  it('does not count the phrase in running prose', () => {
    const prose = `${page}\nThe line reading Corpus date: is written by parse.`;
    expect(() => stampCorpusDate(prose, '2026-11-14', 'llms.txt')).not.toThrow();
  });
});

describe('llms.txt on disk', () => {
  // This reads the files on disk, not the committed ones: in CI, test.yml runs `pnpm build`
  // (which parses, rewriting llms.txt and api/index.json) before `pnpm test`. So it checks that
  // the two outputs of one parse agree. lint-papers.yml's sync guard is the committed-file check:
  // it re-runs parse and fails on any diff to site/public/llms.txt.
  it("has one corpus-date line, in parse's own words, agreeing with api/index.json's corpusDate", () => {
    const lines = readFileSync(join(PUBLIC_DIR, 'llms.txt'), 'utf-8').split('\n');
    // A CRLF checkout leaves `\r` on the line (stampCorpusDate keeps it), so compare without it.
    const dated = lines[findCorpusDateLine(lines, 'llms.txt')]!.replace(/\r$/, '');
    const { corpusDate } = JSON.parse(readFileSync(join(PUBLIC_DIR, 'api', 'index.json'), 'utf-8')) as { corpusDate: string };
    expect(
      dated,
      "llms.txt's corpus-date line disagrees with api/index.json's corpusDate: run pnpm --dir site parse",
    ).toBe(corpusDateNote(corpusDate, 'llms.txt'));
  });
});
