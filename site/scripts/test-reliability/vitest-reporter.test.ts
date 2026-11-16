/**
 * vitest-reporter.test.ts: the reporter labels a suite whose own hook timed out, and does
 * not label a hook that threw or a real test failure, as the installed vitest reports them.
 *
 * Which failures a suite name may match is decided by how vitest reports a failed hook:
 * the suite fails with the hook's error, a timeout written as "Hook timed out in", and its
 * tests are skipped, while a suite holding a failing test fails with no error of its own.
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
 * Kill the fixture vitest and the workers it started. It is spawned as the leader of its own
 * process group (`detached`) so the group can be killed whole; where there are no groups, the
 * process alone.
 */
function killFixture(): void {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform !== 'win32' && child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    // Already gone between the check and the kill.
  }
}

/** Run the fixture in a vitest of its own, and collect its exit code and stderr. */
function runFixture(cacheDir: string): Promise<{ code: number | null; stderr: string }> {
  // The parent run's VITEST_* variables describe its own worker; a second vitest must not
  // inherit them.
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST'))),
    CAAIL_REPORTER_FIXTURE_CACHE: cacheDir,
  };
  return new Promise((resolve, reject) => {
    child = spawn(
      process.execPath,
      [VITEST_CLI, 'run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts')],
      { env, stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' },
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
  // Its cache goes here rather than beside the fixture, where vitest would create a
  // node_modules of its own inside the source tree.
  const cacheDir = mkdtempSync(join(tmpdir(), 'caail-reporter-fixture-'));
  beforeAll(async () => {
    run = await runFixture(cacheDir);
  }, FIXTURE_BUDGET_MS + 10_000);
  // Whether the run finished, was killed above, or was abandoned by vitest's own timeout.
  afterAll(() => {
    killFixture();
    rmSync(cacheDir, { recursive: true, force: true });
  });

  /** The fixture entries whose unit the report printed, in register order. */
  const printed = () =>
    FIXTURE_ENTRIES.filter(({ entry }) => run.stderr.split('\n').some((line) => line.endsWith(` ${entry.unit}`))).map(
      ({ entry }) => entry.id,
    );

  it('fails the fixture run, as every suite in it is meant to', () => {
    expect(run.code, run.stderr).toBe(1);
  });

  it('labels a suite whose own hook timed out, nested or not, and a failed test', () => {
    const expected = FIXTURE_ENTRIES.filter(({ expected }) => expected).map(({ entry }) => entry.id);
    expect(printed().filter((id) => expected.includes(id)), run.stderr).toEqual(expected);
  });

  it('does not label a hook that threw, nor a suite that failed only because a test or a suite inside it did', () => {
    const unexpected = FIXTURE_ENTRIES.filter(({ expected }) => !expected).map(({ entry }) => entry.id);
    expect(printed().filter((id) => unexpected.includes(id)), run.stderr).toEqual([]);
  });
});
