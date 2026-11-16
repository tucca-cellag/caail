/**
 * vitest-reporter.ts — prints the known-unreliable register after a red vitest run.
 *
 * The register is only worth having if it reaches the person reading the output. A
 * document in the repo does not: the moment it is needed is the moment someone is
 * staring at a failure deciding whether to bisect their diff, and nothing at that
 * moment points them at a file they have never opened.
 *
 * Reports at **module** granularity by default, because that is the granularity of the
 * evidence: three consecutive full runs of this suite produced three different failing
 * *tests* inside the same five files, so naming one test would be precise about the
 * wrong thing and would stop matching on the next run.
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

import type { Reporter, TestModule } from 'vitest/node';

import {
  REGISTER,
  entriesForVitestModule,
  formatReport,
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
 * The message vitest gives a hook that ran past its budget. It carries no error code of its
 * own, so the message is what tells it apart; `vitest-reporter.test.ts` fails if the
 * installed vitest stops writing it this way.
 */
const HOOK_TIMED_OUT = /^Hook timed out in \d+ms\./;

/**
 * The failures inside `module` that an entry's `tests` or `suites` can name.
 *
 * Both walks descend into nested suites. `allTests('failed')` is empty when every failure
 * is a hook's, since a failed hook skips its tests rather than failing them; the
 * module-level entries match on the module anyway, and a suite-level hook is what
 * `suites` is for. A suite's `errors()` holds what failed in the suite itself, and only a
 * suite whose own hook timed out is collected. One that failed only because a test inside
 * it did has no error of its own, and one whose hook threw has an error load does not
 * explain: a hook that builds something and rejects its input has found a defect.
 * `vitest-reporter.test.ts` checks each case against the installed vitest.
 */
export function failuresIn(module: TestModule): VitestFailures {
  return {
    tests: [...module.children.allTests('failed')].map((test) => test.name),
    suites: [...module.children.allSuites()]
      .filter((suite) => suite.errors().some((error) => HOOK_TIMED_OUT.test(error.message ?? '')))
      .map((suite) => suite.name),
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
