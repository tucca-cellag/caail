/**
 * llms-corpus-date.test.ts: both llmstxt.org files carry the corpus date the agent API carries,
 * written by parse and never typed (tucca-cellag/caail-planning#289).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SITE_URL } from '../../src/content/site-config.ts';
import { readCorpusDate } from './agent-api.js';
import { CORPUS_DATE_PREFIX, corpusDateNote, stampCorpusDate } from './llms-corpus-date.js';
import { buildLlmsFullText } from './llms-full.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

describe('corpusDateNote', () => {
  it('names the date and the canonical copy of the file it is written into', () => {
    const note = corpusDateNote('2026-11-14', 'llms.txt');
    expect(note.startsWith(`${CORPUS_DATE_PREFIX}2026-11-14. `)).toBe(true);
    expect(note).toContain(`${SITE_URL}llms.txt;`);
    expect(corpusDateNote('2026-11-14', 'llms-full.txt')).toContain(`${SITE_URL}llms-full.txt;`);
  });

  it('refuses anything that is not a YYYY-MM-DD date', () => {
    for (const bad of ['', '2026-11-1', 'Nov 14 2026', '2026-11-14T00:00:00Z']) {
      expect(() => corpusDateNote(bad, 'llms.txt'), bad).toThrow(/not a YYYY-MM-DD date/);
    }
  });
});

describe('stampCorpusDate', () => {
  const page = ['# Title', '', '> Summary.', '', 'Corpus date: (pnpm parse writes this line)', '', 'Body.'].join('\n');

  it('replaces the one corpus-date line and leaves every other line as it was', () => {
    const out = stampCorpusDate(page, '2026-11-14', 'llms.txt').split('\n');
    expect(out[4]).toBe(corpusDateNote('2026-11-14', 'llms.txt'));
    expect(out.filter((_, i) => i !== 4)).toEqual(page.split('\n').filter((_, i) => i !== 4));
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

  it('does not count the phrase in running prose', () => {
    const prose = `${page}\nThe line reading Corpus date: is written by parse.`;
    expect(() => stampCorpusDate(prose, '2026-11-14', 'llms.txt')).not.toThrow();
  });
});

describe('the served files', () => {
  it("the committed llms.txt carries one corpus-date line, in parse's own words, dated as the agent API is", () => {
    const lines = readFileSync(join(PUBLIC_DIR, 'llms.txt'), 'utf-8').split('\n');
    const dated = lines.filter((l) => l.startsWith(CORPUS_DATE_PREFIX));
    expect(dated).toHaveLength(1);
    // Two outputs of the same parse: if they disagree, one of them is stale or was edited by hand.
    const { corpusDate } = JSON.parse(readFileSync(join(PUBLIC_DIR, 'api', 'index.json'), 'utf-8')) as { corpusDate: string };
    expect(dated[0], 'run pnpm --dir site parse and commit site/public/llms.txt').toBe(corpusDateNote(corpusDate, 'llms.txt'));
  });

  it("llms-full.txt's header carries the note for the corpus it concatenates", () => {
    const header = buildLlmsFullText(REPO_ROOT).split('\n# ===== ')[0]!;
    expect(header).toContain(corpusDateNote(readCorpusDate(REPO_ROOT), 'llms-full.txt'));
  });
});
