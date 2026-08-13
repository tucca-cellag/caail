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
 * A list of names is worse than useless here, because the two shapes below want
 * opposite triage moves and the standard move is right for only one of them:
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
 *
 * A third shape, "order-dependent", was recorded on CAAIL-239 for
 * `licenses.spec.ts`'s license facet on the evidence that it failed 0/5 alone and
 * passed 30/30 in its file. **It does not exist.** The isolating run used
 * `--repeat-each=5` with no `--workers`, and Playwright starts one worker per repeat
 * group, so "run just this one test five times" silently became "launch five browsers
 * at once" while the file run used `--workers=1`. The variable was concurrency, not
 * order. Measured on the unfixed spec: `--workers=1 --repeat-each=5` passes 5/5,
 * `--workers=16 --repeat-each=16` fails 5/16.
 *
 * That mistake is the reason for this file's central rule: **a run that "isolates" a
 * test has to be checked for what else it changed.** An entry here records the
 * condition in terms of the variable that was actually held, or it teaches the next
 * reader a false rule, which is worse than teaching them nothing.
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

/** The condition class an entry misbehaves under. See the module docstring. */
export type Shape = 'load' | 'artifact';

export type Status =
  /** Still misbehaves. Expect to meet it. */
  | 'open'
  /** A fix landed. Kept so a recurrence is recognised rather than rediscovered. */
  | 'mitigated'
  /** A preflight check aborts the run naming the cause before any test runs. */
  | 'guarded';

export interface UnreliableEntry {
  /** Stable slug. Referenced from commit messages and tickets; do not reuse. */
  id: string;
  suite: 'vitest' | 'playwright';
  /** Path relative to `site/`. Must exist. */
  file: string;
  /** Human label for the failing unit, for display. */
  unit: string;
  /**
   * A string that must appear verbatim in `file`. This is the anti-rot oracle, not a
   * matcher: it exists so that renaming or deleting the registered test fails
   * `register.test.ts` rather than leaving a stale entry that reads as live.
   */
  anchor: string;
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
 * Playwright title matching is exact against `TestCase.title`; vitest matching is by
 * module path only. That asymmetry is deliberate: the vitest entries fail as whole
 * files whose failing *test* moves between runs (three consecutive full runs produced
 * three different sets), so naming one test would be precise about the wrong thing.
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
    file: 'scripts/parser/metrics.test.ts',
    unit: 'beforeAll of "buildMetricsModel — real corpus"',
    anchor: "describe('buildMetricsModel — real corpus'",
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
    tickets: ['CAAIL-239'],
  },
  {
    id: 'vitest-seed-topics-hook',
    suite: 'vitest',
    file: 'scripts/db/seed.test.ts',
    unit: 'top-level beforeAll (seeds the real corpus)',
    anchor: 'summary = seedTopics(db);',
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
    tickets: ['CAAIL-239'],
  },
  {
    id: 'vitest-db-dataset-entries',
    suite: 'vitest',
    file: 'scripts/db/dataset-entries.test.ts',
    unit: "beforeAll of 'seedDatasets (rows + entries share the ds: namespace)'",
    anchor: "describe('seedDatasets (rows + entries share the ds: namespace)'",
    shape: 'load',
    condition: 'Hook timeout under contention. Runs ~1.6s serial.',
    evidence: '2026-08-12: in one of three consecutive full runs, each of which failed a different set.',
    reproduce: 'pnpm --dir site test -- --no-file-parallelism',
    status: 'open',
    mitigation: 'Partly: the hook budget is now 30s (scripts/test-reliability/budgets.ts).',
    tickets: ['CAAIL-239'],
  },
  {
    id: 'vitest-db-mutate',
    suite: 'vitest',
    file: 'scripts/db/mutate.test.ts',
    unit: 'per-test timeout, most often the first addItem round-trip',
    anchor: 'assigns the next ref id, wires a matrix cell, round-trips reachable + lint-green',
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
    tickets: ['CAAIL-239'],
  },
  {
    id: 'vitest-db-emit',
    suite: 'vitest',
    file: 'scripts/db/emit.test.ts',
    unit: 'per-test timeout, most often the Papers.md round-trip',
    anchor: 're-parses to a JSON-identical model',
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
    tickets: ['CAAIL-239'],
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
      'failed 5/16. Fixed: 16/16 at --workers=16 under load average 26.9.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/licenses.spec.ts ' +
      '-g "narrows the grid" --repeat-each=16 --workers=16',
    status: 'mitigated',
    mitigation: 'awaitHydrated(page, \'CatalogBrowser\') before the facet click.',
    tickets: ['CAAIL-239'],
  },
  {
    id: 'pw-most-cited-facet',
    suite: 'playwright',
    file: 'e2e/citations.spec.ts',
    unit: 'the "Most cited" facet narrows Software to cited entries, most-cited first',
    anchor: 'the "Most cited" facet narrows Software to cited entries, most-cited first',
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
    tickets: ['CAAIL-239', 'GH#159'],
  },
  {
    id: 'pw-network-edge-click',
    suite: 'playwright',
    file: 'e2e/network-metrics.spec.ts',
    unit: 'edges are inert — clicking a connection selects nothing and clears the panel',
    anchor: "await page.waitForSelector('.ng-canvas canvas'",
    shape: 'load',
    condition:
      'Recorded in CAAIL-2 as a hydration-timing race on the graph. The specs now wait for the ' +
      'cytoscape canvas, and the hub specs wait for the filter bar, so the window is closed.',
    evidence:
      '2026-08-13: 45/45 under --repeat-each=3; did not reproduce. Note that Playwright ran ' +
      'that as 3 workers, one per repeat group, despite --workers=12: tests in one file are ' +
      'serial in one worker unless fullyParallel is set. So this is weaker evidence than the ' +
      '16-worker runs above, and it is a lower bound rather than a clean bill of health.',
    reproduce:
      'cd site && CAAIL_E2E_PORT=<free> pnpm exec playwright test e2e/network-metrics.spec.ts ' +
      '--repeat-each=3',
    status: 'mitigated',
    mitigation:
      "waitForSelector('.ng-canvas canvas') for the graph; retrying assertions on .hf-bar for the hub filters.",
    tickets: ['CAAIL-239', 'CAAIL-2'],
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
    tickets: ['CAAIL-239', 'CAAIL-231'],
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
    evidence: '2026-08-12: made a rebuild appear to pass and briefly inverted a conclusion during CAAIL-231.',
    reproduce: 'lsof -ti:<port>',
    status: 'guarded',
    mitigation: 'The preflight aborts naming the holding process. Escape hatches: CAAIL_E2E_PORT, CAAIL_E2E_ALLOW_EXISTING_SERVER.',
    tickets: ['CAAIL-239', 'CAAIL-231'],
  },
];

/** Entries whose condition a reader still has to expect to meet. */
export function openEntries(register: readonly UnreliableEntry[] = REGISTER): UnreliableEntry[] {
  return register.filter((entry) => entry.status === 'open');
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
  register: readonly UnreliableEntry[] = REGISTER,
): UnreliableEntry[] {
  const normalised = moduleId.replaceAll('\\', '/');
  return register.filter(
    (entry) =>
      entry.suite === 'vitest' &&
      (normalised === entry.file || normalised.endsWith(`/${entry.file}`)),
  );
}

/**
 * Entries registered against a Playwright test.
 *
 * Matched on **both** the spec file and the exact test title.
 *
 * The title is required because `licenses.spec.ts` holds ten tests and one of them is
 * registered, so a file-level match would label the other nine as known-unreliable on
 * no evidence. The file is required because a title is not unique across the suite:
 * copying a spec to cover `/databases/` alongside `/software/` is the obvious next
 * change here, and a title-only match would then greet a genuine failure in the new
 * file with the old file's "already mitigated" entry. Both halves of that are the
 * mislabelling this register exists to prevent rather than cause.
 *
 * `file` is matched by suffix so Playwright's absolute `TestCase.location.file`
 * resolves against the `site/`-relative path an entry records.
 */
export function entriesForPlaywrightTest(
  file: string,
  title: string,
  register: readonly UnreliableEntry[] = REGISTER,
): UnreliableEntry[] {
  const normalised = file.replaceAll('\\', '/');
  return register.filter(
    (entry) =>
      entry.suite === 'playwright' &&
      entry.unit === title &&
      (normalised === entry.file || normalised.endsWith(`/${entry.file}`)),
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
    `${n} known-unreliable ${n === 1 ? 'entry accounts' : 'entries account'} for failures above (CAAIL-239).`,
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
