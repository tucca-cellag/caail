/**
 * llms-corpus-date.ts: the corpus date both llmstxt.org files carry, the day CAAIL's catalog data
 * last changed, or the build date in a checkout with no git history
 * (tucca-cellag/caail-planning#289).
 *
 * The date is `readCorpusDate`'s, the one every file under `public/api/` already carries, and it
 * is never typed. It dates the catalog data, not the file: it moves only when `site/db/ndjson`
 * changes (with no git history to read, `readCorpusDate` falls back to the build date, and the
 * note says so), while both files hold prose that changes without it. So two copies with the same date
 * can still differ, and a matching date does not show that a copy is current. The note says so,
 * and tells a reader of any copy to fetch the canonical one instead of comparing dates.
 *
 * The two files reach the date differently because they are made differently:
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
import { CORPUS_DATE_FORMAT } from './corpus-date-format.js';

/** The files that carry the note, named as they are served from the site root. */
export type LlmsFile = 'llms.txt' | 'llms-full.txt';

/**
 * Every corpus-date line starts with this label, which is how the line in `llms.txt` is found.
 * The space after it is not part of the match: a placeholder `Corpus date:` whose trailing space
 * an editor trimmed on save is still the line parse writes.
 */
export const CORPUS_DATE_PREFIX = 'Corpus date:';

/**
 * The note: the date and what it dates, where the canonical copy is served, and what a reader of
 * any other copy should do. The last sentence is the one that does the work, for an agent with no
 * idea that the file in front of it is a copy: it says a matching date proves nothing, since the
 * prose can change without moving the date, and to fetch the canonical copy.
 */
export function corpusDateNote(date: string, file: LlmsFile): string {
  if (!CORPUS_DATE_FORMAT.test(date)) {
    throw new Error(`llms corpus date: "${date}" is not a YYYY-MM-DD date`);
  }
  return (
    `${CORPUS_DATE_PREFIX} ${date}, the day CAAIL's catalog data last changed ` +
    "(the agent API's corpusDate; a checkout with no git history uses the build date instead). " +
    `The canonical copy of this file is ${SITE_URL}${file}. ` +
    'Its prose can change without moving that date, so a copy read anywhere else may be out of date ' +
    'even when the dates match: fetch the canonical copy before relying on it.'
  );
}

/**
 * The index of the one corpus-date line in `lines` (a file's text split on `\n`). A line counts
 * only when it starts with `Corpus date:`, so the phrase in running prose is left alone. Throws
 * when there is no such line or more than one: a missing line would leave the file undated in
 * silence, and two would leave a reader to choose between them. `file` names the file in the
 * error.
 */
export function findCorpusDateLine(lines: readonly string[], file: string): number {
  const at = lines.flatMap((line, i) => (line.startsWith(CORPUS_DATE_PREFIX) ? [i] : []));
  if (at.length !== 1) {
    throw new Error(
      `${file}: expected exactly one line starting "${CORPUS_DATE_PREFIX}", found ${at.length}. ` +
        'Keep one such line where the date should appear; pnpm parse writes the rest of it.',
    );
  }
  return at[0]!;
}

/**
 * `text` with its one corpus-date line (`findCorpusDateLine`) replaced by the current note.
 * Throws as `findCorpusDateLine` does. On a CRLF checkout each line split on `\n` keeps its `\r`,
 * so the stamped line keeps the one it had: dropping it would leave mixed line endings and make
 * an already-current file read as rewritten.
 */
export function stampCorpusDate(text: string, date: string, file: LlmsFile): string {
  const lines = text.split('\n');
  const at = findCorpusDateLine(lines, file);
  lines[at] = corpusDateNote(date, file) + (lines[at]!.endsWith('\r') ? '\r' : '');
  return lines.join('\n');
}

/** `llms.txt` stamped in memory by `stampLlmsTxt`, for `writeStampedLlmsTxt` to write. */
export interface StampedLlmsTxt {
  path: string;
  text: string;
  /** Whether `text` differs from the file on disk. */
  changed: boolean;
}

/**
 * Read `<publicDir>/llms.txt` and stamp it with `date`, writing nothing. It throws as
 * `stampCorpusDate` does, so parse calls it before its first write: a bad llms.txt then fails
 * the parse with nothing written.
 */
export function stampLlmsTxt(publicDir: string, date: string): StampedLlmsTxt {
  const path = join(publicDir, 'llms.txt');
  const before = readFileSync(path, 'utf-8');
  const text = stampCorpusDate(before, date, 'llms.txt');
  return { path, text, changed: text !== before };
}

/** Write a stamped llms.txt if it changed; returns whether it did. */
export function writeStampedLlmsTxt(stamped: StampedLlmsTxt): boolean {
  if (stamped.changed) writeFileSync(stamped.path, stamped.text, 'utf-8');
  return stamped.changed;
}
