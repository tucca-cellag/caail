/**
 * vitest-reporter.test.ts: the reporter labels a failure only where an entry's name and its
 * failure shape both cover it, as the installed vitest reports failures.
 *
 * What an entry may match is decided by how vitest reports a failure: a timeout written as
 * "Test timed out in" or "Hook timed out in", a failed hook as the suite's own error (or the
 * module's, at top level) with its tests skipped, and a suite holding a failing test as
 * failed with no error of its own.
 * That is vitest's behaviour, not this repo's, so a test over hand-built stand-ins would
 * keep passing after an upgrade changed it, and the reporter would quietly stop naming the
 * entry, or start naming real failures. So this
 * runs the installed vitest on `fixtures/suite-failures.fixture.ts` with the real reporter
 * and reads what it prints.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FIXTURE_ENTRIES } from './fixtures/reporter.js';

const require = createRequire(import.meta.url);
const VITEST_CLI = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * How long the fixture run may take before it is killed. A second vitest starts a server and a
 * worker of its own, which a loaded machine slows far more than it slows a fixture, so this is
 * a budget for that rather than the suite's hook budget. The hook gets a little more, so the
 * kill below, which names the cause, fires before vitest's own timeout does.
 */
const FIXTURE_BUDGET_MS = 110_000;

/** The running fixture vitest, until it exits. */
let child: ChildProcess | undefined;

/**
 * Kill the fixture vitest if it is still running. It runs its tests in worker threads
 * (`--pool=threads`, below), not in processes of their own, so they end with it, and there
 * is nothing else to reap. A child that has exited is never signalled: its PID may already
 * belong to an unrelated process.
 */
function killFixture(): void {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

/** Run the fixture in a vitest of its own, and collect its exit code and stderr. */
function runFixture(cacheDir: string): Promise<{ code: number | null; stderr: string }> {
  // The parent run's VITEST_* variables describe its own worker; a second vitest must not
  // inherit them. Colour is forced on, as in a terminal, so the diffs the reporter reads carry
  // the control sequences it has to strip.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST'))),
    CAAIL_REPORTER_FIXTURE_CACHE: cacheDir,
    FORCE_COLOR: '1',
  };
  return new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [VITEST_CLI, 'run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts'), '--pool=threads'],
      { env, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    const timer = setTimeout(() => {
      killFixture();
      reject(new Error(`the fixture vitest ran past ${FIXTURE_BUDGET_MS} ms and was killed`));
    }, FIXTURE_BUDGET_MS);
    let stderr = '';
    child.stderr!.setEncoding('utf-8');
    child.stderr!.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

describe('the vitest reporter, run by the installed vitest', () => {
  let run: { code: number | null; stderr: string };
  // The fixture's cache goes here rather than beside the fixture, where vitest would create
  // a node_modules of its own inside the source tree. Made in the hook, so a run that skips
  // these tests (`-t` for another name) makes none.
  let cacheDir: string | undefined;
  beforeAll(async () => {
    cacheDir = mkdtempSync(join(tmpdir(), 'caail-reporter-fixture-'));
    run = await runFixture(cacheDir);
  }, FIXTURE_BUDGET_MS + 10_000);
  // Whether the run finished, was killed above, or was abandoned by vitest's own timeout.
  afterAll(() => {
    killFixture();
    if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  });

  /** The fixture entries whose unit the report printed, in register order. */
  const printed = () =>
    FIXTURE_ENTRIES.filter(({ entry }) => run.stderr.split('\n').some((line) => line.endsWith(` ${entry.unit}`))).map(
      ({ entry }) => entry.id,
    );

  it('fails the fixture run, as every module in it is meant to', () => {
    expect(run.code, run.stderr).toBe(1);
  });

  it('labels each failure an entry names in the shape it states', () => {
    const expected = FIXTURE_ENTRIES.filter(({ expected }) => expected).map(({ entry }) => entry.id);
    expect(printed().filter((id) => expected.includes(id)), run.stderr).toEqual(expected);
  });

  it('does not label a failure of another shape, nor a suite that failed only because something inside it did', () => {
    const unexpected = FIXTURE_ENTRIES.filter(({ expected }) => !expected).map(({ entry }) => entry.id);
    expect(printed().filter((id) => unexpected.includes(id)), run.stderr).toEqual([]);
  });
});
