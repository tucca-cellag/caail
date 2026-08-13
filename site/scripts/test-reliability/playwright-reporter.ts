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
  private readonly matched: UnreliableEntry[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // `timedOut` is counted as well as `failed`: a hydration race that overruns the
    // spec's budget surfaces as a timeout, and treating those as unregistered would
    // drop exactly the shape most of this register is about.
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    // Playwright retries would otherwise report the same test once per attempt. The
    // report de-duplicates by entry id, so this is belt and braces rather than load
    // bearing, but it keeps the intent visible if retries are ever enabled.
    if (result.retry > 0) return;
    this.matched.push(...entriesForPlaywrightTest(test.title));
  }

  onEnd(): void {
    const report = formatReport(this.matched);
    if (report) console.error(report);
  }

  // `printsToStdio` is deliberately left at its default of `true`. Returning false
  // would claim this reporter writes nowhere the terminal can see, which is false, and
  // Playwright uses that answer to decide whether it needs to add an implicit `list`
  // reporter of its own.
}
