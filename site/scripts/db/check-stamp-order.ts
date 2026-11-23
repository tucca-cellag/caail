/**
 * check-stamp-order.ts (db:check-stamp-order): the CI guard that keeps the corpus date from going
 * backwards on main (tucca-cellag/caail-planning#655; corpus-stamp.ts says what the stamp is).
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:check-stamp-order <base>
 *
 * It compares the `site/db/corpus-stamp.json` at HEAD with the one at `<base>`, the tree the change
 * lands on (the merge commit's first parent on a pull request, the previous tip on a push, as
 * `lint-papers.yml` passes it). A HEAD stamp identical to `<base>`'s passes whatever it says, since
 * the change did not bring it in. Otherwise it is refused when it is:
 *
 *   - for the same NDJSON as `<base>`'s (the same hash) under another date, which is what a branch
 *     that edits the corpus and then puts it back gets from the re-stamp after the restore: the same
 *     corpus keeps its stamp, so the remedy is to restore `<base>`'s (the repair of a future-dated
 *     base, in the last rule, is the one exception);
 *   - dated more than a day after the day the check runs, which only a clock running ahead or a
 *     hand-typed date gives (the day of slack lets through a stamp made a few minutes before UTC
 *     midnight on a clock a little fast, which no re-date on that machine could fix);
 *   - dated earlier than `<base>`'s, unless `<base>`'s was itself dated after the day its commit
 *     was made and HEAD's is no earlier than that day, since that is the repair of a future date.
 *     The second half matters because a committer date can be set by hand
 *     (`rebase --committer-date-is-author-date`, `GIT_COMMITTER_DATE`): a base day set back opens
 *     the exemption for a correct stamp, and then lets through nothing older than that day. No
 *     commit date is beyond an author's reach, so that residual stays: an amend on a later day
 *     followed by a rebase that resets the committer date to the author date can still let a stamp
 *     through that is as many days older as the amend was late, usually one.
 *
 * Two corpus changes conflict on the stamp, and a resolution that keeps the older side's date, which
 * can happen when one side's NDJSON contains the other's, is refused here as going back; resolving
 * with `db:stamp --redate` dates the merge that day. A revert of a corpus commit, or a cherry-pick
 * of one, restores an earlier stamp with its NDJSON, so the hash matches and `db:check` passes;
 * when that stamp is dated earlier than `<base>`'s, this refuses it until `db:stamp --redate`
 * dates it today.
 *
 * What it deliberately lets through: a revert to a state stamped the same day as the commit it
 * reverts carries that day, since its date is not earlier than `<base>`'s. That date describes
 * exactly the version then served, which the published note allows ("can differ from the day that
 * version went live"), and the db-authoring skill says to re-date every revert regardless (or,
 * where it leaves the NDJSON identical to the base's, to restore the base's stamp).
 * Catching it would need the stamp history and a day for the change itself, and every source for
 * that day gives a pull request and the push after it different verdicts under some way of
 * merging: the clock moves between the two runs, a rebase merge rewrites the committer date, and a
 * cherry-pick or squash carries an author date that is not the day the change landed.
 *
 * Only the future-date rule reads the clock, since catching a wrong clock needs an independent
 * one, and its verdict only moves towards passing as the days go by. The repair exemption reads
 * the base commit's own committer day, so a pull request and its push agree on it. A base with no
 * stamp passes, since it predates the stamp, and so does a base whose stamp does not parse, with a
 * notice, since refusing it would refuse the repair too. Every stamp is read from its commit,
 * never the working tree, which other CI steps regenerate.
 *
 * One gap it shares with the new-item guard beside it: on a pull request `<base>` is the first
 * parent of GitHub's merge commit, which can lag main when GitHub has not rebuilt it. A backwards
 * date then passes the pull request and is refused only by the push run after the merge, and the
 * push after that compares with the new tip, so the date stays back unless someone acts on that one
 * red run. Checking that the merge commit is built on main's tip before merging closes it.
 */

import { execFileSync } from 'node:child_process';
import { relative, sep } from 'node:path';

import { exitOnRefusal, NDJSON_DIR, REPO_ROOT, RefusalError, runsAsMain } from './lib.js';
import { type CorpusStamp, parseStamp, STAMP_COMMAND, stampPathFor } from './corpus-stamp.js';

/** The stamp's path relative to the repository root, as git names it. */
const STAMP_PATH = relative(REPO_ROOT, stampPathFor(NDJSON_DIR)).split(sep).join('/');

/** Today's UTC day, `YYYY-MM-DD`, the form a stamp's date takes. */
const utcToday = () => new Date().toISOString().slice(0, 10);

/**
 * The latest date a stamp may carry on the UTC day `today`: the day after, the one day of slack
 * this file's header explains. Exported so a test asserting the committed stamp is not in the
 * future reads the same rule rather than a stricter one of its own.
 */
export const latestStampDate = (today: string) =>
  new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const sameStamp = (a: CorpusStamp, b: CorpusStamp) => a.date === b.date && a.sha256 === b.sha256;

const REDATE = `re-date it with ${STAMP_COMMAND} --redate, run pnpm --dir site parse, and commit both`;

/** The days `stampOrderProblem` reads, beside the two stamps. */
export interface OrderDays {
  /** The UTC day the check runs. */
  today: string;
  /** The UTC committer day of the `<base>` commit, which can be set by hand (see the header). */
  baseDay: string;
}

/**
 * Why `head`'s stamp is out of order against `base`'s, or null when it is not. The rules, and
 * what they leave out, are in this file's header.
 */
export function stampOrderProblem(base: CorpusStamp | null, head: CorpusStamp, days: OrderDays): string | null {
  if (base !== null && sameStamp(base, head)) return null;
  if (head.date > latestStampDate(days.today)) {
    return (
      `the corpus stamp is dated ${head.date}, more than a day after today (${days.today}, UTC), which a clock ` +
      `running ahead or a hand-typed date gives: check the stamping machine's clock, then ${REDATE}`
    );
  }
  const repairsFutureBase = base !== null && base.date > days.baseDay && head.date >= days.baseDay;
  if (base !== null && head.sha256 === base.sha256 && !repairsFutureBase) {
    return (
      `the NDJSON is unchanged from the tree this lands on, whose stamp is dated ${base.date}, but this stamp is ` +
      `dated ${head.date}. A corpus edited and then put back is the same corpus, so it keeps that stamp: restore it ` +
      `(for a pull request, git checkout origin/main -- ${STAMP_PATH}), run pnpm --dir site parse, and commit both`
    );
  }
  if (base !== null && head.date < base.date && !repairsFutureBase) {
    return (
      `the corpus date goes back from ${base.date} to ${head.date}. A revert or cherry-pick of a corpus commit ` +
      'restores an earlier stamp with its NDJSON, and a stamp conflict resolved to the older side keeps that ' +
      `side's date, so the hash can still match: ${REDATE}`
    );
  }
  return null;
}

/**
 * The environment git runs in: UTC, so a day reads the same on every machine, and without the
 * variables git sets inside its own hooks (GIT_INDEX_FILE for pre-commit, among them), which would
 * point `git -C <repo>` at whichever repository the hook belongs to rather than `repo`.
 */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, TZ: 'UTC' };
  for (const v of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete env[v];
  return env;
}

const git = (repo: string, args: string[]) =>
  execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv() });

/**
 * Refuses a ref that is not a commit in the clone, naming it, rather than letting git throw. A
 * missing ref makes `rev-parse --quiet` fail with nothing on stderr; anything git does say (no git,
 * not a repository, a `safe.directory` refusal) is quoted, so it is not mistaken for a bad ref.
 * Exported, with the command named in `label`, for the agent API's schema-stamp order guard
 * (`check-schema-stamp-order.ts`), which reads its stamp from commits the same way.
 */
export function assertCommit(repo: string, ref: string, label = 'db:check-stamp-order'): void {
  try {
    git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch (err) {
    const said = String((err as { stderr?: unknown }).stderr ?? (err as Error).message ?? '').trim();
    throw new RefusalError(
      `${label}: ${ref} is not a commit in this clone, so there is nothing to compare` +
        (said ? ` (git said: ${said})` : '') + '.',
    );
  }
}

/**
 * The text of `path` (relative to the repository root, as git names it) at commit `ref`, or null
 * when `ref` has no such file. Read from the commit, never the working tree, which other CI steps
 * regenerate. Exported for the schema-stamp order guard.
 */
export function committedFile(repo: string, ref: string, path: string): string | null {
  if (!git(repo, ['ls-tree', '--name-only', ref, '--', path]).trim()) return null;
  return git(repo, ['show', `${ref}:${path}`]);
}

/** The stamp at `ref`, or why it is unreadable; `{ stamp: null }` when `ref` has none. */
function stampAt(repo: string, ref: string): { stamp: CorpusStamp | null } | { problem: string } {
  const text = committedFile(repo, ref, STAMP_PATH);
  return text === null ? { stamp: null } : parseStamp(text);
}

/**
 * The problem with `head`'s stamp against `base`'s in the repository at `repo`, or null. A notice
 * for the log, such as a base stamp that does not parse, is pushed onto `notes`.
 */
export function checkStampOrder(
  repo: string,
  base: string,
  head = 'HEAD',
  today: string = utcToday(),
  notes: string[] = [],
): string | null {
  assertCommit(repo, base);
  assertCommit(repo, head);
  const headFound = stampAt(repo, head);
  if ('problem' in headFound) {
    throw new RefusalError(`db:check-stamp-order: ${STAMP_PATH} at ${head} ${headFound.problem}.`);
  }
  if (headFound.stamp === null) {
    throw new RefusalError(`db:check-stamp-order: ${STAMP_PATH} is not at ${head}; run ${STAMP_COMMAND} and commit it.`);
  }
  const baseFound = stampAt(repo, base);
  let baseStamp: CorpusStamp | null = null;
  if ('problem' in baseFound) {
    notes.push(`${STAMP_PATH} at ${base} ${baseFound.problem}, so it is compared as if absent; this change can repair it.`);
  } else {
    baseStamp = baseFound.stamp;
  }
  const baseDay = git(repo, ['log', '-1', '--date=format-local:%Y-%m-%d', '--format=%cd', base]).trim();
  return stampOrderProblem(baseStamp, headFound.stamp, { today, baseDay });
}

function main(): void {
  try {
    const base = process.argv[2];
    if (!base) throw new RefusalError('usage: db:check-stamp-order <base commit>');
    const notes: string[] = [];
    const problem = checkStampOrder(REPO_ROOT, base, 'HEAD', utcToday(), notes);
    for (const note of notes) console.log(`::notice::db:check-stamp-order: ${note}`);
    if (problem) throw new RefusalError(`db:check-stamp-order: ${problem}.`);
    console.log(`db:check-stamp-order: the corpus stamp is in order against ${base}.`);
  } catch (err) {
    exitOnRefusal(err);
  }
}

if (runsAsMain(import.meta.url)) main();
