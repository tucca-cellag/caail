/**
 * The known-unreliable test register: which tests in this repo have failed without
 * a defect, and **under what condition**.
 *
 * A suite with known-flaky tests and no marking is weaker than a suite with fewer
 * tests, because it trains everyone to discount its output. The cost is not the
 * failures, it is what a red run means afterwards: a contributor cannot tell a real
 * regression from a scheduling artifact, and the cheapest response to an unexplained
 * red is to re-run it, which is exactly the habit that makes a genuine intermittent
 * regression invisible.
 *
 * ## Why the condition, and not just the name
 *
 * A list of names is worse than useless here, because the three shapes below want
 * different triage moves, and the standard move is right for only one of them:
 *
 *  - **load** — fails under CPU contention, passes when the machine is quiet, and the
 *    failing *set moves between runs*. Re-running is informative. `--no-file-parallelism`
 *    (vitest) or `--workers=1` (Playwright) is the control.
 *  - **artifact** — deterministic within one `dist`. The suite fails identically every
 *    time, which reads as a solid reproducible regression, and `--repeat-each` makes the
 *    wrong conclusion look better evidenced rather than worse: repeated runs against one
 *    build are one observation counted N times. Re-running is actively misleading. These
 *    are caught before the suite starts by `scripts/e2e-preflight.ts`; they are listed
 *    here so this file is the whole inventory, not re-checked here.
 *  - **residue** — depends on a file an *earlier, unrelated run* left in the workspace.
 *    Deterministic while the residue exists and gone the moment it is cleared, so
 *    re-running never helps and the control is to delete the leftover. This one is
 *    genuinely run-order-dependent: the order that matters is between runs, not between
 *    tests, so it survives every per-test isolation flag there is.
 *
 * ## The shape that was claimed and does not exist, and the one that does
 *
 * tucca-cellag/caail-planning#207 recorded `licenses.spec.ts`'s license facet as *order-dependent between
 * tests*, on the evidence that it failed 0/5 alone and passed 30/30 in its file.
 * **That reading was wrong.** The isolating run used `--repeat-each=5` with no
 * `--workers`, and Playwright starts one worker per repeat group, so "run just this one
 * test five times" silently became "launch five browsers at once" while the file run
 * used `--workers=1`. The variable was concurrency: measured on the unfixed spec,
 * `--workers=1 --repeat-each=5` passes 5/5 and `--workers=16 --repeat-each=16` fails
 * 5/16. It was **load**, and it is fixed.
 *
 * That correction is easy to over-apply, so state the limit: **a run-order shape does
 * exist in this repo**, it is `residue`, and it is not the one that was claimed. It
 * turns on which *runs* have happened in this workspace rather than on the order of
 * tests within a run, which is why no amount of `--workers=1` reaches it. tucca-cellag/caail-planning#183 is
 * the live instance.
 *
 * The rule both halves come from: **a run that "isolates" a test has to be checked for
 * what else it changed.** An entry here records the condition in terms of the variable
 * that was actually held, or it teaches the next reader a false rule, which is worse
 * than teaching them nothing.
 *
 * ## What an entry is NOT
 *
 * Being listed here is not permission to ignore a failure, and the reporters that
 * print this register say so. It narrows where to look first. A registered test can
 * still be failing for a real reason, and the only way to tell is to run the control
 * in `reproduce` and see whether the failure survives it.
 *
 * ## Keeping it honest
 *
 * A hand-written list of test names beside the tests themselves is this repo's most
 * expensive recurring bug shape. `register.test.ts` is the oracle: every entry names
 * a file that must exist and an `anchor` string that must appear verbatim in it, so
 * renaming or deleting a registered test fails the suite until the entry is updated
 * or retired. Measurements in `evidence` are dated snapshots, and each carries the
 * command that reprints the real number.
 */

import { escapeRegExp } from '../../src/lib/escape-regexp.js';

/** The condition class an entry misbehaves under. See the module docstring. */
export type Shape = 'load' | 'artifact' | 'residue';

export type Status =
  /** Still misbehaves. Expect to meet it. */
  | 'open'
  /** A fix landed. Kept so a recurrence is recognised rather than rediscovered. */
  | 'mitigated'
  /** A preflight check aborts the run naming the cause before any test runs. */
  | 'guarded';

/**
 * How an entry's unit fails under its condition. A failure is labelled only when it has this
 * shape, so the same test failing another way, such as the assertion a real defect trips,
 * prints as unregistered.
 *
 *  - `'timeout'`: it ran past its time budget. On Playwright, the test's own timeout
 *    (`result.status === 'timedOut'`); an `expect` that ran out of a timeout of its own fails
 *    with status `failed` and is not this. On vitest, every error it failed with is vitest's
 *    "Test timed out in" or "Hook timed out in".
 *  - `{ missing }`: Playwright only. An `expect` on one of these locators ran out of its own
 *    timeout with no element matching it (`notFound`). Every web-first assertion retries to its
 *    timeout, so a timeout alone says nothing: a matched element with the wrong text or state,
 *    which is how a regression in one usually fails, is not this. Each locator is written as
 *    Playwright describes it, `locator('.x')`, and matched exactly, so a locator chained off it
 *    is a different one.
 *  - `{ text }`: it failed with an error whose text holds one of these strings, for a failure
 *    that is an assertion rather than a timeout, such as a measured value over its limit. Playwright's text is the error message cut before the source snippet it quotes;
 *    vitest's adds each error's diff.
 *  - `{ allListedUnder }`: vitest only. It failed an assertion whose diff lists what was
 *    received (`+   "path",` lines), and every item listed lies under one of these
 *    directories. For residue: one item anywhere else, such as a real paste under `src/`
 *    beside the leftover, is a failure the residue does not explain, and goes unlabelled.
 *
 * Every string a shape names must appear verbatim in `file` (for `missing`, the whole
 * `locator('...')` expression), or for a residue entry in its `reproduce`, which removes the
 * leftover it names;
 * `register.test.ts` enforces it, so a reworded assertion or a changed selector cannot leave the
 * entry matching nothing unnoticed. An entry may state several shapes, any of which labels.
 */
export type FailureShape =
  | 'timeout'
  | { readonly missing: readonly string[] }
  | { readonly text: readonly string[] }
  | { readonly allListedUnder: readonly string[] };

/** The strings a failed vitest assertion's diff lists on its received side, `+   "x",`. */
export function receivedItems(text: string): string[] {
  return [...text.matchAll(/^\+\s+"(.*)",?$/gm)].map((m) => m[1]!);
}

/** An entry's `failure`: one shape, or several, any one of which labels a failure. */
export type FailureShapes = FailureShape | readonly FailureShape[];

/**
 * The locator a Playwright `expect` gave up on because no element matched it, as Playwright
 * describes it (`locator('.x')`), or none. Playwright 1.64 writes that failure with a `Locator:`
 * line, a `Timeout: NNNms` line and `Error: element(s) not found`; an element that matched but
 * had the wrong text or state is written with a `Received:` line instead, and gives none here.
 */
export function notFound(text: string): string[] {
  const locator = /^Locator:\s+(.+)$/m.exec(text);
  const gaveUp = /^Timeout:\s+\d+ms$/m.test(text) && /^Error: element\(s\) not found$/m.test(text);
  return locator && gaveUp ? [locator[1]!.trim()] : [];
}

/** One failure a reporter saw, in the terms a `FailureShape` is checked against. */
export interface ObservedFailure {
  /** Whether it ran past its time budget, as `FailureShape`'s `'timeout'` reads that. */
  timedOut: boolean;
  /** The text of the errors it failed with. */
  texts: readonly string[];
}

/** Whether an entry states several shapes rather than one. */
function isShapeList(shapes: FailureShapes): shapes is readonly FailureShape[] {
  return Array.isArray(shapes);
}

/** The shapes an entry's `failure` states, as a list however many it states. */
export function shapeList(shapes: FailureShapes | undefined): readonly FailureShape[] {
  if (shapes === undefined) return [];
  return isShapeList(shapes) ? shapes : [shapes];
}

/** Whether `failure` has one of the shapes `shapes` describes. No shape matches nothing. */
export function shapeMatches(shapes: FailureShapes | undefined, failure: ObservedFailure): boolean {
  return shapeList(shapes).some((shape) => {
    if (shape === 'timeout') return failure.timedOut;
    if ('missing' in shape) return failure.texts.some((text) => notFound(text).some((locator) => shape.missing.includes(locator)));
    if ('allListedUnder' in shape) {
      const items = failure.texts.flatMap(receivedItems);
      return items.length > 0 && items.every((item) => shape.allListedUnder.some((dir) => item.startsWith(`${dir}/`)));
    }
    return shape.text.some((text) => failure.texts.some((observed) => observed.includes(text)));
  });
}

/** The strings a shape names, which `register.test.ts` requires to be found where it says. */
export function shapeStrings(shapes: FailureShapes | undefined): string[] {
  return shapeList(shapes).flatMap((shape) => {
    if (shape === 'timeout') return [];
    if ('missing' in shape) return [...shape.missing];
    if ('allListedUnder' in shape) return [...shape.allListedUnder];
    return [...shape.text];
  });
}

export interface UnreliableEntry {
  /** Stable slug. Referenced from commit messages and tickets; do not reuse. */
  id: string;
  suite: 'vitest' | 'playwright';
  /** Path relative to `site/`. Must exist. */
  file: string;
  /**
   * Human label for the failing unit, for display. On a Playwright entry it is also the
   * test title the reporter matches (`titleMatches`), so it may be a template.
   */
  unit: string;
  /**
   * A string that must appear verbatim in `file`. This is the anti-rot oracle, not a
   * matcher: it exists so that renaming or deleting the registered test fails
   * `register.test.ts` rather than leaving a stale entry that reads as live.
   */
  anchor: string;
  /**
   * vitest only: match these tests by full name (`titleMatches`) rather than the whole module.
   * A full name is vitest's `TestCase.fullName`: the test's name after each enclosing suite's,
   * joined by ` > `, so a test of the same name under another parent is not this one.
   *
   * Module-level matching (`wholeModule`) is right for the five slow-fixture files:
   * their failing *test* moves between runs, so naming one would be precise about the
   * wrong thing. It is wrong wherever a module holds tests the entry is not about,
   * because the reporter would then label a genuine failure as known-unreliable, the
   * harm the Playwright side's title matching already exists to avoid.
   *
   * Each ` > ` level of each full name here must be the name of a call in `file`: a
   * `describe` or `suite` call for an enclosing suite, and an `it` or `test` call for the test itself, a template as its source writes it; `register.test.ts` enforces it, so
   * renaming any level fails there. That proves each level still exists in the file, not that
   * the levels still nest: moving one under a new parent changes its full name, the entry stops
   * matching, and the failure prints as unregistered, the safe direction, with that check
   * green. Checking the nesting would take parsing the file's suite structure, the hand-written
   * lexing this register avoids elsewhere, or collecting the file with vitest, so it is not
   * done.
   */
  tests?: readonly string[];
  /**
   * vitest only: match these `describe` blocks by full name when one's own hook times out,
   * which is how a suite-level `beforeAll` fails under load. A full name is vitest's
   * `TestSuite.fullName`: the suite's name after each enclosing suite's, joined by ` > `.
   *
   * `tests` cannot register that hook. When it fails, vitest marks the suite failed with
   * the hook's error and skips every test inside it, so no test fails and there is no
   * name to match. Module-level matching would register it, and would also label every
   * other suite in the module.
   *
   * A suite matches only when its own error has the entry's `failure` shape, which for a
   * hook under load is `'timeout'`. A suite whose hook threw is failed with an error of its
   * own too, and stays unlabelled under that shape: a hook that builds
   * something and rejects its input, as `buildLlmsFullText`'s does on a link it cannot
   * make absolute, has found a defect that load does not explain. So does a suite whose
   * hooks ran clean but which holds a failing test; it fails with no error of its own,
   * and that failure is the genuine regression this narrowing exists not to excuse. And a
   * suite whose hook did time out, if a test inside it failed first: an `afterAll` running
   * out of time after a real failure does not account for that failure.
   * `vitest-reporter.test.ts` runs the installed vitest on a fixture and fails if any of
   * these stops being how vitest reports it.
   *
   * Matching the full name rather than the bare one means a suite of the same name under
   * another parent is not labelled, however it was made: a second `describe`, a
   * `describe.each` row, a loop or `suite()`.
   *
   * Each ` > ` level of each full name here must be the name of a call in `file`: a
   * `describe` or `suite` call for an enclosing suite; `register.test.ts` enforces it, so
   * renaming any level fails there. That proves each level still exists in the file, not that
   * the levels still nest: moving one under a new parent changes its full name, the entry stops
   * matching, and the failure prints as unregistered, the safe direction, with that check
   * green. Checking the nesting would take parsing the file's suite structure, the hand-written
   * lexing this register avoids elsewhere, or collecting the file with vitest, so it is not
   * done.
   */
  suites?: readonly string[];
  /**
   * vitest only: match failures anywhere in `file`, when every one of them has the entry's
   * `failure` shape. Set only where the failing test moves between runs, so no name would
   * hold.
   *
   * Every vitest entry sets this or narrows with `tests` or `suites`, never both, and
   * `register.test.ts` fails on one that does neither. Without that, an entry that lost
   * its narrowing would widen to its whole module in silence, and start labelling the
   * module's other tests. An entry with none of the three matches nothing.
   */
  wholeModule?: true;
  /**
   * The shape of failure this entry covers (`FailureShape`), read from its evidence. Every
   * entry a reporter can match states one, which `register.test.ts` checks; the preflight's
   * artifact entries, which no test failure matches, carry none. An entry without one
   * matches nothing.
   */
  failure?: FailureShapes;
  shape: Shape;
  /** One or two sentences: when does it misbehave, and when does it not. */
  condition: string;
  /**
   * The triage move that returns a confident wrong answer on this entry, when there
   * is one. Omitted when the obvious move works.
   */
  misleadingTriage?: string;
  /** Dated measurement. Say what was held fixed. */
  evidence: string;
  /** The command that distinguishes this entry's condition from a real defect. */
  reproduce: string;
  status: Status;
  /** What was done about it, for `mitigated` and `guarded`. */
  mitigation?: string;
  /** Tickets carrying the reasoning. */
  tickets: string[];
}

/**
 * Playwright matching is always file plus title (`titleMatches`). vitest matching is by
 * the named tests or suites an entry sets, or by the whole module where it says
 * `wholeModule`. Either way, only a failure of the shape the entry's `failure` states,
 * read from its evidence, is labelled: the same test failing another way is not.
 *
 * Whole-module matching is not laziness: the five slow-fixture entries below genuinely
 * fail as whole files, and which test inside them fails moves between runs (three
 * consecutive full runs produced three different sets), so naming one would be precise
 * about the wrong thing. Every other entry narrows, or the reporter labels the rest of
 * its module as known-unreliable on no evidence.
 */
export const REGISTER: readonly UnreliableEntry[] = [
  // -------------------------------------------------------------------------
  // vitest: the slow-fixture files. These are the five slowest files in the
  // suite, which is not a coincidence: they fail because their fixtures sit
  // closest to the per-hook and per-test budget, so contention reaches them first.
  // -------------------------------------------------------------------------
  {
    id: 'vitest-metrics-corpus-hook',
    suite: 'vitest',
    wholeModule: true,
    file: 'scripts/parser/metrics.test.ts',
    unit: 'beforeAll of "buildMetricsModel — real corpus"',
    anchor: "describe('buildMetricsModel — real corpus'",
    failure: 'timeout',
    shape: 'load',
    condition:
      'Fails with "Hook timed out" when the machine is under CPU contention. Passes alone, ' +
      'and passes in a serial run, on the same tree and the same commit.',
    evidence:
      '2026-08-13, load average ~25 on 10 cores: two back-to-back full parallel runs, the ' +
      'first failed this hook (plus emit and mutate), the second passed 861/861. ' +
      '--no-file-parallelism passed 861/861. The hook does ~2.0s of work when the machine ' +
      'is quiet, of which ~1.2s is buildMetricsModel itself, the function under test.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    mitigation:
      'Partly. The hook budget is now 30s against ~1-2s of work (scripts/test-reliability/' +
      'budgets.ts, headroom via `pnpm bench:fixtures`). Sharing the corpus models does NOT ' +
      'help this file: it builds each once, and ~60% of the hook is buildMetricsModel, the ' +
      'unit under test. Still open because a budget is not a fix.',
    tickets: ['tucca-cellag/caail-planning#207'],
  },
  {
    id: 'vitest-seed-topics-hook',
    suite: 'vitest',
    wholeModule: true,
    file: 'scripts/db/seed.test.ts',
    unit: 'top-level beforeAll (seeds the real corpus)',
    anchor: 'summary = seedTopics(db);',
    failure: 'timeout',
    shape: 'load',
    condition:
      'Same "Hook timed out" as metrics.test.ts, under the same contention. The hook seeds ' +
      'papers, both catalog files, datasets and topics into a fresh DB.',
    evidence: '2026-08-12: observed timing out in a full parallel run. Runs ~2.3s serial.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    mitigation:
      'Partly: the hook budget is now 30s (scripts/test-reliability/budgets.ts). The corpus ' +
      'models it builds are not the bulk of it, so the shared fixture does not apply.',
    tickets: ['tucca-cellag/caail-planning#207'],
  },
  {
    id: 'vitest-db-dataset-entries',
    suite: 'vitest',
    wholeModule: true,
    file: 'scripts/db/dataset-entries.test.ts',
    unit: "beforeAll of 'seedDatasets (rows + entries share the ds: namespace)'",
    anchor: "describe('seedDatasets (rows + entries share the ds: namespace)'",
    failure: 'timeout',
    shape: 'load',
    condition: 'Hook timeout under contention. Runs ~1.6s serial.',
    evidence: '2026-08-12: in one of three consecutive full runs, each of which failed a different set.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    mitigation: 'Partly: the hook budget is now 30s (scripts/test-reliability/budgets.ts).',
    tickets: ['tucca-cellag/caail-planning#207'],
  },
  {
    id: 'vitest-db-mutate',
    suite: 'vitest',
    wholeModule: true,
    file: 'scripts/db/mutate.test.ts',
    unit: 'per-test timeout, most often the first addItem round-trip',
    anchor: 'assigns the next ref id, wires a matrix cell, round-trips reachable + lint-green',
    failure: 'timeout',
    shape: 'load',
    condition:
      'Individual tests exceed the per-test budget under contention. Each test imports a ' +
      'fresh DB and re-parses an emitted file on purpose, so the cost is test isolation ' +
      'rather than a shareable fixture.',
    evidence: '2026-08-13: failed in the first of two back-to-back parallel runs, passed in the second. Runs ~4.3s serial.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    mitigation:
      'Partly: the per-test budget is now 20s (scripts/test-reliability/budgets.ts). The work ' +
      'itself cannot be shared, because each test needs a fresh DB and a fresh re-parse.',
    tickets: ['tucca-cellag/caail-planning#207'],
  },
  {
    id: 'vitest-db-emit',
    suite: 'vitest',
    wholeModule: true,
    file: 'scripts/db/emit.test.ts',
    unit: 'per-test timeout, most often the Papers.md round-trip',
    anchor: 're-parses to a JSON-identical model',
    failure: 'timeout',
    shape: 'load',
    condition:
      'Individual tests exceed the per-test budget under contention. The slowest test emits ' +
      'Papers.md and re-parses it, which is the fidelity bar the file exists to hold, so the ' +
      'work cannot be cached away.',
    evidence: '2026-08-13: failed in the first of two back-to-back parallel runs, passed in the second. Runs ~5.9s serial, slowest test ~1.4s.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    mitigation:
      'Partly: the per-test budget is now 20s (scripts/test-reliability/budgets.ts). The work ' +
      'itself cannot be shared, because each test needs a fresh DB and a fresh re-parse.',
    tickets: ['tucca-cellag/caail-planning#207'],
  },

  // -------------------------------------------------------------------------
  // vitest: one slow hook or test in a module of others, so each entry names it
  // rather than the module.
  // -------------------------------------------------------------------------
  {
    id: 'vitest-llms-full-hook',
    suite: 'vitest',
    file: 'scripts/parser/llms-full.test.ts',
    unit: 'beforeAll of "buildLlmsFullText"',
    anchor: 'relative = nonAbsoluteMarkdownTargets(fullText(), { page: true });',
    suites: ['buildLlmsFullText'],
    failure: 'timeout',
    shape: 'load',
    condition:
      'Fails with "Hook timed out" under CPU contention. The hook builds the full llms-full.txt ' +
      'text, resolving every page\'s links, and parses it once more for link targets. Passed in ' +
      'a serial run of the same tree.',
    evidence:
      '2026-11-13, local, a parallel full run under heavy swap: the hook timed out at 30s, and ' +
      'the registered metrics, seed and mutate entries failed alongside it. ' +
      '--no-file-parallelism passed 1,858 of 1,858. Seen once.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },
  {
    id: 'vitest-agent-api-link-scan',
    suite: 'vitest',
    file: 'scripts/parser/agent-api.test.ts',
    unit: 'ships no relative Markdown link target in any emitted endpoint',
    anchor: 'ships no relative Markdown link target in any emitted endpoint',
    tests: ['site-relative hrefs in the API > ships no relative Markdown link target in any emitted endpoint'],
    failure: 'timeout',
    shape: 'load',
    condition:
      'Exceeds the per-test budget under CPU contention. The test builds every agent-API ' +
      'endpoint and scans each string in them for Markdown link targets. Passed in a serial run.',
    evidence:
      '2026-11-14, local, a parallel vitest run on another branch: 21.9s against the 20s ' +
      'budget. The serial control passed. Seen once.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },

  // -------------------------------------------------------------------------
  // Playwright: pre-hydration clicks on server-rendered island controls.
  // -------------------------------------------------------------------------
  {
    id: 'pw-license-facet',
    suite: 'playwright',
    file: 'e2e/licenses.spec.ts',
    unit: 'the catalog license facet narrows the grid to a tier',
    anchor: 'the catalog license facet narrows the grid to a tier',
    failure: { text: ['toBeLessThan'] },
    shape: 'load',
    condition:
      'Clicked the license facet before CatalogBrowser hydrated, so the click was lost and ' +
      'the grid stayed at its full count. Fixed by waiting for hydration.',
    misleadingTriage:
      'Running it "alone" with --repeat-each and no --workers made it fail, because Playwright ' +
      'starts one worker per repeat group. That reads as a reproducible regression in the ' +
      'license facet; it was the most contended configuration available.',
    evidence:
      '2026-08-13, unfixed: --workers=1 --repeat-each=5 passed 5/5, --workers=16 --repeat-each=16 ' +
      'failed 5/16. Fixed: 16/16 at --workers=16 under load average 26.9. Independently on ' +
      '2026-08-12 (f548fc8) it failed 3 runs in 5 on main, and adding a report link to every ' +
      'catalog card pushed that to 4 in 5, which is corroboration rather than coincidence: more ' +
      'DOM means slower hydration means a wider window for the click to be lost.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/licenses.spec.ts ' +
      '-g "narrows the grid" --repeat-each=16 --workers=16',
    status: 'mitigated',
    mitigation:
      "awaitHydrated(page, 'CatalogBrowser') before the facet click, landed in f548fc8.",
    tickets: ['tucca-cellag/caail-planning#207'],
  },
  {
    id: 'pw-most-cited-facet',
    suite: 'playwright',
    file: 'e2e/citations.spec.ts',
    unit: 'the "Most cited" facet narrows Software to cited entries, most-cited first',
    anchor: 'the "Most cited" facet narrows Software to cited entries, most-cited first',
    failure: { text: ['toBeLessThan'] },
    shape: 'load',
    condition:
      'The same pre-hydration click as the license facet, on the same island and page. Fixed ' +
      'earlier, and it is the control that identified the license facet\'s cause: the two ' +
      'differ only in this wait.',
    evidence: '2026-08-13: 16/16 at --workers=16 --repeat-each=16, in the same conditions that failed the unguarded license facet 5/16.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/citations.spec.ts ' +
      '-g "Most cited" --repeat-each=16 --workers=16',
    status: 'mitigated',
    mitigation: 'awaitHydrated(page, \'CatalogBrowser\') before the facet click.',
    tickets: ['tucca-cellag/caail-planning#207', 'tucca-cellag/caail#159'],
  },
  {
    id: 'pw-network-edge-click',
    suite: 'playwright',
    file: 'e2e/network-metrics.spec.ts',
    unit: 'edges are inert — clicking a connection selects nothing and clears the panel',
    anchor: "await page.waitForSelector('.ng-canvas canvas'",
    failure: 'timeout',
    shape: 'load',
    condition:
      'Recorded in tucca-cellag/caail-planning#2 as a hydration-timing race on the graph, which the ' +
      'canvas wait below closed. The test still runs past its 30s budget when the machine is ' +
      'loaded, and passes with --workers=1 on the same build.',
    evidence:
      '2026-08-13: 45/45 under --repeat-each=3; did not reproduce. Note that Playwright ran ' +
      'that as 3 workers, one per repeat group, despite --workers=12: tests in one file are ' +
      'serial in one worker unless fullyParallel is set. So this is weaker evidence than the ' +
      '16-worker runs above, and it is a lower bound rather than a clean bill of health. ' +
      '2026-11-13, local, on a branch that did not touch the network page: timed out at 30.1s ' +
      'in a full e2e pass (277 passed, 1 failed) run straight after another on the same ' +
      'machine, and the reporter named this entry. The control below passed 3/3 at 1.2s each, ' +
      '48/48 for the file.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/network-metrics.spec.ts ' +
      '--repeat-each=3 --workers=1',
    status: 'open',
    mitigation:
      "Partly: waitForSelector('.ng-canvas canvas') for the graph, and retrying assertions on " +
      '.hf-bar for the hub filters, closed the race. They do not stop the timeout under load.',
    tickets: [
      'tucca-cellag/caail-planning#207',
      'tucca-cellag/caail-planning#2',
      'tucca-cellag/caail-planning#604',
    ],
  },

  // -------------------------------------------------------------------------
  // Playwright: a wait or a measured value that contention moves past its
  // bound. Each passed once concurrency was held.
  // -------------------------------------------------------------------------
  {
    id: 'pw-homepage-rail-hover',
    suite: 'playwright',
    file: 'e2e/homepage-agent.spec.ts',
    unit: 'expanded labels stay clear of the content column at ${width}px',
    anchor: "await page.locator('.rail').hover();",
    failure: 'timeout',
    shape: 'load',
    condition:
      'The hover on the section rail timed out at 30s while the machine was loaded. The hover ' +
      'is the same step at every width the loop generates, so the entry names the test at all ' +
      'of them, though it was seen at one.',
    evidence:
      '2026-10-21, local gates for tucca-cellag/caail#261, each with a /code-review agent running ' +
      'alongside the full suite: locator.hover on .rail timed out at 30s, at 1600px. The ' +
      'network edge-click test failed the same way in the same runs. Run alone with ' +
      '--workers=1 the spec passed in full, and the full suite passed three times running at ' +
      '--workers=2.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/homepage-agent.spec.ts --workers=1',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },
  {
    id: 'pw-network-small-node',
    suite: 'playwright',
    file: 'e2e/network-metrics.spec.ts',
    unit: 'a small node selects when clicked at its centre',
    anchor: 'const t = await pickSmallNode(page);',
    failure: 'timeout',
    shape: 'load',
    condition:
      'Ran past the 30s test timeout waiting for the selected node\'s panel (.ng-panel .ng-slug) ' +
      'in a slow full run. Passed alone with --workers=1 on the same build.',
    evidence:
      '2026-10-29, local, on a branch that changed four paper titles and nothing on this page: ' +
      'the full test:e2e run took 2.0 min against a usual 1.1 min, with a code-review agent ' +
      'running alongside and 38% of memory free. Re-run alone with --workers=1 on the same dist ' +
      'it passed in 1.8s. The suite had passed in full earlier on the same branch.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/network-metrics.spec.ts ' +
      '-g "a small node selects" --workers=1',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },
  {
    id: 'pw-report-two-steps',
    suite: 'playwright',
    file: 'e2e/report.spec.ts',
    unit: 'a reason with nothing to ask takes two steps, not three',
    anchor: "await expect(page.locator('#caail-h-review')).toHaveText('Step 2 of 2: Your report');",
    failure: 'timeout',
    shape: 'load',
    condition:
      'Ran past the 30s test timeout waiting for the review step\'s heading (#caail-h-review) ' +
      'in a slow full run. Passed alone with --workers=1 on the same build.',
    evidence:
      '2026-10-29, the same run as pw-network-small-node (2.0 min against a usual 1.1 min, a ' +
      'code-review agent alongside, 38% of memory free). Re-run alone with --workers=1 on the ' +
      'same dist it passed in 0.7s.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/report.spec.ts ' +
      '-g "a reason with nothing to ask" --workers=1',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },
  {
    id: 'pw-license-badges-axe',
    suite: 'playwright',
    file: 'e2e/licenses.spec.ts',
    unit: 'the license badges introduce no axe violations on /software/',
    anchor: 'the license badges introduce no axe violations on /software/',
    failure: 'timeout',
    shape: 'load',
    condition:
      'Timed out in a run of seven specs with review agents running alongside, and passed with ' +
      'its file run alone on the same build.',
    evidence:
      '2026-11-05, local, on a branch that changed only dataset entries: timed out in a run of ' +
      'the datasets, topics, topics-band, network-metrics, report, citations and licenses specs ' +
      'at head 032b51d, with review agents alongside; 99 of 100 passed. licenses.spec.ts re-run ' +
      'alone on the same dist passed 10/10, at a worker count nobody recorded. 2026-11-16, on ' +
      'a later build: the control below passed 10/10, this test in 5.1s.',
    reproduce: 'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/licenses.spec.ts --workers=1',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },
  {
    id: 'pw-topics-lead-axe',
    suite: 'playwright',
    file: 'e2e/topics.spec.ts',
    unit: 'a theme view with a named lead has no axe violations',
    anchor: "const lead = page.locator('.th-lead-full');",
    failure: { missing: ["locator('.th-lead-full')"] },
    shape: 'load',
    condition:
      'The lead credit renders inside the topics hub island (client:load), and under contention ' +
      'it was not visible within the 5s visibility wait. Passed with --workers=1 on the same ' +
      'build.',
    evidence:
      '2026-11-05, local, on a branch that changed one dataset entry and its licence: ' +
      '.th-lead-full not found within 5s on ./topics/?t=ai-methods-tooling, in a run of the ' +
      'datasets, licenses, topics and topics-band specs at default workers, load average about ' +
      '30. The control below passed 6/6 in 9s on the same dist.',
    reproduce: 'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/topics.spec.ts --workers=1',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },
  {
    id: 'pw-hero-stripe-cls',
    suite: 'playwright',
    file: 'e2e/hero-stripe.spec.ts',
    unit: 'on a slowed phone the hero band records no layout shift and the page stays under good CLS',
    anchor: "await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });",
    failure: { text: ['total layout shift, every entry summed'] },
    shape: 'load',
    condition:
      'A measured value, not a wait. The test throttles the CPU and sums every layout shift on ' +
      'the page, and on a busy runner that sum went over GOOD_CLS. Load moves the measurement, ' +
      'so the failure is a number over a threshold rather than a timeout. Passed with ' +
      '--workers=1 on the same head.',
    misleadingTriage:
      'It fails an assertion on a measured layout shift, so it reads as a real CLS regression in ' +
      'whatever the diff changed; its one occurrence was on a diff that changed nothing the ' +
      'homepage renders. Sized from CI history it disappears: once a re-run passes, gh run list ' +
      'reports the run as success, and the failed attempt shows only in ' +
      'gh run view <id> --attempt 1.',
    evidence:
      '2026-11-13, CI: tucca-cellag/caail#297, run 43379061020 attempt 1 (head adf8d2a), the ' +
      'summed layout shift was 0.174 against the 0.1 limit, the only failure of 275 e2e tests ' +
      'in the job. The spec had passed on main\'s two previous test.yml runs, and the failed ' +
      'job\'s re-run (attempt 2) passed on the same head. The control below passed 12/12 on that ' +
      'head\'s dist, this test in 362 to 444 ms.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/hero-stripe.spec.ts ' +
      '--workers=1 --repeat-each=3',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#604'],
  },

  // -------------------------------------------------------------------------
  // residue: a leftover from an earlier run in the same workspace.
  // -------------------------------------------------------------------------
  {
    id: 'vitest-community-invite-walk',
    suite: 'vitest',
    file: 'src/lib/community.test.ts',
    unit: 'appears nowhere under site/ except this module and its test',
    // Two tests in this module have nothing to do with residue, and one of them is the
    // guard against a real Slack-invite paste. Matching the module would greet that
    // leak with "this is a known artifact".
    tests: ['the community Slack invite is confined to two places > appears nowhere under site/ except this module and its test'],
    // Anchored on the skip list rather than the test title, because the skip list is
    // what makes the condition true: widen it and this entry is obsolete, so the entry
    // should be forced back under review. The title is covered by `tests` above.
    anchor: "const SKIP = new Set(['node_modules', 'dist', 'coverage', '.astro', '.git', 'public']);",
    failure: { allListedUnder: ['test-results', 'playwright-report'] },
    shape: 'residue',
    condition:
      'The walk that enforces where the Slack invite may appear does not respect .gitignore. ' +
      'It skips a hand-maintained list (node_modules, dist, coverage, .astro, .git, public) ' +
      'plus dot-prefixed names, so every OTHER generated directory is in scope, including ' +
      'the two Playwright writes to: site/test-results/ and site/playwright-report/. A ' +
      'failed run leaves a page snapshot in one of them, the homepage snapshot contains the ' +
      'invite because CommunityBand renders it, and the next vitest run calls it an offender.',
    misleadingTriage:
      'It fails as a content-confinement violation in a file the developer has never touched, ' +
      'on a branch that changed something unrelated, so it reads as a real disclosure leak. ' +
      'Re-running does not clear it and neither does any isolation flag, because the trigger ' +
      'is a previous run rather than this one. Only deleting the leftover changes the outcome.',
    evidence:
      '2026-08-13, reproduced end to end on the real path rather than by planting a file: ' +
      'injected a failure into homepage-agent.spec.ts, restored the spec, and community.test.ts ' +
      'then failed on test-results/homepage-agent-the-hero-co-b5cfc--before-the-typewriter-runs/' +
      'error-context.md, the same file tucca-cellag/caail-planning#183 reported. rm -rf site/test-results and it ' +
      'passed again with nothing else changed.',
    // Both directories, because clearing only one leaves the failure standing and the
    // report's own instruction ("if it survives the control, it is real") would then
    // certify a fabricated disclosure leak.
    reproduce:
      'rm -rf site/test-results site/playwright-report && pnpm --dir site test src/lib/community.test.ts',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#183', 'tucca-cellag/caail-planning#207'],
  },

  // -------------------------------------------------------------------------
  // artifact/environment: NOT re-checked here. scripts/e2e-preflight.ts aborts
  // the run naming the cause before any spec executes. Listed so this register
  // is the whole inventory of ways a red run misleads.
  // -------------------------------------------------------------------------
  {
    id: 'artifact-pagefind-nul',
    suite: 'playwright',
    file: 'scripts/e2e-preflight.ts',
    unit: 'every spec that opens search (explorer.spec.ts, privacy.spec.ts)',
    anchor: 'PAGEFIND_ARTIFACTS',
    shape: 'artifact',
    condition:
      'An incremental build intermittently writes dist/pagefind/pagefind.js and ' +
      'pagefind-entry.json at the correct size and entirely zero-filled. Search never ' +
      'initialises and every spec that opens it fails on a content assertion.',
    misleadingTriage:
      'Deterministic within one dist, so it fails identically every run and --repeat-each makes ' +
      'the wrong conclusion look better evidenced. It also lands on the search specs, so any ' +
      'change that plausibly touches search gets blamed.',
    evidence: 'Observed at least twice in one session on 2026-08-12, and independently by a second process.',
    reproduce: "LC_ALL=C tr -d '\\000' < site/dist/pagefind/pagefind.js | wc -c   # 0 means corrupt",
    status: 'guarded',
    mitigation: 'The preflight aborts before the suite. Fix: rm -rf dist && pnpm build.',
    tickets: ['tucca-cellag/caail-planning#207', 'tucca-cellag/caail-planning#199'],
  },
  {
    id: 'artifact-held-port',
    suite: 'playwright',
    file: 'scripts/e2e-preflight.ts',
    unit: 'the whole suite, against a build nobody made',
    anchor: 'export function isPortHeld(',
    shape: 'artifact',
    condition:
      'reuseExistingServer is on outside CI, so a preview server left running is silently ' +
      'adopted and keeps serving a deleted or foreign build.',
    misleadingTriage:
      'The run reports on an artifact that is not your working tree, so it can make a rebuild ' +
      'appear to pass and invert a conclusion about a real defect.',
    evidence: '2026-08-12: made a rebuild appear to pass and briefly inverted a conclusion during tucca-cellag/caail-planning#199.',
    reproduce: 'lsof -ti:<port>',
    status: 'guarded',
    mitigation: 'The preflight aborts naming the holding process. Escape hatches: CAAIL_E2E_PORT, CAAIL_E2E_ALLOW_EXISTING_SERVER.',
    tickets: ['tucca-cellag/caail-planning#207', 'tucca-cellag/caail-planning#199'],
  },
];

/** Entries whose condition a reader still has to expect to meet. */
export function openEntries(register: readonly UnreliableEntry[] = REGISTER): UnreliableEntry[] {
  return register.filter((entry) => entry.status === 'open');
}

/** What failed inside one vitest module, in the terms an entry is matched against. */
export interface VitestFailures {
  /** Its failed tests, by full name. */
  tests?: readonly (ObservedFailure & { name: string })[];
  /**
   * Its suites that failed with an error of their own, a hook's, by full name, each saying
   * whether a test inside it failed too. Not those that failed only because a test or a
   * suite inside them did. See `UnreliableEntry.suites`.
   */
  suites?: readonly (ObservedFailure & { name: string; holdsFailedTest?: boolean })[];
  /** The module's own errors, from a top-level hook, when it has any. */
  module?: ObservedFailure;
}

/**
 * Entries registered against a vitest module.
 *
 * `moduleId` is matched by suffix rather than equality so both vitest's
 * project-relative id and an absolute path resolve. The leading separator keeps
 * `db/emit.test.ts` from matching a hypothetical `parser/db/emit.test.ts`.
 */
export function entriesForVitestModule(
  moduleId: string,
  failures: VitestFailures = {},
  register: readonly UnreliableEntry[] = REGISTER,
): UnreliableEntry[] {
  const normalised = moduleId.replaceAll('\\', '/');
  return register.filter((entry) => {
    if (entry.suite !== 'vitest') return false;
    if (normalised !== entry.file && !normalised.endsWith(`/${entry.file}`)) return false;
    const fits = (failure: ObservedFailure) => shapeMatches(entry.failure, failure);
    // Only an entry that says so covers its whole module, and only when every failure in
    // it has the entry's shape: one assertion failing beside the timeouts is a failure the
    // entry does not explain. One with no names and no `wholeModule` matches nothing.
    if (entry.wholeModule) {
      const all = [...(failures.tests ?? []), ...(failures.suites ?? []), ...(failures.module ? [failures.module] : [])];
      return all.length > 0 && all.every(fits);
    }
    const named = (names: readonly string[] | undefined, failed: readonly (ObservedFailure & { name: string })[] = []) =>
      (names ?? []).some((name) => failed.some((f) => titleMatches(name, f.name) && fits(f)));
    // A suite whose hook timed out after a test inside it really failed would otherwise
    // label that failure too, since the report counts entries, not failures.
    const suitesAlone = (failures.suites ?? []).filter((suite) => !suite.holdsFailedTest);
    return named(entry.tests, failures.tests) || named(entry.suites, suitesAlone);
  });
}

/**
 * Whether `title`, as a test or suite reports it, is the one `named` names.
 *
 * Equal strings match. A `${…}` in `named` is a placeholder for one or more characters
 * other than whitespace, so a title generated in a loop is named once, as its source writes it
 * (`at ${width}px`), and matches every title the loop generates. Written that way it
 * appears verbatim in its file, which the integrity checks in `register.test.ts`
 * require; a title as it runs (`at 1600px`) is in no source to find. Everything outside
 * a placeholder matches literally, and the whole title has to match. A placeholder ends at
 * its first `}`, so one that can hold a `}` would split wrongly; `unsupportedPlaceholders`
 * names those, and the integrity checks refuse an entry that uses one.
 *
 * No whitespace, so that a different test in the same file sharing the template's prefix
 * and suffix, with words between them, is not labelled with this entry. The cost is a loop
 * whose value holds a space: its titles go unmatched, and a failure there prints as
 * unregistered, which a reader notices, where a mislabel would be believed.
 */
export function titleMatches(named: string, title: string): boolean {
  const literals = named.split(/\$\{[^}]*\}/);
  if (literals.length === 1) return named === title;
  const pattern = literals.map(escapeRegExp).join('\\S+');
  return new RegExp(`^${pattern}$`).test(title);
}

/**
 * The placeholders in `named` that `titleMatches` cannot split, as written, so the integrity
 * checks in `register.test.ts` can refuse them.
 *
 * `titleMatches` ends a placeholder at its first `}`. That is right for a variable, a property
 * or an index (`${width}`, `${viewport.width}`, `${sizes[0]}`), and wrong wherever a `}` can sit
 * inside the placeholder, which takes a brace, a string, template or regex literal, or a
 * comment: so a `{`, a quote, a backtick or a `/` in one. Such a placeholder splits in the
 * wrong place and the entry silently matches nothing, so it is refused rather than parsed. So
 * is a `${` with no closing `}`.
 */
export function unsupportedPlaceholders(named: string): string[] {
  const refused: string[] = [];
  const rest = named.replace(/\$\{([^}]*)\}/g, (placeholder: string, body: string) => {
    if (/[{'"`/]/.test(body)) refused.push(placeholder);
    return '';
  });
  if (rest.includes('${')) refused.push(rest.slice(rest.indexOf('${')));
  return refused;
}

/**
 * Entries registered against a Playwright test.
 *
 * Matched on **both** the spec file and the test title (`titleMatches`), and only when every
 * one of the test's failed attempts, in `failures`, has the entry's `failure` shape: with
 * retries, a timeout on one attempt does not account for an assertion failing on another, as a
 * whole-module vitest entry does not account for an assertion beside its timeouts.
 *
 * The title is required because `licenses.spec.ts` holds registered tests beside
 * unregistered ones, so a file-level match would label the unregistered ones as
 * known-unreliable on no evidence. The file is required because a title is not unique
 * across the suite: copying a spec to cover `/databases/` alongside `/software/` is the
 * obvious next change here, and a title-only match would then greet a genuine failure in
 * the new file with the old file's "already mitigated" entry. Both halves of that are the
 * mislabelling this register exists to prevent rather than cause.
 *
 * `file` is matched by suffix so Playwright's absolute `TestCase.location.file`
 * resolves against the `site/`-relative path an entry records.
 */
export function entriesForPlaywrightTest(
  file: string,
  title: string,
  failures: readonly ObservedFailure[],
  register: readonly UnreliableEntry[] = REGISTER,
): UnreliableEntry[] {
  const normalised = file.replaceAll('\\', '/');
  return register.filter(
    (entry) =>
      entry.suite === 'playwright' &&
      titleMatches(entry.unit, title) &&
      (normalised === entry.file || normalised.endsWith(`/${entry.file}`)) &&
      failures.length > 0 &&
      failures.every((failure) => shapeMatches(entry.failure, failure)),
  );
}

/**
 * Render one entry for a terminal.
 *
 * Deliberately leads with the condition rather than the id: the reader is looking at a
 * red run and needs to know what to do next, not what to cite.
 */
export function formatEntry(entry: UnreliableEntry): string {
  const lines = [
    `  ${entry.file} — ${entry.unit}`,
    `    shape:     ${entry.shape}${entry.status === 'open' ? '' : ` (${entry.status})`}`,
    `    condition: ${entry.condition}`,
  ];
  if (entry.misleadingTriage) lines.push(`    careful:   ${entry.misleadingTriage}`);
  if (entry.mitigation) lines.push(`    mitigation:${' '}${entry.mitigation}`);
  lines.push(`    evidence:  ${entry.evidence}`);
  lines.push(`    control:   ${entry.reproduce}`);
  lines.push(`    tickets:   ${entry.tickets.join(', ')}`);
  return lines.join('\n');
}

/**
 * The block printed after a red run, or `null` when no failure is registered.
 *
 * Returning `null` rather than an empty string matters: a run whose failures are all
 * unregistered should print nothing at all, so that seeing this header is itself the
 * signal. A header over an empty list would read as "checked, nothing to say" and get
 * skimmed past on the runs where it does have something to say.
 *
 * The header counts **entries, not failures**, and says so. One registered vitest file
 * can fail fifteen tests at once when its budget is blown, and "1 of the failures above
 * is on the register" would then invite the reader to treat the other fourteen as
 * unregistered regressions. They are the same file. Miscounting in that direction is
 * worse than not printing at all, since it manufactures exactly the "which of these is
 * real" doubt this register exists to remove.
 */
export function formatReport(entries: readonly UnreliableEntry[]): string | null {
  if (entries.length === 0) return null;
  const unique = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  const n = unique.length;
  return [
    '',
    `${n} known-unreliable ${n === 1 ? 'entry accounts' : 'entries account'} for failures above (tucca-cellag/caail-planning#207).`,
    'A single entry can account for many failing tests at once, so this is a count of',
    'entries rather than of failures.',
    '',
    'This is NOT permission to ignore them. It narrows where to look first: run the',
    'control below and see whether the failure survives it. If it does, it is real.',
    '',
    ...unique.map(formatEntry),
    '',
    'Register: site/scripts/test-reliability/register.ts',
    '',
  ].join('\n');
}
