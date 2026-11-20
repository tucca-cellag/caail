/**
 * corpus-stamp.ts: the corpus date, stored as data beside the NDJSON it dates
 * (tucca-cellag/caail-planning#655).
 *
 * Every file under `site/public/api/` carries a `corpusDate`, and `site/public/llms.txt` carries
 * the same date on its `Corpus date:` line. It used to be derived from git, as the committer date
 * of the last commit touching `site/db/ndjson`, which made every catalog edit its own input: the
 * API parsed before the commit carried the previous commit's date, so `lint-papers.yml`'s sync
 * guard failed a correct tree, and a rebase or amend across UTC midnight moved the date again. A
 * date stored in a file that the edit itself changes has neither problem.
 *
 * The stamp is `corpus-stamp.json`, beside the `ndjson/` directory it dates, holding the date and
 * a sha256 of that directory's table files (`hashNdjson`). `stampCorpus` rewrites it whenever the
 * stored hash no longer matches, dated the stamping machine's UTC day. Every db command that writes
 * the NDJSON runs it as its last step, and so does `db:emit`, which ends every edit flow, a hand
 * edit to the NDJSON included; `db:stamp` runs it alone. `readStampedDate`, behind the parser's
 * `readCorpusDate`, and `db:check` both refuse a stamp whose hash does not match, so nothing can be
 * written or merged with a date that does not belong to its corpus.
 *
 * What the date means follows from that: the day the newest version of the corpus was stamped. That
 * is usually the day a change was made, or the day of the merge when a merge forced a re-stamp,
 * rather than the day it reached main. A change that moves it back on main is refused, except in the
 * few cases `check-stamp-order.ts`'s header lists. Two branches that each
 * change the corpus each change the stamp's hash line, so git reports a conflict on the stamp
 * whichever NDJSON files they touched. Either side of that conflict usually leaves a hash matching
 * neither, which `db:check` refuses until a re-stamp; when one side's NDJSON already contains the
 * other's, that side's stamp can still match and keep its older date, which the order guard below
 * refuses as going back. So a stamp conflict is resolved with `db:stamp --redate`, which dates the
 * merge that day either way, unless the merged NDJSON is identical to main's, when main's stamp is
 * restored instead (the same corpus keeps its stamp). A revert or a
 * cherry-pick of a corpus commit restores an earlier stamp with its NDJSON, so the hash matches;
 * `db:check-stamp-order` (check-stamp-order.ts, run by `lint-papers.yml` against the tree a change
 * lands on) refuses one dated earlier than the tree's, and one dated in the future, until it is
 * re-dated with `db:stamp --redate` (`stampCorpus`'s `redate`). Its header says what it lets
 * through.
 *
 * It takes the table list and `RefusalError` from `lib.ts` and nothing else from the DB layer, and needs no git, so
 * `pnpm parse` dates its output the same way in a shallow clone or a tarball.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CORPUS_DATE_FORMAT } from '../parser/corpus-date-format.js';
import { RefusalError, TABLES_PK } from './lib.js';

/** The stamp's file name. It lives beside the `ndjson/` directory it dates (`stampPathFor`). */
export const STAMP_FILE = 'corpus-stamp.json';

/** The command that stamps the NDJSON as it stands, named by every refusal. */
export const STAMP_COMMAND = 'pnpm --dir site db:stamp';

/** What the stamp holds: the day it was stamped (UTC) and the hash of the NDJSON it dates. */
export interface CorpusStamp {
  date: string;
  sha256: string;
}

/** A repo's NDJSON directory, `site/db/ndjson`. */
export function ndjsonDirOf(repoRoot: string): string {
  return join(repoRoot, 'site', 'db', 'ndjson');
}

/** Where the stamp for `ndjsonDir` lives: beside it, so a fixture's stamp stays in the fixture. */
export function stampPathFor(ndjsonDir: string): string {
  return join(dirname(ndjsonDir), STAMP_FILE);
}

/**
 * The files the stamp hashes: one per table `importNdjson` reads, in name order. Any other file in
 * the directory is ignored, as the importer ignores it, so a stray or untracked one (a scratch
 * export, a mergetool's `_BACKUP_` copy) cannot give a local checkout a hash CI never sees.
 */
export const STAMPED_FILES: readonly string[] = Object.keys(TABLES_PK).map((t) => `${t}.ndjson`).sort();

/** `bytes` with every CR that ends a CRLF pair removed, and nothing else touched. */
function foldCrlf(bytes: Buffer): Buffer {
  const out = Buffer.allocUnsafe(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[n++] = bytes[i]!;
  }
  return out.subarray(0, n);
}

/**
 * The sha256 over `files` in `ndjsonDir`, each contributing its name and the sha256 of its bytes.
 * A missing or empty file contributes nothing, since `importNdjson` reads both as an empty table,
 * so a table added to `TABLES_PK` with no rows yet leaves the hash, and the date, alone. It hashes
 * the raw bytes, never decoded text, so two different invalid UTF-8 sequences cannot hash alike;
 * and it hashes the files, not what the importer builds from them, so a file holding only
 * whitespace, which the importer reads as an empty table, still moves the hash and the stamp
 * answers for exactly what is committed. The name is in it so content moved between tables
 * changes the hash. CRLF pairs are folded to LF first, the one change made to the bytes: there is
 * no `.gitattributes`, `importNdjson` already tolerates CRLF, and without the fold a Windows
 * checkout with `core.autocrlf` would fail `db:check` on a tree identical to the commit. Throws
 * when `ndjsonDir` is not a readable directory, since every table would otherwise read as empty.
 */
export function hashNdjson(ndjsonDir: string, files: readonly string[] = STAMPED_FILES): string {
  readdirSync(ndjsonDir);
  const all = createHash('sha256');
  for (const name of files) {
    const path = join(ndjsonDir, name);
    const bytes = existsSync(path) ? foldCrlf(readFileSync(path)) : Buffer.alloc(0);
    if (bytes.length === 0) continue;
    all.update(`${name}\n${createHash('sha256').update(bytes).digest('hex')}\n`);
  }
  return all.digest('hex');
}

const SHA256 = /^[0-9a-f]{64}$/;

/** Whether `date` is a `YYYY-MM-DD` day the calendar has (the regex alone passes `2026-02-30`). */
function isCalendarDay(date: string): boolean {
  if (!CORPUS_DATE_FORMAT.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** The stamp in `text`, or why it is not one. Exactly the two keys, so the file holds only what it says. */
export function parseStamp(text: string): { stamp: CorpusStamp } | { problem: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { problem: 'is not valid JSON' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { problem: 'is not a JSON object' };
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'date,sha256') {
    return { problem: `has the keys [${keys.join(', ')}], not exactly date and sha256` };
  }
  const { date, sha256 } = value as Record<string, unknown>;
  if (typeof date !== 'string' || !isCalendarDay(date)) {
    return { problem: `has the date ${JSON.stringify(date)}, which is not a YYYY-MM-DD calendar day` };
  }
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) {
    return { problem: `has the sha256 ${JSON.stringify(sha256)}, which is not 64 lowercase hex digits` };
  }
  return { stamp: { date, sha256 } };
}

/** What `inspectStamp` found: the stamp if it parsed, the NDJSON's hash, and the problem, if any. */
export interface StampInspection {
  path: string;
  stamp: CorpusStamp | null;
  /** The NDJSON's hash, or null when the NDJSON could not be read, which no stamp can fix. */
  actual: string | null;
  /** Null when the stamp parses and its hash matches the NDJSON. */
  problem: string | null;
}

/** Read the stamp beside `ndjsonDir` and compare it with the NDJSON as it stands. Writes nothing. */
export function inspectStamp(ndjsonDir: string): StampInspection {
  const path = stampPathFor(ndjsonDir);
  let actual: string;
  try {
    actual = hashNdjson(ndjsonDir);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { path, stamp: null, actual: null, problem: `the NDJSON in ${ndjsonDir} could not be read (${reason})` };
  }
  if (!existsSync(path)) return { path, stamp: null, actual, problem: `${path} does not exist` };
  let text: string;
  try {
    text = readFileSync(path, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { path, stamp: null, actual, problem: `${path} could not be read (${reason})` };
  }
  const parsed = parseStamp(text);
  if ('problem' in parsed) return { path, stamp: null, actual, problem: `${path} ${parsed.problem}` };
  const { stamp } = parsed;
  if (stamp.sha256 !== actual) {
    return {
      path,
      stamp,
      actual,
      problem:
        `${path} records the NDJSON hash ${stamp.sha256.slice(0, 12)}…, but ${ndjsonDir} now hashes to ` +
        `${actual.slice(0, 12)}…: the NDJSON changed after it was stamped`,
    };
  }
  return { path, stamp, actual, problem: null };
}

/**
 * `found.problem` with what to do about it: re-stamp, unless the NDJSON itself could not be read,
 * which a stamp cannot fix.
 */
export function stampProblemMessage(found: StampInspection): string {
  return found.actual === null
    ? `${found.problem}`
    : `${found.problem}. Run ${STAMP_COMMAND} to stamp the NDJSON as it stands`;
}

/**
 * The stamped corpus date, refusing a stamp that is missing, malformed or no longer matches the
 * NDJSON, so a parse can never write a date that belongs to another corpus.
 */
export function readStampedDate(ndjsonDir: string): string {
  const found = inspectStamp(ndjsonDir);
  if (found.problem !== null || found.stamp === null) {
    throw new Error(`corpus stamp: ${stampProblemMessage(found)}.`);
  }
  return found.stamp.date;
}

/** What `stampCorpus` did: whether it wrote, the stamp now on disk, and why it wrote. */
export interface StampResult {
  path: string;
  changed: boolean;
  stamp: CorpusStamp;
  /** The problem the old stamp had, or that it was re-dated on request, when `changed`. */
  reason: string | null;
}

/**
 * Stamp the NDJSON in `ndjsonDir` as it stands. A stamp whose hash already matches is left alone,
 * date and all, so re-running this, re-emitting, or rebasing never moves the date. Otherwise the
 * stamp is rewritten with the hash and `now`'s UTC day. A stamp that cannot be parsed (conflict
 * markers after a merge, say) is rewritten the same way: that is the re-stamp a conflicting merge
 * forces.
 *
 * `redate` writes `now`'s day over a stamp that already matches. It exists for a revert, which
 * restores an earlier stamp with the earlier NDJSON and so would otherwise date today's change by
 * the day the reverted-to state was first stamped.
 */
export function stampCorpus(ndjsonDir: string, now: Date = new Date(), { redate = false } = {}): StampResult {
  const found = inspectStamp(ndjsonDir);
  if (found.actual === null) throw new RefusalError(`corpus stamp: ${found.problem}; nothing stamped.`);
  const today = now.toISOString().slice(0, 10);
  // A re-date onto the date the stamp already carries changes nothing, and says so.
  if (found.problem === null && found.stamp !== null && (!redate || found.stamp.date === today)) {
    return { path: found.path, changed: false, stamp: found.stamp, reason: null };
  }
  const stamp: CorpusStamp = { date: today, sha256: found.actual };
  try {
    writeFileSync(found.path, `${JSON.stringify(stamp, null, 2)}\n`, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new RefusalError(`corpus stamp: ${found.path} could not be written (${reason}); nothing stamped.`);
  }
  return { path: found.path, changed: true, stamp, reason: found.problem ?? 're-dated on request' };
}

/**
 * `stampCorpus` for a command that has already written files: if the stamp cannot be written, the
 * refusal opens with `written` (what the command wrote, as a clause, "db:export wrote the NDJSON")
 * and names `db:stamp`, so nobody reads "nothing stamped" as "nothing changed". Every db command
 * that writes the NDJSON, and `db:emit`, stamps through this.
 */
export function stampAfterWriting(ndjsonDir: string, written: string): StampResult {
  try {
    return stampCorpus(ndjsonDir);
  } catch (err) {
    if (!(err instanceof RefusalError)) throw err;
    throw new RefusalError(`${written}, but the corpus stamp was not: ${err.message} Fix that, then run ${STAMP_COMMAND}.`);
  }
}

/** One line for a CLI to print after `stampCorpus`. */
export function describeStamp(result: StampResult): string {
  return result.changed
    ? `stamped the NDJSON: ${result.path} now dates it ${result.stamp.date} (${result.reason})`
    : `the corpus stamp already matches the NDJSON (dated ${result.stamp.date}); left unchanged`;
}
