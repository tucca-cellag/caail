/**
 * playwright-reporter.ts — prints the known-unreliable register after a red e2e run.
 *
 * Companion to `vitest-reporter.ts`; see that file and `register.ts` for why the
 * register is printed at the point of failure rather than kept as a document.
 *
 * Matched on the exact test title rather than the file, unlike the vitest side.
 * `licenses.spec.ts` holds ten tests and one of them is registered, so a file-level
 * match would label the other nine as known-unreliable on no evidence, which is the
 * failure this whole register is meant to prevent rather than cause.
 *
 * Runs only in the runner process. Playwright re-evaluates `playwright.config.ts` in
 * every worker, but reporters are constructed and called by the runner, so unlike the
 * preflight this needs no guard against firing once per worker.
 */

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

import { entriesForPlaywrightTest, formatReport, type UnreliableEntry } from './register.js';

export default class KnownUnreliableReporter implements Reporter {
  /**
   * Candidates, not conclusions. Filtered by final outcome in `onEnd`.
   *
   * This decides on the test's **final outcome** rather than on an attempt index. The
   * earlier version gated on `result.retry === 0`, which happens to produce the same
   * output today: measured with `--retries=1` and a test failing only its first
   * attempt, both forms print, and both are correct to, because Playwright still shows
   * that failure and labels the run flaky. So this is not a bug fix, and claiming one
   * would be the kind of unverified assertion this branch exists to discourage.
   *
   * It is still the right shape. "Was this test ultimately not fine?" is the question
   * being asked, and an attempt index only answers it by coincidence of the current
   * retry semantics and of `retries` being unset in this repo. Both could change
   * without anyone thinking about this file.
   *
   * `flaky` is reported deliberately: a registered load-shaped test going flaky is the
   * entry doing its job, and that is precisely when its control command is worth
   * printing.
   */
  private readonly candidates: TestCase[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // `timedOut` is counted as well as `failed`: a hydration race that overruns the
    // spec's budget surfaces as a timeout, and treating those as unregistered would
    // drop exactly the shape most of this register is about.
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    this.candidates.push(test);
  }

  onEnd(): void {
    const matched: UnreliableEntry[] = [];
    for (const test of this.candidates) {
      // `expected` covers a test that failed an attempt and passed on retry; `flaky`
      // and `unexpected` are both worth reporting, since a registered test going flaky
      // is the entry doing its job.
      if (test.outcome() === 'expected') continue;
      matched.push(...entriesForPlaywrightTest(test.location.file, test.title));
    }
    const report = formatReport(matched);
    if (report) console.error(report);
  }

  // `printsToStdio` is deliberately left at its default of `true`. Returning false
  // would claim this reporter writes nowhere the terminal can see, which is false, and
  // Playwright uses that answer to decide whether it needs to add an implicit `list`
  // reporter of its own.
}
