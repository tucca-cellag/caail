/**
 * vitest-reporter.test.ts: the reporter labels a suite whose own hook failed, and does not
 * label a real test failure, as the installed vitest reports them.
 *
 * Which failures a suite name may match is decided by how vitest reports a failed hook:
 * the suite fails with the hook's error and its tests are skipped, while a suite holding a
 * failing test fails with no error of its own. That is vitest's behaviour, not this repo's,
 * so a test over hand-built stand-ins would keep passing after an upgrade changed it, and
 * the reporter would quietly stop naming the entry, or start naming real failures. So this
 * runs the installed vitest on `fixtures/suite-failures.fixture.ts` with the real reporter
 * and reads what it prints.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { FIXTURE_ENTRIES } from './fixtures/reporter.js';

const require = createRequire(import.meta.url);
const VITEST_CLI = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Run the fixture in a vitest of its own, and collect its exit code and stderr. */
function runFixture(): Promise<{ code: number | null; stderr: string }> {
  // The parent run's VITEST_* variables describe its own worker; a second vitest must not
  // inherit them.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST')));
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [VITEST_CLI, 'run', '--root', FIXTURES, '--config', join(FIXTURES, 'vitest.config.ts')],
      { env, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

describe('the vitest reporter, run by the installed vitest', () => {
  let run: { code: number | null; stderr: string };
  // A second vitest starts a server and a worker of its own, which a loaded machine slows
  // far more than it slows a fixture, so this hook gets a budget for that rather than the
  // suite's.
  beforeAll(async () => {
    run = await runFixture();
  }, 120_000);

  /** The fixture entries whose unit the report printed, in register order. */
  const printed = () =>
    FIXTURE_ENTRIES.filter(({ entry }) => run.stderr.split('\n').some((line) => line.endsWith(` ${entry.unit}`))).map(
      ({ entry }) => entry.id,
    );

  it('fails the fixture run, as every suite in it is meant to', () => {
    expect(run.code, run.stderr).toBe(1);
  });

  it('labels a suite whose own hook failed, nested or not, and a failed test', () => {
    const expected = FIXTURE_ENTRIES.filter(({ expected }) => expected).map(({ entry }) => entry.id);
    expect(printed().filter((id) => expected.includes(id)), run.stderr).toEqual(expected);
  });

  it('does not label a suite that failed only because a test or a suite inside it did', () => {
    const unexpected = FIXTURE_ENTRIES.filter(({ expected }) => !expected).map(({ entry }) => entry.id);
    expect(printed().filter((id) => unexpected.includes(id)), run.stderr).toEqual([]);
  });
});
