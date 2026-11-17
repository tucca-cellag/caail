/**
 * vitest-reporter.ts — prints the known-unreliable register after a red vitest run.
 *
 * The register is only worth having if it reaches the person reading the output. A
 * document in the repo does not: the moment it is needed is the moment someone is
 * staring at a failure deciding whether to bisect their diff, and nothing at that
 * moment points them at a file they have never opened.
 *
 * Reports at **module** granularity for an entry that says `wholeModule`, because that
 * is the granularity of its evidence: three consecutive full runs of this suite produced
 * three different failing *tests* inside the same five files, so naming one test would be
 * precise about the wrong thing and would stop matching on the next run.
 *
 * An entry that sets `tests` or `suites` narrows to those names, and the failures they
 * match are collected here (`failuresIn`). That matters where a module holds tests the
 * entry is not about: `community.test.ts` has three, one of which is the guard against
 * a real Slack invite being pasted into a component. Matching the module would meet that
 * leak with "this is a known artifact", which is the harm this whole register exists to
 * prevent rather than cause.
 *
 * Silent on a green run, and silent on a red run whose failures are all unregistered.
 * That second one is the point: seeing this block at all is the signal, so it must not
 * appear with nothing in it.
 */

import { stripVTControlCharacters } from 'node:util';

import type { Reporter, TestModule } from 'vitest/node';

import {
  REGISTER,
  entriesForVitestModule,
  formatReport,
  type ObservedFailure,
  type UnreliableEntry,
  type VitestFailures,
} from './register.js';

/**
 * Whether a module counts as failed.
 *
 * `ok()` covers failing tests; `state()` covers a module that died in collection or in
 * a hook, which is exactly how the registered entries fail (`Hook timed out`), so
 * checking only `ok()` would miss the case this reporter exists for.
 */
function moduleFailed(module: TestModule): boolean {
  return module.state() === 'failed' || !module.ok();
}

/**
 * The messages vitest gives a test or a hook that ran past its budget. They carry no error
 * code of their own, so the message is what tells them apart; `vitest-reporter.test.ts`
 * fails if the installed vitest stops writing them this way.
 */
const TIMED_OUT = /^(Test|Hook) timed out in \d+ms\./;

/**
 * The errors of one failed test, suite or module, as a `FailureShape` is checked against them:
 * each message and diff without terminal control sequences, which would hide the `+   "x",`
 * lines `allListedUnder` reads. vitest 4.1.12 hands reporters a plain diff even with colour
 * forced on (probed 2026-11-16), so this guards a later version that does not.
 */
function observed(errors: readonly { message?: string; diff?: string }[]): ObservedFailure {
  const plain = (text: string | undefined) => stripVTControlCharacters(text ?? '');
  return {
    timedOut: errors.length > 0 && errors.every((error) => TIMED_OUT.test(plain(error.message))),
    texts: errors.flatMap((error) => [plain(error.message), plain(error.diff)]),
  };
}

/**
 * The failures inside `module`, as entries are matched against them.
 *
 * Both walks descend into nested suites. `allTests('failed')` is empty when every failure
 * is a hook's, since a failed hook skips its tests rather than failing them. A suite's
 * `errors()` holds what failed in the suite itself, a hook, so only suites with errors of
 * their own are listed: one that failed only because a test inside it did has none. Each
 * carries what its errors were, so a hook that threw, which load does not explain, is told
 * apart from one that timed out. A top-level hook's error belongs to the module.
 * `vitest-reporter.test.ts` checks each case against the installed vitest.
 */
export function failuresIn(module: TestModule): VitestFailures {
  const moduleErrors = module.errors();
  return {
    tests: [...module.children.allTests('failed')].map((test) => {
      const result = test.result();
      return { name: test.fullName, ...observed(result.state === 'failed' ? result.errors : []) };
    }),
    // By full name, `parent > child`, as tests are, so a suite is told apart from another
    // of the same name under a different parent, however that one was made.
    suites: [...module.children.allSuites()]
      .filter((suite) => suite.errors().length > 0)
      .map((suite) => ({
        name: suite.fullName,
        holdsFailedTest: !suite.children.allTests('failed').next().done,
        ...observed(suite.errors()),
      })),
    ...(moduleErrors.length > 0 ? { module: observed(moduleErrors) } : {}),
  };
}

export default class KnownUnreliableReporter implements Reporter {
  /** The register to match against. Replaced only by this reporter's own test. */
  protected readonly register: readonly UnreliableEntry[] = REGISTER;

  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const matched: UnreliableEntry[] = [];
    for (const module of testModules) {
      if (!moduleFailed(module)) continue;
      matched.push(
        ...entriesForVitestModule(
          module.relativeModuleId ?? module.moduleId,
          failuresIn(module),
          this.register,
        ),
      );
    }

    const report = formatReport(matched);
    if (report) console.error(report);
  }
}
