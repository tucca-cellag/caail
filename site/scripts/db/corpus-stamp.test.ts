/**
 * corpus-stamp.test.ts: the corpus stamp dates the NDJSON it hashes, refuses to date any other,
 * survives the git operations that moved the old commit-derived date, and is refused in CI when a
 * change dates the corpus earlier than the tree it lands on (tucca-cellag/caail-planning#655).
 *
 * The git cases run against small synthetic repositories, never a clone of CAAIL, with git's
 * global and system config switched off and git's repository variables removed, so a signing or
 * hook setting on the machine, or a run from inside a git hook, cannot change what they show.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  hashNdjson,
  inspectStamp,
  ndjsonDirOf,
  readStampedDate,
  STAMP_COMMAND,
  STAMPED_FILES,
  stampAfterWriting,
  stampCorpus,
  stampPathFor,
} from './corpus-stamp.js';
import { checkStampOrder, latestStampDate, stampOrderProblem } from './check-stamp-order.js';
import { NDJSON_DIR, RefusalError, REPO_ROOT, TABLES_PK } from './lib.js';
import { parseStampArgs } from './stamp.js';

const scratch: string[] = [];
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

/** Two of the tables the stamp hashes, standing in for the whole NDJSON in the fixtures. */
const A = 'items.ndjson';
const B = 'papers.ndjson';

/** A fresh repo-shaped directory with `site/db/ndjson/` holding `files`. Returns the repo root. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'caail-stamp-'));
  scratch.push(root);
  mkdirSync(ndjsonDirOf(root), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(ndjsonDirOf(root), name), text);
  return root;
}

const day = (date: string) => new Date(`${date}T12:00:00Z`);
const hashOf = (files: Record<string, string>) => hashNdjson(ndjsonDirOf(repo(files)));

describe('hashNdjson', () => {
  const base = { [A]: '{"id":1}\n', [B]: '{"id":2}\n' };

  it('hashes one file per table importNdjson reads', () => {
    expect([...STAMPED_FILES]).toEqual(Object.keys(TABLES_PK).map((t) => `${t}.ndjson`).sort());
  });

  it('is the same for the same tables, and moves with any content change, a table filled, or content moved', () => {
    const h = hashOf(base);
    expect(hashOf(base)).toBe(h);
    expect(hashOf({ ...base, [B]: '{"id":3}\n' })).not.toBe(h);
    expect(hashOf({ ...base, 'aliases.ndjson': '{"alias":"x"}\n' })).not.toBe(h);
    expect(hashOf({ [A]: base[B], [B]: base[A] })).not.toBe(h);
    // A trailing byte the importer would trim still counts: the stamp is about the files.
    expect(hashOf({ ...base, [A]: '{"id":1}\n\n' })).not.toBe(h);
  });

  it('ignores every file that is not a table, so a stray one cannot split a local hash from CI', () => {
    const h = hashOf(base);
    for (const stray of ['items_BACKUP_123.ndjson', 'scratch.ndjson', 'notes.txt', 'stray.json']) {
      expect(hashOf({ ...base, [stray]: '{"id":9}\n' }), stray).toBe(h);
    }
  });

  it('leaves a table with no file, or an empty one, out of the hash, so adding a table moves nothing', () => {
    const dir = ndjsonDirOf(repo(base));
    expect(hashNdjson(dir, [...STAMPED_FILES, 'a_new_table.ndjson'])).toBe(hashNdjson(dir));
    writeFileSync(join(dir, 'a_new_table.ndjson'), '');
    expect(hashNdjson(dir, [...STAMPED_FILES, 'a_new_table.ndjson'])).toBe(hashNdjson(dir));
    // Emptying a table that had rows still moves it.
    expect(hashOf({ ...base, [B]: '' })).not.toBe(hashOf(base));
  });

  it('reads a missing table as empty, as the importer does, and folds CRLF', () => {
    expect(hashOf({ ...base, 'aliases.ndjson': '' })).toBe(hashOf(base));
    expect(hashOf({ [A]: '{"id":1}\r\n', [B]: '{"id":2}\r\n' })).toBe(hashOf(base));
    // A lone CR is a byte like any other.
    expect(hashOf({ ...base, [A]: '{"id":1}\r' })).not.toBe(hashOf({ ...base, [A]: '{"id":1}' }));
  });

  it('hashes raw bytes, so two different invalid UTF-8 bytes do not hash alike', () => {
    const withByte = (b: number) => {
      const root = repo({ [B]: base[B] });
      writeFileSync(join(ndjsonDirOf(root), A), Buffer.from([0x7b, 0x22, b, 0x22, 0x7d, 0x0a]));
      return hashNdjson(ndjsonDirOf(root));
    };
    // Decoded as UTF-8, 0xFF and 0xFE both become U+FFFD.
    expect(withByte(0xff)).not.toBe(withByte(0xfe));
  });
});

describe('the stamp', () => {
  it('lives beside the NDJSON directory it dates', () => {
    expect(stampPathFor(NDJSON_DIR)).toBe(join(REPO_ROOT, 'site', 'db', 'corpus-stamp.json'));
  });

  it('is written when missing, dated the stamping UTC day, and then reads back', () => {
    const dir = ndjsonDirOf(repo({ [A]: '{"id":1}\n' }));
    // 23:30 at UTC-5 is already the next day in UTC.
    const written = stampCorpus(dir, new Date('2026-11-13T23:30:00-05:00'));
    expect(written).toMatchObject({ changed: true, stamp: { date: '2026-11-14', sha256: hashNdjson(dir) } });
    expect(written.reason).toMatch(/does not exist/);
    expect(readFileSync(stampPathFor(dir), 'utf-8')).toBe(
      `{\n  "date": "2026-11-14",\n  "sha256": "${hashNdjson(dir)}"\n}\n`,
    );
    expect(readStampedDate(dir)).toBe('2026-11-14');
  });

  it('is left alone, date and all, while the NDJSON still matches it, unless asked to re-date', () => {
    const dir = ndjsonDirOf(repo({ [A]: '{"id":1}\n' }));
    stampCorpus(dir, day('2026-11-14'));
    expect(stampCorpus(dir, day('2026-12-01'))).toMatchObject({ changed: false, stamp: { date: '2026-11-14' }, reason: null });
    expect(readStampedDate(dir)).toBe('2026-11-14');
    expect(stampCorpus(dir, day('2026-12-01'), { redate: true })).toMatchObject({
      changed: true, stamp: { date: '2026-12-01' }, reason: 're-dated on request',
    });
    expect(readStampedDate(dir)).toBe('2026-12-01');
    // A re-date onto the date it already carries changes nothing, and does not claim to.
    expect(stampCorpus(dir, day('2026-12-01'), { redate: true })).toMatchObject({ changed: false, reason: null });
  });

  it('is refused once the NDJSON changes, naming the command, and a re-stamp dates the change', () => {
    const dir = ndjsonDirOf(repo({ [A]: '{"id":1}\n' }));
    stampCorpus(dir, day('2026-11-14'));
    writeFileSync(join(dir, A), '{"id":1,"edited":true}\n');

    expect(inspectStamp(dir).problem).toMatch(/the NDJSON changed after it was stamped/);
    expect(() => readStampedDate(dir)).toThrow(new RegExp(`changed after it was stamped.*${STAMP_COMMAND}`));

    expect(stampCorpus(dir, day('2026-11-19'))).toMatchObject({ changed: true, stamp: { date: '2026-11-19' } });
    expect(readStampedDate(dir)).toBe('2026-11-19');
  });

  it.each([
    ['missing', null, /does not exist/],
    ['not JSON (conflict markers)', '<<<<<<< ours\n{}\n=======\n{}\n>>>>>>> theirs\n', /not valid JSON/],
    ['an array', '[]', /not a JSON object/],
    ['an extra key', '{"date":"2026-11-14","sha256":"%H","by":"x"}', /not exactly date and sha256/],
    ['a date the calendar lacks', '{"date":"2026-02-30","sha256":"%H"}', /not a YYYY-MM-DD calendar day/],
    ['a timestamp for a date', '{"date":"2026-11-14T00:00:00Z","sha256":"%H"}', /not a YYYY-MM-DD calendar day/],
    ['a short hash', '{"date":"2026-11-14","sha256":"abc"}', /not 64 lowercase hex digits/],
  ])('is refused when %s, and a stamp rewrites it', (_label, text, problem) => {
    const dir = ndjsonDirOf(repo({ [A]: '{"id":1}\n' }));
    if (text !== null) writeFileSync(stampPathFor(dir), text.replace('%H', hashNdjson(dir)));

    expect(inspectStamp(dir).problem).toMatch(problem);
    expect(() => readStampedDate(dir)).toThrow(problem);
    expect(stampCorpus(dir, day('2026-11-19'))).toMatchObject({ changed: true, stamp: { date: '2026-11-19' } });
    expect(inspectStamp(dir).problem).toBeNull();
  });

  it('reports a stamp path it cannot read as a problem, and refuses cleanly to write one', () => {
    const dir = ndjsonDirOf(repo({ [A]: '{"id":1}\n' }));
    mkdirSync(stampPathFor(dir));
    expect(inspectStamp(dir).problem).toMatch(/could not be read \(EISDIR/);
    expect(() => readStampedDate(dir)).toThrow(/could not be read/);
    expect(() => stampCorpus(dir)).toThrow(RefusalError);
    expect(() => stampCorpus(dir)).toThrow(/could not be written \(EISDIR.*nothing stamped/);
  });

  it('reports an unreadable NDJSON directory as a problem, without telling anyone to re-stamp it', () => {
    const missing = join(repo({}), 'site', 'db', 'nowhere');
    const found = inspectStamp(missing);
    expect(found).toMatchObject({ actual: null, stamp: null });
    expect(found.problem).toMatch(/could not be read \(ENOENT/);
    expect(() => readStampedDate(missing)).toThrow(/could not be read/);
    expect(() => readStampedDate(missing)).not.toThrow(/db:stamp/);
    expect(() => stampCorpus(missing)).toThrow(/nothing stamped/);
    // A refusal, so db:add and db:remove can say what they had already written before it.
    expect(() => stampCorpus(missing)).toThrow(RefusalError);
  });

  it('says what a command already wrote when the stamp after it cannot be written', () => {
    const dir = ndjsonDirOf(repo({ [A]: '{"id":1}\n' }));
    mkdirSync(stampPathFor(dir));
    expect(() => stampAfterWriting(dir, 'db:export wrote the NDJSON')).toThrow(
      /^db:export wrote the NDJSON, but the corpus stamp was not: corpus stamp: .*could not be written.*Fix that, then run pnpm --dir site db:stamp\.$/s,
    );
    expect(() => stampAfterWriting(dir, 'db:export wrote the NDJSON')).toThrow(RefusalError);
  });

  it('--redate is the only flag db:stamp takes', () => {
    expect(parseStampArgs([])).toEqual({ redate: false });
    expect(parseStampArgs(['--redate'])).toEqual({ redate: true });
    expect(() => parseStampArgs(['--force'])).toThrow(/usage: db:stamp \[--redate\]/);
  });

  it('matches the committed NDJSON', () => {
    expect(inspectStamp(NDJSON_DIR).problem).toBeNull();
  });
});

/** A fixed "today" for the order guard, so no test here depends on the day it runs. */
const TODAY = '2026-12-31';

describe('stampOrderProblem', () => {
  const at = (date: string, sha256 = 'a'.repeat(64)) => ({ date, sha256 });
  /** The days the guard reads: today, and the base commit's day (today unless given). */
  const days = (baseDay = TODAY) => ({ today: TODAY, baseDay });

  it('passes a date that holds or moves forward, up to today, and a base with no stamp', () => {
    expect(stampOrderProblem(at('2026-11-12'), at('2026-11-13', 'b'.repeat(64)), days())).toBeNull();
    expect(stampOrderProblem(at('2026-11-12'), at('2026-11-12', 'b'.repeat(64)), days())).toBeNull();
    expect(stampOrderProblem(at('2026-11-12'), at('2026-11-12'), days())).toBeNull();
    expect(stampOrderProblem(at('2026-11-12'), at(TODAY, 'b'.repeat(64)), days())).toBeNull();
    expect(stampOrderProblem(null, at('2026-01-01'), days())).toBeNull();
  });

  it('refuses a date that goes back, naming both dates and the re-date', () => {
    const problem = stampOrderProblem(at('2026-11-15'), at('2026-11-01', 'b'.repeat(64)), days());
    expect(problem).toMatch(/goes back from 2026-11-15 to 2026-11-01/);
    expect(problem).toContain(`${STAMP_COMMAND} --redate`);
    // A date typed back by hand over the same hash is refused too, as the same corpus re-dated.
    expect(stampOrderProblem(at('2026-11-15'), at('2026-11-01'), days())).toMatch(/unchanged from the tree this lands on/);
  });

  it('refuses a date more than a day after today, with or without a base, naming the clock', () => {
    const problem = stampOrderProblem(at('2026-11-15'), at('2027-01-02', 'b'.repeat(64)), days());
    expect(problem).toMatch(/dated 2027-01-02, more than a day after today \(2026-12-31, UTC\)/);
    expect(problem).toContain("check the stamping machine's clock");
    expect(stampOrderProblem(null, at('2027-01-02'), days())).toMatch(/more than a day after today/);
  });

  it('allows one day of slack, for a clock a little fast near UTC midnight', () => {
    expect(stampOrderProblem(at('2026-11-15'), at('2027-01-01', 'b'.repeat(64)), days())).toBeNull();
    expect(stampOrderProblem(null, at('2027-01-01'), days())).toBeNull();
    expect(latestStampDate(TODAY)).toBe('2027-01-01');
    expect(latestStampDate('2028-02-28')).toBe('2028-02-29');
  });

  it('names every way a date goes back in its refusal', () => {
    expect(stampOrderProblem(at('2026-11-15'), at('2026-11-01', 'b'.repeat(64)), days())).toMatch(
      /revert or cherry-pick of a corpus commit.*stamp conflict resolved to the older side/,
    );
  });

  it('lets a stamp go back from a base dated after its own commit, which is the repair of a future date', () => {
    // Without this, one future-dated stamp on main would refuse every correct stamp until its day.
    expect(stampOrderProblem(at('2027-03-01'), at(TODAY, 'b'.repeat(64)), days('2026-12-20'))).toBeNull();
    // A base stamp that was not in the future when its commit was made is not exempt.
    expect(stampOrderProblem(at('2026-12-20'), at('2026-12-10', 'b'.repeat(64)), days('2026-12-20'))).toMatch(/goes back/);
    expect(stampOrderProblem(at('2027-03-01'), at('2027-02-01', 'b'.repeat(64)), days('2026-12-20'))).toMatch(/more than a day after today/);
  });

  it('does not let a base day set back by hand open the exemption for an older stamp', () => {
    // Main's correct 2026-11-15 stamp sits on a commit whose committer date was set to 2026-11-10,
    // so the base reads as future-dated; a revert to a 2026-11-01 stamp is still refused.
    expect(stampOrderProblem(at('2026-11-15'), at('2026-11-01', 'b'.repeat(64)), days('2026-11-10'))).toMatch(/goes back from 2026-11-15 to 2026-11-01/);
    // A repair dated on or after that day passes, as any re-date does.
    expect(stampOrderProblem(at('2026-11-15'), at('2026-11-10', 'b'.repeat(64)), days('2026-11-10'))).toBeNull();
  });

  it('refuses the same NDJSON as the base under another date, naming the restore, except to repair a future base', () => {
    // A branch edited the corpus and put it back; the re-stamp after the restore dated it today.
    const problem = stampOrderProblem(at('2026-11-14'), at('2026-11-20'), days('2026-11-14'));
    expect(problem).toMatch(/unchanged from the tree this lands on, whose stamp is dated 2026-11-14, but this stamp is dated 2026-11-20/);
    expect(problem).toContain('git checkout origin/main -- site/db/corpus-stamp.json');
    // The repair of a future-dated base re-dates the same NDJSON, and is let through.
    expect(stampOrderProblem(at('2027-03-01'), at(TODAY), days('2026-12-20'))).toBeNull();
  });

  it('passes a stamp carried over unchanged from the base, even a future one, since the change did not bring it in', () => {
    expect(stampOrderProblem(at('2027-03-01'), at('2027-03-01'), days())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// git: the operations that moved the old date, and the guard on the one that moves the new one
// ---------------------------------------------------------------------------

/** The environment every git call here runs in: no machine config, and no inherited repository. */
const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
  GIT_EDITOR: 'true',
  TZ: 'UTC',
};
// Set inside a git hook (GIT_INDEX_FILE for pre-commit), these would point `git -C <tmp>` at the
// real repository's index or objects.
for (const v of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_COMMON_DIR']) delete GIT_ENV[v];

/** Run git in `cwd`, committed (author and committer) at `when` if given. */
function git(cwd: string, args: string[], when?: string): string {
  const env = when ? { ...GIT_ENV, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } : GIT_ENV;
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf-8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Run git expecting it to stop on a conflict; returns the unmerged paths. */
function gitConflicts(cwd: string, args: string[], when: string): string[] {
  expect(() => git(cwd, args, when)).toThrow();
  return git(cwd, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
}

/** What the old `readCorpusDate` returned: the UTC committer day of the last NDJSON commit. */
const oldDerivation = (root: string) =>
  git(root, ['log', '-1', '--date=format-local:%Y-%m-%d', '--format=%cd', '--', 'site/db/ndjson']);

const STAMP_REL = 'site/db/corpus-stamp.json';

/** Edit one NDJSON file, stamp at `date`, and commit both at `when`. */
function corpusCommit(root: string, file: string, text: string, date: string, when: string): void {
  writeFileSync(join(ndjsonDirOf(root), file), text);
  stampCorpus(ndjsonDirOf(root), day(date));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', `corpus: ${file}`], when);
}

/** A repo whose main holds two NDJSON tables and a stamp, committed on 2026-11-01. */
function gitRepo(): string {
  const root = repo({ [A]: '{"id":"a","v":0}\n', [B]: '{"id":"b","v":0}\n' });
  git(root, ['init', '-q', '-b', 'main']);
  stampCorpus(ndjsonDirOf(root), day('2026-11-01'));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'base'], '2026-11-01T12:00:00Z');
  return root;
}

describe('the stamp under git', () => {
  it('does not move when a corpus commit is amended or rebased onto a later UTC day', () => {
    // 3d3937f5's shape: written 2026-11-05 21:38 UTC, rewritten 2026-11-06 01:40 UTC.
    const root = gitRepo();
    git(root, ['commit', '-q', '--allow-empty', '-m', 'unrelated'], '2026-11-05T20:00:00Z');
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-05', '2026-11-05T21:38:00Z');
    git(root, ['commit', '-q', '--amend', '--no-edit', '--date', '2026-11-05T21:38:00Z'], '2026-11-06T01:40:00Z');

    expect(oldDerivation(root), 'the fixture does not reproduce the hazard').toBe('2026-11-06');
    expect(readStampedDate(ndjsonDirOf(root))).toBe('2026-11-05');

    git(root, ['rebase', '-q', '--force-rebase', 'HEAD~1'], '2026-11-07T03:00:00Z');
    expect(oldDerivation(root)).toBe('2026-11-07');
    expect(readStampedDate(ndjsonDirOf(root))).toBe('2026-11-05');
  });

  it('a branch whose base has no newer corpus change merges cleanly, its stamp still matching', () => {
    const root = gitRepo();
    git(root, ['switch', '-q', '-c', 'feature']);
    corpusCommit(root, B, '{"id":"b","v":1}\n', '2026-11-08', '2026-11-08T12:00:00Z');
    git(root, ['switch', '-q', 'main']);
    git(root, ['commit', '-q', '--allow-empty', '-m', 'no corpus change'], '2026-11-12T12:00:00Z');

    git(root, ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'], '2026-11-13T12:00:00Z');

    expect(inspectStamp(ndjsonDirOf(root)).problem).toBeNull();
    expect(readStampedDate(ndjsonDirOf(root))).toBe('2026-11-08');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();
  });

  /**
   * The 2026-11-14 probe's shape: main gained a corpus change stamped 2026-11-12 after a branch
   * stamped its own on 2026-11-08, in a different NDJSON file, so the NDJSON merges cleanly.
   */
  function concurrent(): string {
    const root = gitRepo();
    git(root, ['switch', '-q', '-c', 'feature']);
    corpusCommit(root, B, '{"id":"b","v":1}\n', '2026-11-08', '2026-11-08T12:00:00Z');
    git(root, ['switch', '-q', 'main']);
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-12', '2026-11-12T12:00:00Z');
    git(root, ['switch', '-q', 'feature']);
    return root;
  }

  it.each(['ours', 'theirs'])(
    'merging main into a branch with a concurrent corpus change conflicts on the stamp while the NDJSON merges, and either side (%s) fails until a re-stamp',
    (side) => {
      const root = concurrent();
      const dir = ndjsonDirOf(root);

      expect(gitConflicts(root, ['merge', '-q', 'main'], '2026-11-13T12:00:00Z')).toEqual([STAMP_REL]);
      git(root, ['checkout', `--${side}`, '--', STAMP_REL]);
      expect(inspectStamp(dir).problem, 'a side of the conflict passed for the merged NDJSON').toMatch(/changed after it was stamped/);

      expect(stampCorpus(dir, day('2026-11-13'))).toMatchObject({ changed: true, stamp: { date: '2026-11-13' } });
      git(root, ['add', '-A']);
      git(root, ['commit', '-q', '--no-edit'], '2026-11-13T12:00:00Z');

      // Landing it the way ship-pr.sh does, with a merge commit, moves main forward, not back.
      git(root, ['switch', '-q', 'main']);
      git(root, ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'], '2026-11-13T13:00:00Z');
      expect(inspectStamp(dir).problem).toBeNull();
      expect(readStampedDate(dir)).toBe('2026-11-13');
      expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY), 'the corpus date went backwards on main').toBeNull();
    },
  );

  it('rebasing that branch onto main stops on the stamp the same way, and the re-stamp is forced', () => {
    const root = concurrent();
    const dir = ndjsonDirOf(root);

    expect(gitConflicts(root, ['rebase', '-q', 'main'], '2026-11-13T12:00:00Z')).toEqual([STAMP_REL]);
    git(root, ['checkout', '--theirs', '--', STAMP_REL]);
    expect(inspectStamp(dir).problem).toMatch(/changed after it was stamped/);

    stampCorpus(dir, day('2026-11-13'));
    git(root, ['add', '-A']);
    git(root, ['rebase', '--continue'], '2026-11-13T12:00:00Z');

    expect(readStampedDate(dir)).toBe('2026-11-13');
    git(root, ['switch', '-q', 'main']);
    git(root, ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'], '2026-11-13T13:00:00Z');
    expect(readStampedDate(dir)).toBe('2026-11-13');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();
  });

  it('a revert restores the earlier stamp, which db:check cannot see and the order guard refuses until --redate', () => {
    const root = gitRepo();
    const dir = ndjsonDirOf(root);
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-15', '2026-11-15T12:00:00Z');
    git(root, ['revert', '--no-edit', 'HEAD'], '2026-11-20T12:00:00Z');

    expect(inspectStamp(dir).problem).toBeNull();
    expect(readStampedDate(dir)).toBe('2026-11-01');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toMatch(/goes back from 2026-11-15 to 2026-11-01/);

    expect(stampCorpus(dir, day('2026-11-20'), { redate: true })).toMatchObject({ changed: true, stamp: { date: '2026-11-20' } });
    git(root, ['commit', '-q', '--amend', '-a', '--no-edit'], '2026-11-20T12:00:00Z');
    expect(readStampedDate(dir)).toBe('2026-11-20');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();
  });

  it('lets through a revert to a state stamped the same day as the commit it reverts, carrying that day', () => {
    // Both states dated 2026-11-01, so the date does not go back. The date then describes the
    // version served, which the published note allows; check-stamp-order.ts says why this is not
    // caught, and --redate still dates it the day of the revert.
    const root = gitRepo();
    const dir = ndjsonDirOf(root);
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-01', '2026-11-01T18:00:00Z');
    git(root, ['revert', '--no-edit', 'HEAD'], '2026-11-20T12:00:00Z');

    expect(inspectStamp(dir).problem).toBeNull();
    expect(readStampedDate(dir)).toBe('2026-11-01');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();

    stampCorpus(dir, day('2026-11-20'), { redate: true });
    git(root, ['commit', '-q', '--amend', '-a', '--no-edit'], '2026-11-20T12:00:00Z');
    expect(readStampedDate(dir)).toBe('2026-11-20');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();
  });

  it('refuses a cherry-pick that brings back a reverted corpus commit with its earlier stamp', () => {
    // S0 2026-11-01; C stamps 2026-11-05; C is reverted and re-dated 2026-11-10; on 2026-11-20 C is
    // cherry-picked back, the stamp conflict resolved with C's side. db:check passes; the date
    // would go back five days.
    const root = gitRepo();
    const dir = ndjsonDirOf(root);
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-05', '2026-11-05T12:00:00Z');
    const c = git(root, ['rev-parse', 'HEAD']);
    git(root, ['revert', '--no-edit', 'HEAD'], '2026-11-10T12:00:00Z');
    stampCorpus(dir, day('2026-11-10'), { redate: true });
    git(root, ['commit', '-q', '--amend', '-a', '--no-edit'], '2026-11-10T12:00:00Z');

    expect(gitConflicts(root, ['cherry-pick', c], '2026-11-20T12:00:00Z')).toEqual([STAMP_REL]);
    git(root, ['checkout', '--theirs', '--', STAMP_REL]);
    git(root, ['add', '-A']);
    git(root, ['-c', 'core.editor=true', 'cherry-pick', '--continue'], '2026-11-20T12:00:00Z');

    expect(inspectStamp(dir).problem).toBeNull();
    expect(readStampedDate(dir)).toBe('2026-11-05');
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toMatch(/goes back from 2026-11-10 to 2026-11-05/);
  });

  it('an undo committed on its stamping day gets one verdict on the pull request and on main days later', () => {
    // Day D: main carries S0; a corpus change stamped D lands; it is undone the same day.
    const root = gitRepo();
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-01', '2026-11-01T15:00:00Z');
    git(root, ['revert', '--no-edit', 'HEAD'], '2026-11-01T18:00:00Z');

    expect(readStampedDate(ndjsonDirOf(root))).toBe('2026-11-01');
    for (const today of ['2026-11-01', '2026-11-02', TODAY]) {
      expect(checkStampOrder(root, 'HEAD^1', 'HEAD', today), today).toBeNull();
    }
  });

  it('a base stamp that does not parse is compared as absent, with a notice, so its repair can pass', () => {
    const root = gitRepo();
    writeFileSync(stampPathFor(ndjsonDirOf(root)), '<<<<<<< HEAD\n');
    git(root, ['commit', '-q', '-a', '-m', 'a broken stamp reaches main'], '2026-11-05T12:00:00Z');
    stampCorpus(ndjsonDirOf(root), day('2026-11-06'));
    git(root, ['commit', '-q', '-a', '-m', 'repair it'], '2026-11-06T12:00:00Z');

    const notes: string[] = [];
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY, notes)).toBeNull();
    expect(notes.join('\n')).toMatch(/is not valid JSON, so it is compared as if absent/);
  });

  it('refuses a corpus edited and put back until the base stamp is restored', () => {
    const root = gitRepo();
    const dir = ndjsonDirOf(root);
    git(root, ['switch', '-q', '-c', 'feature']);
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-18', '2026-11-18T12:00:00Z');
    corpusCommit(root, A, '{"id":"a","v":0}\n', '2026-11-20', '2026-11-20T12:00:00Z');
    git(root, ['switch', '-q', 'main']);
    git(root, ['merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'], '2026-11-20T13:00:00Z');

    expect(inspectStamp(dir).problem, 'db:check cannot see it: the hash matches').toBeNull();
    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toMatch(/unchanged from the tree this lands on, whose stamp is dated 2026-11-01/);

    git(root, ['checkout', 'HEAD^1', '--', STAMP_REL]);
    git(root, ['commit', '-q', '-m', 'restore the base stamp'], '2026-11-20T14:00:00Z');
    expect(checkStampOrder(root, 'HEAD~2', 'HEAD', TODAY)).toBeNull();
  });

  it('ignores the repository variables git sets inside its own hooks', () => {
    // From a hook, GIT_DIR / GIT_INDEX_FILE would point `git -C <fixture>` at another repository.
    const root = gitRepo();
    corpusCommit(root, A, '{"id":"a","v":1}\n', '2026-11-05', '2026-11-05T12:00:00Z');
    const saved = { GIT_DIR: process.env.GIT_DIR, GIT_INDEX_FILE: process.env.GIT_INDEX_FILE };
    process.env.GIT_DIR = join(tmpdir(), 'caail-no-such-repo');
    process.env.GIT_INDEX_FILE = join(tmpdir(), 'caail-no-such-index');
    try {
      expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('the order guard passes a base that predates the stamp and refuses a ref that is no commit', () => {
    const root = repo({ [A]: '{"id":"a","v":0}\n' });
    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'before the stamp'], '2026-11-01T12:00:00Z');
    stampCorpus(ndjsonDirOf(root), day('2026-11-02'));
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'first stamp'], '2026-11-02T12:00:00Z');

    expect(checkStampOrder(root, 'HEAD^1', 'HEAD', TODAY)).toBeNull();
    expect(() => checkStampOrder(root, 'no-such-ref')).toThrow(/is not a commit in this clone, so there is nothing to compare\.$/);
    // Anything git itself says is quoted, so a broken repository is not read as a bad ref.
    expect(() => checkStampOrder(repo({}), 'HEAD')).toThrow(/is not a commit in this clone.*\(git said: .*not a git repository/is);
  });
});
