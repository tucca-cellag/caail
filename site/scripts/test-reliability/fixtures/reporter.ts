/**
 * The real reporter, matching a register of entries for `suite-failures.fixture.ts`.
 *
 * Each entry's `unit` is its id, so `vitest-reporter.test.ts` can tell from the
 * printed report which entries matched. `expected` says whether the entry should.
 */
import KnownUnreliableReporter from '../vitest-reporter.js';
import type { UnreliableEntry } from '../register.js';

const entry = (
  id: string,
  names: Pick<UnreliableEntry, 'tests' | 'suites'>,
): UnreliableEntry => ({
  id,
  suite: 'vitest',
  file: 'suite-failures.fixture.ts',
  unit: id,
  anchor: '',
  ...names,
  shape: 'load',
  condition: '',
  evidence: '',
  reproduce: '',
  status: 'open',
  tickets: [],
});

export const FIXTURE_ENTRIES: readonly { entry: UnreliableEntry; expected: boolean }[] = [
  { entry: entry('fixture-suite-own-hook', { suites: ['a suite whose own hook times out'] }), expected: true },
  { entry: entry('fixture-nested-own-hook', { suites: ['a nested suite whose own hook throws'] }), expected: true },
  { entry: entry('fixture-failed-test', { tests: ['fails an assertion'] }), expected: true },
  // Failed, because a test inside it did, with no error of its own: a real failure there
  // must not be labelled known-unreliable by naming the suite.
  { entry: entry('fixture-suite-of-failed-test', { suites: ['a suite whose test fails'] }), expected: false },
  // Failed, because a suite inside it did. Its own hooks ran clean.
  { entry: entry('fixture-parent-of-failed-hook', { suites: ['a parent suite'] }), expected: false },
];

export default class FixtureReporter extends KnownUnreliableReporter {
  protected override readonly register = FIXTURE_ENTRIES.map(({ entry }) => entry);
}
