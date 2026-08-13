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
 * An entry that sets `tests` narrows to those names, and the failed test names are
 * collected here for it. That matters where a module holds tests the entry is not
 * about: `community.test.ts` has three, one of which is the guard against a real Slack
 * invite being pasted into a component. Matching the module would meet that leak with
 * "this is a known artifact", which is the harm this whole register exists to prevent
 * rather than cause.
 *
 * Silent on a green run, and silent on a red run whose failures are all unregistered.
 * That second one is the point: seeing this block at all is the signal, so it must not
 * appear with nothing in it.
 */

import type { Reporter, TestModule } from 'vitest/node';

import { entriesForVitestModule, formatReport, type UnreliableEntry } from './register.js';

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

export default class KnownUnreliableReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>): void {
    const matched: UnreliableEntry[] = [];
    for (const module of testModules) {
      if (!moduleFailed(module)) continue;
      // `allTests('failed')` walks nested suites, so a test inside a `describe` is
      // found. It is empty when the module died in a hook or in collection, which is
      // exactly how the five slow-fixture entries fail — and those match on the module
      // anyway, so an empty list costs them nothing.
      const failedTestNames = [...module.children.allTests('failed')].map((test) => test.name);
      matched.push(
        ...entriesForVitestModule(module.relativeModuleId ?? module.moduleId, failedTestNames),
      );
    }

    const report = formatReport(matched);
    if (report) console.error(report);
  }
}
