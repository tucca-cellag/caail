/**
 * llms-corpus-date.ts: the corpus date both llmstxt.org files carry, so that a copy of either,
 * wherever it was taken from and whoever took it, can say how old it is
 * (tucca-cellag/caail-planning#289).
 *
 * The date is `readCorpusDate`'s, the one every file under `public/api/` already carries, and it
 * is never typed. The two files reach it differently because they are made differently:
 *
 * - `llms-full.txt` is generated, so `buildHeader` writes the note into its header.
 * - `llms.txt` is hand-authored and committed, so `pnpm parse` rewrites its one `Corpus date:` line
 *   in place, and `lint-papers.yml`'s sync guard fails a commit whose line parse would change, the
 *   same way it fails a stale agent API. Typing a date there by hand would put a hand-typed fact
 *   beside the machine-derived one, the defect `CLAUDE.md`'s Gotchas section names.
 *
 * The canonical address comes from `SITE_URL`, which the site config and the agent API already
 * share, so a move of the site moves it too.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SITE_URL } from '../../src/content/site-config.ts';

/** The files that carry the note, named as they are served from the site root. */
export type LlmsFile = 'llms.txt' | 'llms-full.txt';

/** Every corpus-date line starts with this, which is how the line in `llms.txt` is found. */
export const CORPUS_DATE_PREFIX = 'Corpus date: ';

/**
 * The note: the date, where the canonical copy is served, and what a reader of any other copy
 * should do. The last clause is the one that does the work, for an agent with no idea that the
 * file in front of it is a copy.
 */
export function corpusDateNote(date: string, file: LlmsFile): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`llms corpus date: "${date}" is not a YYYY-MM-DD date`);
  }
  return (
    `${CORPUS_DATE_PREFIX}${date}. The canonical copy of this file is ${SITE_URL}${file}; ` +
    'a copy read anywhere else may be out of date, so compare its corpus date with the canonical ' +
    'copy before relying on it.'
  );
}

/**
 * `text` with its one corpus-date line replaced by the current note. A line counts only when it
 * starts with `Corpus date: `, so the phrase in running prose is left alone. Throws when there is
 * no such line or more than one: a missing line would leave the file undated in silence, and two
 * would leave a reader to choose between them.
 */
export function stampCorpusDate(text: string, date: string, file: LlmsFile): string {
  const lines = text.split('\n');
  const at = lines.flatMap((line, i) => (line.startsWith(CORPUS_DATE_PREFIX) ? [i] : []));
  if (at.length !== 1) {
    throw new Error(
      `${file}: expected exactly one line starting "${CORPUS_DATE_PREFIX}", found ${at.length}. ` +
        'Keep one such line where the date should appear; pnpm parse writes the rest of it.',
    );
  }
  lines[at[0]!] = corpusDateNote(date, file);
  return lines.join('\n');
}

/** Stamp `<publicDir>/llms.txt` in place with `date`; returns whether the file changed. */
export function writeLlmsTxtDate(publicDir: string, date: string): boolean {
  const path = join(publicDir, 'llms.txt');
  const before = readFileSync(path, 'utf-8');
  const after = stampCorpusDate(before, date, 'llms.txt');
  if (after === before) return false;
  writeFileSync(path, after, 'utf-8');
  return true;
}
