/**
 * The real reporter, matching a register of entries for the `.fixture.ts` modules beside it.
 *
 * Each entry's `unit` is its id, so `vitest-reporter.test.ts` can tell from the
 * printed report which entries matched. `expected` says whether the entry should.
 */
import KnownUnreliableReporter from '../vitest-reporter.js';
import type { UnreliableEntry } from '../register.js';

const entry = (
  id: string,
  scope: Pick<UnreliableEntry, 'tests' | 'suites' | 'wholeModule' | 'failure'>,
  file = 'suite-failures.fixture.ts',
): UnreliableEntry => ({
  id,
  suite: 'vitest',
  file,
  unit: id,
  anchor: '',
  ...scope,
  shape: 'load',
  condition: '',
  evidence: '',
  reproduce: '',
  status: 'open',
  tickets: [],
});

export const FIXTURE_ENTRIES: readonly { entry: UnreliableEntry; expected: boolean }[] = [
  { entry: entry('fixture-suite-hook-timeout', { suites: ['a suite whose own hook times out'], failure: 'timeout' }), expected: true },
  {
    entry: entry('fixture-nested-hook-timeout', {
      suites: ['a parent suite > a nested suite whose own hook times out'],
      failure: 'timeout',
    }),
    expected: true,
  },
  { entry: entry('fixture-row-hook-timeout', { suites: ['another parent > a lone name'], failure: 'timeout' }), expected: true },
  { entry: entry('fixture-test-timeout', { tests: ['runs past its budget'], failure: 'timeout' }), expected: true },
  // An assertion, by the text of what it failed with.
  { entry: entry('fixture-assertion-by-text', { tests: ['fails an assertion'], failure: { text: ['a planted offender'] } }), expected: true },
  { entry: entry('fixture-whole-module-timeouts', { wholeModule: true, failure: 'timeout' }, 'module-timeouts.fixture.ts'), expected: true },
  // A real assertion failure in a test whose entry covers only its timeouts.
  { entry: entry('fixture-assertion-as-timeout', { tests: ['fails an assertion'], failure: 'timeout' }), expected: false },
  // An assertion whose text is not the one the entry names.
  { entry: entry('fixture-assertion-other-text', { tests: ['fails an assertion'], failure: { text: ['another offender'] } }), expected: false },
  // Failed with an error of its own that is not a timeout: the hook found a defect, and
  // load does not explain it.
  { entry: entry('fixture-suite-hook-throws', { suites: ['a suite whose own hook throws'], failure: 'timeout' }), expected: false },
  // Failed, because a test inside it did, with no error of its own: a real failure there
  // must not be labelled known-unreliable by naming the suite.
  { entry: entry('fixture-suite-of-failed-test', { suites: ['a suite whose test fails'], failure: 'timeout' }), expected: false },
  // Failed, because a suite inside it did. Its own hooks ran clean.
  { entry: entry('fixture-parent-of-timed-out-hook', { suites: ['a parent suite'], failure: 'timeout' }), expected: false },
  // A suite of that name exists only under another parent, made by `describe.each`: its
  // timeout is not this top-level suite's.
  { entry: entry('fixture-same-name-elsewhere', { suites: ['a lone name'], failure: 'timeout' }), expected: false },
  // The bare name of a nested suite is not its full name.
  { entry: entry('fixture-nested-by-bare-name', { suites: ['a nested suite whose own hook times out'], failure: 'timeout' }), expected: false },
  // Its timeouts sit beside an assertion and a hook that threw, which they do not explain.
  { entry: entry('fixture-whole-module-mixed', { wholeModule: true, failure: 'timeout' }), expected: false },
];

export default class FixtureReporter extends KnownUnreliableReporter {
  protected override readonly register = FIXTURE_ENTRIES.map(({ entry }) => entry);
}
