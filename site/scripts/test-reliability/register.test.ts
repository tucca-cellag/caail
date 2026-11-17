/**
 * register.test.ts — the oracle that keeps the known-unreliable register honest.
 *
 * The register is a hand-written list of test names sitting beside the tests it names,
 * which is this repo's most expensive recurring bug shape: a fact typed next to the
 * system that already knows it, with nothing checking the two agree. The
 * `matrix-classification-audit` README asserted "Wave 3b 0/29" for three weeks after
 * the data file beside it said 29/29, was read as live, and cost a full session.
 *
 * A register that rots does specific harm rather than merely going stale. Its whole
 * job is to be believed instead of re-measured, so a stale entry sends someone to run
 * a control on a test that no longer exists, or leaves a real regression labelled as a
 * known artifact. So every entry must name a file that exists and an `anchor` that
 * still appears in it: renaming or deleting a registered test fails here, which forces
 * the entry to be updated or retired in the same change.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeRegExp } from '../../src/lib/escape-regexp.js';
import {
  REGISTER,
  openEntries,
  entriesForVitestModule,
  entriesForPlaywrightTest,
  formatEntry,
  formatReport,
  shapeMatches,
  receivedItems,
  shapeList,
  shapeStrings,
  titleMatches,
  notFound,
  unsupportedPlaceholders,
  type ObservedFailure,
  type UnreliableEntry,
} from './register.js';
import { errorText } from './playwright-reporter.js';

/** `site/`, two levels up from `site/scripts/test-reliability/`. */
const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * How many calls of one of `fns` in `source` are named exactly `name`, in any quote style and
 * with any modifier (`describe.skip(`, `it.concurrent(`).
 */
function namedCalls(source: string, fns: readonly string[], name: string): number {
  const literal = escapeRegExp(name);
  return ["'", '"', '`'].reduce(
    (total, quote) =>
      total +
      [...source.matchAll(new RegExp(`\\b(?:${fns.join('|')})(?:\\.\\w+)*\\(\\s*${quote}${literal}${quote}`, 'g'))].length,
    0,
  );
}

/** How many `describe` or `suite` calls in `source` are named exactly `name`. */
const describeCalls = (source: string, name: string) => namedCalls(source, ['describe', 'suite'], name);

/**
 * The levels of a vitest full name that are not a call of the right kind in `source`: each
 * enclosing level must be a `describe` or `suite` call, and the last a call of `last`.
 */
function missingLevels(source: string, fullName: string, last: readonly string[]): string[] {
  const levels = fullName.split(' > ');
  return levels.filter((level, index) =>
    index < levels.length - 1 ? describeCalls(source, level) === 0 : namedCalls(source, last, level) === 0,
  );
}

describe('register integrity', () => {
  it('has unique ids', () => {
    const ids = REGISTER.map((entry) => entry.id);
    expect(ids).toEqual([...new Set(ids)]);
  });

  it('every entry names a file that exists', () => {
    const missing = REGISTER.filter((entry) => !existsSync(join(SITE_ROOT, entry.file)));
    expect(missing.map((entry) => `${entry.id} -> ${entry.file}`)).toEqual([]);
  });

  it('every anchor still appears verbatim in its file', () => {
    // The failure this catches: a test is renamed, the entry keeps describing it by its
    // old name, and the next reader runs a control against something that is not there.
    const stale: string[] = [];
    for (const entry of REGISTER) {
      const path = join(SITE_ROOT, entry.file);
      if (!existsSync(path)) continue; // reported by the test above
      if (!readFileSync(path, 'utf-8').includes(entry.anchor)) {
        stale.push(`${entry.id}: ${entry.file} no longer contains ${JSON.stringify(entry.anchor)}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('every Playwright entry with a unit-as-title matches an actual test title', () => {
    // Playwright entries are matched by title (`titleMatches`) at report time, so a title
    // that drifts would silently stop matching and the register would quietly do nothing.
    // The title has to be a `test(` call's, not merely text in the file: a renamed test
    // whose old title survives in a comment or another title would pass a text search.
    // Checked only for entries whose file is a spec: the artifact entries point at the
    // preflight module and describe the suite rather than one named test.
    const drifted: string[] = [];
    for (const entry of REGISTER) {
      if (entry.suite !== 'playwright' || !entry.file.endsWith('.spec.ts')) continue;
      const source = readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      if (namedCalls(source, ['test'], entry.unit) === 0) {
        drifted.push(`${entry.id}: no test titled ${JSON.stringify(entry.unit)} in ${entry.file}`);
      }
    }
    expect(drifted).toEqual([]);
  });

  it('every title or name an entry matches on has only placeholders titleMatches can split', () => {
    // A placeholder that splits in the wrong place still appears verbatim in its file, so
    // the drift checks pass while the entry matches nothing at run time.
    const refused: string[] = [];
    for (const entry of REGISTER) {
      const names = [
        ...(entry.suite === 'playwright' && entry.file.endsWith('.spec.ts') ? [entry.unit] : []),
        ...(entry.tests ?? []),
        ...(entry.suites ?? []),
      ];
      for (const name of names) {
        for (const placeholder of unsupportedPlaceholders(name)) {
          refused.push(`${entry.id}: ${JSON.stringify(name)} holds ${JSON.stringify(placeholder)}`);
        }
      }
    }
    expect(refused).toEqual([]);
  });

  it('every level of every named vitest test is a call in its file', () => {
    // The vitest analogue of the Playwright title check above. Without it, renaming a
    // test that an entry narrows to leaves the entry silently matching nothing: the
    // register keeps listing it, the reporter never fires, and the failure it was
    // written for reads as unregistered. It proves each level exists, not that the levels
    // still nest (see `UnreliableEntry.tests`).
    const wrong: string[] = [];
    for (const entry of REGISTER) {
      if (entry.suite !== 'vitest' || !entry.tests) continue;
      const source = readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      for (const fullName of entry.tests) {
        for (const level of missingLevels(source, fullName, ['it', 'test'])) {
          wrong.push(`${entry.id}: no call named ${JSON.stringify(level)} in ${entry.file}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every level of every named vitest suite is a describe call in its file', () => {
    // A suite name can appear elsewhere in its module, as `buildLlmsFullText` does in
    // the import of the function it tests, so finding the text proves nothing: renaming
    // the describe would leave the entry matching nothing with this check green. The
    // reporter matches a suite by its full name, so a same-named suite under another
    // parent is not this one, and the check asks only that each level still exists: not
    // that the levels still nest (see `UnreliableEntry.suites`).
    const wrong: string[] = [];
    for (const entry of REGISTER) {
      if (entry.suite !== 'vitest' || !entry.suites) continue;
      const source = readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      for (const fullName of entry.suites) {
        for (const level of missingLevels(source, fullName, ['describe', 'suite'])) {
          wrong.push(`${entry.id}: no describe call named ${JSON.stringify(level)} in ${entry.file}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('every entry a reporter can match states the shape of failure it covers', () => {
    // Without one an entry matches nothing, so a missing shape would quietly switch it off.
    const shapeless = REGISTER.filter(
      (entry) => (entry.suite === 'vitest' || entry.file.endsWith('.spec.ts')) && entry.failure === undefined,
    );
    expect(shapeless.map((entry) => entry.id)).toEqual([]);
  });

  it("every string a failure shape names is in the entry's file, or a residue entry's control", () => {
    // A string that no longer appears where the failure comes from is an assertion that was
    // reworded, or a selector that was changed, and the entry has stopped matching it.
    const stale: string[] = [];
    for (const entry of REGISTER) {
      const where = entry.shape === 'residue' ? entry.reproduce : readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      for (const text of shapeStrings(entry.failure)) {
        if (!where.includes(text)) stale.push(`${entry.id}: ${JSON.stringify(text)} not in its ${entry.shape === 'residue' ? 'reproduce' : 'file'}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('every vitest entry narrows to named tests or suites, or says it covers its whole module', () => {
    // Without this, an entry that lost its `tests` or `suites` would stop matching at all
    // (the matcher fails closed) and nothing would say so; and one given both would be
    // claiming two scopes at once. Playwright entries match by title and take neither.
    const wrong: string[] = [];
    for (const entry of REGISTER) {
      const narrowed = Boolean(entry.tests?.length || entry.suites?.length);
      if (entry.suite === 'playwright') {
        if (narrowed || entry.wholeModule) wrong.push(`${entry.id}: a Playwright entry sets tests, suites or wholeModule`);
      } else if (narrowed === Boolean(entry.wholeModule)) {
        wrong.push(`${entry.id}: ${narrowed ? 'narrows and says wholeModule' : 'neither narrows nor says wholeModule'}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a vitest entry whose module holds unregistered tests narrows to named tests', () => {
    // community.test.ts holds three tests and only one is residue-prone; one of the
    // other two is the guard against a real Slack-invite paste. An entry there given
    // `wholeModule` instead of `tests` would label a genuine leak as a known artifact.
    const community = REGISTER.find((entry) => entry.file === 'src/lib/community.test.ts');
    expect(community?.tests, 'the community entry must narrow to its one residue-prone test').toBeTruthy();
  });

  it('every entry carries a control command and at least one ticket', () => {
    for (const entry of REGISTER) {
      expect(entry.reproduce.length, `${entry.id} has no control command`).toBeGreaterThan(0);
      expect(entry.tickets.length, `${entry.id} cites no ticket`).toBeGreaterThan(0);
    }
  });

  it('a mitigated or guarded entry says what was done', () => {
    for (const entry of REGISTER) {
      if (entry.status === 'open') continue;
      expect(entry.mitigation, `${entry.id} is ${entry.status} but records no mitigation`).toBeTruthy();
    }
  });

  it('artifact entries are guarded, because a preflight is the only thing that catches them', () => {
    // An artifact-shape entry left open would be a promise this repo does not keep: the
    // failure is deterministic within one build, so no amount of re-running surfaces it.
    // Deliberately not extended to `residue`: that shape has a live unguarded instance
    // (tucca-cellag/caail-planning#183), and asserting otherwise would force either a fake status or a guard
    // nobody has written.
    for (const entry of REGISTER.filter((e) => e.shape === 'artifact')) {
      expect(entry.status, `${entry.id} is artifact-shaped but not guarded`).toBe('guarded');
    }
  });

  it('every entry whose triage is misleading says so, for the shapes where it always is', () => {
    // `artifact` and `residue` both survive a re-run, so the obvious move returns a
    // confident wrong answer every time rather than sometimes. An entry of either shape
    // without that warning is the register withholding the half that matters.
    for (const entry of REGISTER.filter((e) => e.shape === 'artifact' || e.shape === 'residue')) {
      expect(
        entry.misleadingTriage,
        `${entry.id} is ${entry.shape}-shaped but does not say how triage misleads`,
      ).toBeTruthy();
    }
  });
});

describe('describeCalls', () => {
  it('finds each level of a full name as a call of the right kind', () => {
    const source = "describe('outer', () => {\n  it('a test', () => {});\n});";
    expect(missingLevels(source, 'outer > a test', ['it', 'test'])).toEqual([]);
    expect(missingLevels(source, 'outer > a renamed test', ['it', 'test'])).toEqual(['a renamed test']);
    expect(missingLevels(source, 'renamed > a test', ['it', 'test'])).toEqual(['renamed']);
    // The test's own name has to be a test, and an enclosing one a suite.
    expect(missingLevels(source, 'outer > outer', ['it', 'test'])).toEqual(['outer']);
    expect(missingLevels(source, 'a test > a test', ['it', 'test'])).toEqual(['a test']);
  });

  it('finds a Playwright test by its exact title, templated or not', () => {
    const spec = "test('a plain title', async () => {});\n  test(`fits at ${width}px`, async () => {});";
    expect(namedCalls(spec, ['test'], 'a plain title')).toBe(1);
    expect(namedCalls(spec, ['test'], 'fits at ${width}px')).toBe(1);
    // A title that is only part of another, or only in prose, is not a test of that title.
    expect(namedCalls(spec, ['test'], 'a plain')).toBe(0);
    expect(namedCalls('// the old title was a plain title', ['test'], 'a plain title')).toBe(0);
  });

  it('counts a suite() call too', () => {
    expect(describeCalls("suite('a suite', () => {", 'a suite')).toBe(1);
    expect(describeCalls("testsuite('a suite', () => {", 'a suite')).toBe(0);
  });

  it('counts a describe of that name in each quote style, with or without a modifier', () => {
    expect(describeCalls("describe('a suite', () => {", 'a suite')).toBe(1);
    expect(describeCalls('describe("a suite", () => {', 'a suite')).toBe(1);
    expect(describeCalls('describe(`a suite`, () => {', 'a suite')).toBe(1);
    expect(describeCalls("describe.skip(\n  'a suite',\n  () => {", 'a suite')).toBe(1);
    expect(describeCalls("describe('a suite', () => {});\ndescribe('x', () => { describe('a suite', () => {}); });", 'a suite')).toBe(2);
  });

  it('does not count the name anywhere but a describe call', () => {
    expect(describeCalls("import { a suite } from './x';\nit('a suite', () => {});", 'a suite')).toBe(0);
    expect(describeCalls("describe('a suite, renamed', () => {", 'a suite')).toBe(0);
    expect(describeCalls("describe('not a suite', () => {", 'a suite')).toBe(0);
    expect(describeCalls("subdescribe('a suite', () => {", 'a suite')).toBe(0);
  });
});

/** A failure a reporter could report: a timeout, or an assertion with this text. */
const TIMED_OUT: ObservedFailure = { timedOut: true, texts: ['Test timed out in 20000ms.'] };
const asserted = (text: string): ObservedFailure => ({ timedOut: false, texts: [text] });

describe('shapeMatches', () => {
  it('matches a timeout only to a failure that timed out', () => {
    expect(shapeMatches('timeout', TIMED_OUT)).toBe(true);
    expect(shapeMatches('timeout', asserted('expected 1 to be 2'))).toBe(false);
  });

  it('matches a text shape only to a failure whose text holds one of its strings', () => {
    expect(shapeMatches({ text: ['total layout shift'] }, asserted('the total layout shift, summed'))).toBe(true);
    expect(shapeMatches({ text: ['a', 'total layout shift'] }, asserted('the total layout shift'))).toBe(true);
    expect(shapeMatches({ text: ['total layout shift'] }, asserted('layout shifts whose source is the band'))).toBe(false);
    expect(shapeMatches({ text: ['total layout shift'] }, TIMED_OUT)).toBe(false);
  });

  it('matches nothing without a shape', () => {
    expect(shapeMatches(undefined, TIMED_OUT)).toBe(false);
    expect(shapeMatches(undefined, asserted('anything'))).toBe(false);
  });
});

describe('notFound', () => {
  // Messages as Playwright 1.64 writes them, colour and snippet already removed.
  const MISSING = "Error: expect(locator).toBeVisible() failed\n\nLocator: locator('.th-lead-full')\nExpected: visible\nTimeout: 5000ms\nError: element(s) not found";
  const CHAINED = MISSING.replace("locator('.th-lead-full')", "locator('.th-lead-full').locator('a')");
  const WRONG_TEXT = "Error: expect(locator).toHaveText(expected) failed\n\nLocator:  locator('#caail-h-review')\nExpected: \"Step 2 of 2: Your report\"\nReceived: \"Step 2 of 3: Your report\"\nTimeout:  5000ms";
  const WRONG_STATE = "Error: expect(locator).toBeVisible() failed\n\nLocator: locator('.th-lead-full')\nExpected: visible\nReceived: hidden\nTimeout: 5000ms";

  it('reads the locator an expect gave up on because nothing matched it', () => {
    expect(notFound(MISSING)).toEqual(["locator('.th-lead-full')"]);
    expect(notFound(CHAINED)).toEqual(["locator('.th-lead-full').locator('a')"]);
  });

  it('reads nothing from a matched element with the wrong text or state, or from other failures', () => {
    // Every web-first assertion retries to its timeout, so a regression carries Timeout: too.
    expect(notFound(WRONG_TEXT)).toEqual([]);
    expect(notFound(WRONG_STATE)).toEqual([]);
    expect(notFound('Error: expect(received).toEqual(expected) // deep equality\n\n- Array []\n+ Array [ "a violation" ]')).toEqual([]);
    expect(notFound('Test timeout of 30000ms exceeded.')).toEqual([]);
    expect(notFound("TimeoutError: page.waitForSelector: Timeout 20000ms exceeded.\nCall log:\n  - waiting for locator('.ng-canvas canvas') to be visible")).toEqual([]);
  });

  it('matches a missing shape on its exact locator only', () => {
    const lead = { missing: ["locator('.th-lead-full')"] } as const;
    expect(shapeMatches(lead, asserted(MISSING))).toBe(true);
    // The test's second wait, on the link inside the lead, is a different locator.
    expect(shapeMatches(lead, asserted(CHAINED))).toBe(false);
    expect(shapeMatches(lead, asserted(WRONG_STATE))).toBe(false);
    expect(shapeMatches(lead, TIMED_OUT)).toBe(false);
  });

  it('labels any shape in a list', () => {
    const both = ['timeout', { missing: ["locator('.th-lead-full')"] }] as const;
    expect(shapeMatches(both, TIMED_OUT)).toBe(true);
    expect(shapeMatches(both, asserted(MISSING))).toBe(true);
    expect(shapeMatches(both, asserted(WRONG_STATE))).toBe(false);
  });

  it('lists one shape, several, or none', () => {
    expect(shapeList('timeout')).toEqual(['timeout']);
    expect(shapeList({ text: ['x'] })).toEqual([{ text: ['x'] }]);
    expect(shapeList(['timeout', { text: ['x'] }])).toEqual(['timeout', { text: ['x'] }]);
    expect(shapeList(undefined)).toEqual([]);
  });

  it('names the whole locator of a missing shape for the integrity check', () => {
    expect(shapeStrings({ missing: ["locator('.th-lead-full')", "locator('#a').locator('b')"] })).toEqual([
      "locator('.th-lead-full')",
      "locator('#a').locator('b')",
    ]);
    expect(shapeStrings(['timeout', { text: ['total layout shift'] }])).toEqual(['total layout shift']);
    expect(shapeStrings('timeout')).toEqual([]);
  });
});

describe('receivedItems', () => {
  it("reads the received side of a vitest diff, and nothing from the expected side", () => {
    const diff = '- Expected\n+ Received\n\n- []\n+ [\n+   "test-results/a/error-context.md",\n+   "src/b.astro",\n+ ]';
    expect(receivedItems(diff)).toEqual(['test-results/a/error-context.md', 'src/b.astro']);
    expect(receivedItems('- [\n-   "expected only",\n- ]')).toEqual([]);
    expect(receivedItems('expected 1 to be 2')).toEqual([]);
  });
});

describe('entriesForVitestModule', () => {
  const metricsHook = { suites: [{ name: 'buildMetricsModel — real corpus', ...TIMED_OUT }] };

  it('matches a project-relative module id', () => {
    const hits = entriesForVitestModule('scripts/parser/metrics.test.ts', metricsHook);
    expect(hits.map((entry) => entry.id)).toEqual(['vitest-metrics-corpus-hook']);
  });

  it('matches a whole-module entry when no failed test name is known', () => {
    // A hook timeout produces no failed TestCase, which is exactly how the five
    // slow-fixture entries fail. They must still match, on the hook's own error.
    expect(entriesForVitestModule('scripts/parser/metrics.test.ts', { module: TIMED_OUT }).map((e) => e.id)).toEqual([
      'vitest-metrics-corpus-hook',
    ]);
  });

  it('matches a whole-module entry only when every failure in the module has its shape', () => {
    // emit.test.ts exists to catch a round-trip that no longer matches, which fails as an
    // assertion. That failing beside a timeout is a failure the entry does not explain.
    const file = 'scripts/db/emit.test.ts';
    expect(entriesForVitestModule(file, { tests: [{ name: 'a', ...TIMED_OUT }, { name: 'b', ...TIMED_OUT }] }).map((e) => e.id)).toEqual([
      'vitest-db-emit',
    ]);
    expect(entriesForVitestModule(file, { tests: [{ name: 'a', ...TIMED_OUT }, { name: 'b', ...asserted('not equal') }] })).toEqual([]);
    expect(entriesForVitestModule(file, { tests: [{ name: 'b', ...asserted('not equal') }] })).toEqual([]);
    expect(entriesForVitestModule(file, {})).toEqual([]);
  });

  it('a narrowed entry matches only when one of its named tests failed in its shape', () => {
    const file = 'src/lib/community.test.ts';
    const registered = 'the community Slack invite is confined to two places > appears nowhere under site/ except this module and its test';
    const listed = (...paths: string[]) => asserted(['- []', '+ [', ...paths.map((path) => `+   "${path}",`), '+ ]'].join('\n'));
    const leftover = listed('test-results/homepage-agent-x/error-context.md', 'playwright-report/index.html');
    expect(entriesForVitestModule(file, { tests: [{ name: registered, ...leftover }] }).map((e) => e.id)).toEqual([
      'vitest-community-invite-walk',
    ]);
    // A real Slack-invite paste fails the SAME test, and names a file no run left behind,
    // whether or not a leftover is listed beside it.
    expect(entriesForVitestModule(file, { tests: [{ name: registered, ...listed('src/components/Hero.astro') }] })).toEqual([]);
    expect(
      entriesForVitestModule(file, {
        tests: [{ name: registered, ...listed('test-results/homepage-agent-x/error-context.md', 'src/components/Hero.astro') }],
      }),
    ).toEqual([]);
    // A directory whose name merely starts the same is not the leftover directory.
    expect(entriesForVitestModule(file, { tests: [{ name: registered, ...listed('test-results-archive/x.md') }] })).toEqual([]);
    // Nor do the module's other tests failing on their own match.
    expect(
      entriesForVitestModule(file, {
        tests: [{ name: 'exposes a base-relative community path, not a baked-in /caail prefix', ...leftover }],
      }),
    ).toEqual([]);
    expect(entriesForVitestModule(file, {})).toEqual([]);
    // A suite of the same name failing its own hook is not one of the named tests.
    expect(entriesForVitestModule(file, { suites: [{ name: registered, ...leftover }] })).toEqual([]);
  });

  it('a timeout entry does not match its test failing an assertion', () => {
    const file = 'scripts/parser/agent-api.test.ts';
    const registered = 'site-relative hrefs in the API > ships no relative Markdown link target in any emitted endpoint';
    // The bare name is a test of that name anywhere in the module, not this one.
    expect(
      entriesForVitestModule(file, { tests: [{ name: 'ships no relative Markdown link target in any emitted endpoint', ...TIMED_OUT }] }),
    ).toEqual([]);
    expect(entriesForVitestModule(file, { tests: [{ name: registered, ...TIMED_OUT }] }).map((e) => e.id)).toEqual([
      'vitest-agent-api-link-scan',
    ]);
    // An endpoint really shipping a relative link fails the same test as an assertion.
    expect(entriesForVitestModule(file, { tests: [{ name: registered, ...asserted('datasets.json: expected [ "../Papers.md" ]') }] })).toEqual([]);
  });

  it('a suite-narrowed entry matches only that suite, in its shape', () => {
    const hooked: UnreliableEntry = {
      ...REGISTER[0],
      id: 'suite-narrowed',
      file: 'scripts/parser/fixture.test.ts',
      wholeModule: undefined,
      tests: undefined,
      suites: ['the suite with a hook'],
      failure: 'timeout',
    };
    const match = (failures: Parameters<typeof entriesForVitestModule>[1]) =>
      entriesForVitestModule(hooked.file, failures, [hooked]).map((e) => e.id);
    expect(match({ suites: [{ name: 'the suite with a hook', ...TIMED_OUT }] })).toEqual(['suite-narrowed']);
    // Its hook threw: a defect the hook found, not load.
    expect(match({ suites: [{ name: 'the suite with a hook', ...asserted('Error: a link it cannot make absolute') }] })).toEqual([]);
    expect(match({ tests: [{ name: 'a test inside the suite with a hook', ...TIMED_OUT }] })).toEqual([]);
    expect(match({ suites: [{ name: 'another suite', ...TIMED_OUT }] })).toEqual([]);
    // Its hook timed out, after a test inside it had failed: the timeout is not that failure.
    expect(match({ suites: [{ name: 'the suite with a hook', holdsFailedTest: true, ...TIMED_OUT }] })).toEqual([]);
    expect(match({})).toEqual([]);
  });

  it('a test-narrowed entry may name a templated test', () => {
    const looped: UnreliableEntry = {
      ...REGISTER[0],
      id: 'looped',
      file: 'scripts/parser/fixture.test.ts',
      wholeModule: undefined,
      tests: ['parses ${name}'],
      failure: 'timeout',
    };
    const match = (names: string[]) =>
      entriesForVitestModule(looped.file, { tests: names.map((name) => ({ name, ...TIMED_OUT })) }, [looped]).map((e) => e.id);
    expect(match(['parses Papers.md'])).toEqual(['looped']);
    expect(match(['emits Papers.md'])).toEqual([]);
  });

  it('matches an absolute path ending in the registered file', () => {
    const hits = entriesForVitestModule('/checkout/site/scripts/db/emit.test.ts', { module: TIMED_OUT });
    expect(hits.map((entry) => entry.id)).toEqual(['vitest-db-emit']);
  });

  it('normalises Windows separators', () => {
    const hits = entriesForVitestModule('C:\\checkout\\site\\scripts\\db\\emit.test.ts', { module: TIMED_OUT });
    expect(hits.map((entry) => entry.id)).toEqual(['vitest-db-emit']);
  });

  it('does not match a path that merely ends in the same basename', () => {
    // `endsWith('scripts/db/emit.test.ts')` without the leading separator would match
    // `other/scripts/db/emit.test.ts`; requiring the separator keeps a same-named file
    // in a different tree from inheriting an entry that was never about it.
    expect(entriesForVitestModule('somewhere/notscripts/db/emit.test.ts', { module: TIMED_OUT })).toEqual([]);
  });

  it('matches nothing for an entry that neither narrows nor says wholeModule, or states no shape', () => {
    const unscoped: UnreliableEntry = { ...REGISTER[0], id: 'unscoped', wholeModule: undefined, tests: undefined };
    const failures = { tests: [{ name: 'any test', ...TIMED_OUT }], suites: [{ name: 'any suite', ...TIMED_OUT }], module: TIMED_OUT };
    expect(entriesForVitestModule(unscoped.file, failures, [unscoped])).toEqual([]);
    const shapeless: UnreliableEntry = { ...REGISTER[0], id: 'shapeless', failure: undefined };
    expect(entriesForVitestModule(shapeless.file, failures, [shapeless])).toEqual([]);
  });

  it('returns nothing for an unregistered module', () => {
    expect(entriesForVitestModule('scripts/parser/apa.test.ts', { module: TIMED_OUT })).toEqual([]);
  });

  it('does not match a Playwright entry', () => {
    expect(entriesForVitestModule('e2e/licenses.spec.ts', { tests: [{ name: 'the catalog license facet narrows the grid to a tier', ...TIMED_OUT }] })).toEqual([]);
  });
});

describe('titleMatches', () => {
  const TEMPLATE = 'expanded labels stay clear of the content column at ${width}px';

  it('matches an equal title, and only an equal one, when the name has no placeholder', () => {
    expect(titleMatches('a test', 'a test')).toBe(true);
    expect(titleMatches('a test', 'a test, again')).toBe(false);
    expect(titleMatches('a test', 'A test')).toBe(false);
  });

  it('matches every title a templated name generates', () => {
    expect(titleMatches(TEMPLATE, 'expanded labels stay clear of the content column at 1600px')).toBe(true);
    expect(titleMatches(TEMPLATE, 'expanded labels stay clear of the content column at 2560px')).toBe(true);
  });

  it('does not match a title that differs outside the placeholder, or leaves it empty', () => {
    expect(titleMatches(TEMPLATE, 'expanded labels stay clear of the content column at px')).toBe(false);
    expect(titleMatches(TEMPLATE, 'expanded labels stay clear of the content column at 1600px wide')).toBe(false);
    expect(titleMatches(TEMPLATE, 'collapsed labels stay clear of the content column at 1600px')).toBe(false);
    // Nor one missing the text after the placeholder.
    expect(titleMatches(TEMPLATE, 'expanded labels stay clear of the content column at 1600')).toBe(false);
  });

  it('does not let a placeholder stand for words, so a different test sharing the ends is not matched', () => {
    expect(titleMatches(TEMPLATE, 'expanded labels stay clear of the content column at 1600 and 1920px')).toBe(false);
    expect(titleMatches('fits at ${width}px', 'fits at 1600px when the rail is open and every label at 1920px')).toBe(false);
    expect(titleMatches('fits at ${width}px', 'fits at 1600px')).toBe(true);
  });

  it('reads the text outside a placeholder literally', () => {
    expect(titleMatches('at ${n} (of ${total}) items', 'at 3 (of 9) items')).toBe(true);
    expect(titleMatches('at ${n} (of ${total}) items', 'at 3 of 9 items')).toBe(false);
    expect(titleMatches('a.b ${x}', 'axb 1')).toBe(false);
  });
});

describe('unsupportedPlaceholders', () => {
  it('accepts a name with no placeholder, or with a variable, a property or an index', () => {
    expect(unsupportedPlaceholders('a plain title')).toEqual([]);
    expect(unsupportedPlaceholders('at ${width}px')).toEqual([]);
    expect(unsupportedPlaceholders('at ${viewport.width}px, ${sizes[0]} first')).toEqual([]);
  });

  it('refuses a placeholder that can hold a }, and an unclosed one', () => {
    expect(unsupportedPlaceholders('at ${fn({ a })}px')).toEqual(['${fn({ a }']);
    expect(unsupportedPlaceholders("at ${'}'}px")).toEqual(["${'}"]);
    expect(unsupportedPlaceholders('at ${"x"}px')).toEqual(['${"x"}']);
    expect(unsupportedPlaceholders('at ${`x`}px')).toEqual(['${`x`}']);
    expect(unsupportedPlaceholders('at ${/}/.source}px')).toEqual(['${/}']);
    expect(unsupportedPlaceholders('at ${width px')).toEqual(['${width px']);
  });
});

describe('entriesForPlaywrightTest', () => {
  const LICENSES = '/checkout/site/e2e/licenses.spec.ts';
  const FACET = 'the catalog license facet narrows the grid to a tier';
  const FACET_FAILED = [asserted('expect(received).toBeLessThan(expected)')];

  it('matches on file plus test title', () => {
    expect(entriesForPlaywrightTest(LICENSES, FACET, FACET_FAILED).map((entry) => entry.id)).toEqual(['pw-license-facet']);
  });

  it('does not match an unregistered test in the same registered file', () => {
    expect(entriesForPlaywrightTest(LICENSES, 'the /licenses/ hub lists the 4 tiers', [TIMED_OUT])).toEqual([]);
  });

  it('does not match the registered title in a DIFFERENT spec file', () => {
    // Copying licenses.spec.ts to cover /databases/ is the obvious next change here.
    // A title-only match would greet a genuine failure in the copy with this entry's
    // "already mitigated" verdict, which is the mislabelling the register prevents.
    expect(entriesForPlaywrightTest('/checkout/site/e2e/databases-licenses.spec.ts', FACET, FACET_FAILED)).toEqual([]);
  });

  it('accepts a site-relative path as well as an absolute one', () => {
    expect(entriesForPlaywrightTest('e2e/licenses.spec.ts', FACET, FACET_FAILED).map((entry) => entry.id)).toEqual([
      'pw-license-facet',
    ]);
  });

  it('matches a timeout entry on its test timeout, not on an expect giving up', () => {
    // The report flow back at three steps fails the same expect, with Timeout: on it.
    const file = '/checkout/site/e2e/report.spec.ts';
    const TWO_STEPS = 'a reason with nothing to ask takes two steps, not three';
    const atThree = asserted(
      "Error: expect(locator).toHaveText(expected) failed\n\nLocator:  locator('#caail-h-review')\nExpected: \"Step 2 of 2: Your report\"\nReceived: \"Step 2 of 3: Your report\"\nTimeout:  5000ms",
    );
    expect(entriesForPlaywrightTest(file, TWO_STEPS, [TIMED_OUT]).map((e) => e.id)).toEqual(['pw-report-two-steps']);
    expect(entriesForPlaywrightTest(file, TWO_STEPS, [atThree])).toEqual([]);
  });

  it('matches the lead entry when the lead is not found, not when it renders wrongly', () => {
    const file = '/checkout/site/e2e/topics.spec.ts';
    const LEAD = 'a theme view with a named lead has no axe violations';
    const missing = asserted("Error: expect(locator).toBeVisible() failed\n\nLocator: locator('.th-lead-full')\nExpected: visible\nTimeout: 5000ms\nError: element(s) not found");
    expect(entriesForPlaywrightTest(file, LEAD, [missing]).map((e) => e.id)).toEqual(['pw-topics-lead-axe']);
    expect(entriesForPlaywrightTest(file, LEAD, [asserted("Locator: locator('.th-lead-full')\nReceived: hidden\nTimeout: 5000ms")])).toEqual([]);
  });

  it('matches a timeout entry only when the test timed out, not when it failed an assertion', () => {
    const AXE = 'the license badges introduce no axe violations on /software/';
    expect(entriesForPlaywrightTest(LICENSES, AXE, [TIMED_OUT]).map((entry) => entry.id)).toEqual(['pw-license-badges-axe']);
    // A real axe violation fails the same test, as an assertion.
    expect(entriesForPlaywrightTest(LICENSES, AXE, [asserted('expect(received).toEqual(expected)')])).toEqual([]);
    expect(entriesForPlaywrightTest(LICENSES, AXE, [])).toEqual([]);
  });

  it('matches a measured-value entry only on its own assertion', () => {
    const file = '/checkout/site/e2e/hero-stripe.spec.ts';
    const CLS = 'on a slowed phone the hero band records no layout shift and the page stays under good CLS';
    const sum = asserted("Error: the page's total layout shift, every entry summed\n\nexpect(received).toBeLessThan(expected)");
    expect(entriesForPlaywrightTest(file, CLS, [sum]).map((entry) => entry.id)).toEqual(['pw-hero-stripe-cls']);
    // The band's own shifts, which the same test asserts first, are the defect it guards.
    expect(entriesForPlaywrightTest(file, CLS, [asserted('Error: layout shifts whose source is the hero band')])).toEqual([]);
    expect(entriesForPlaywrightTest(file, CLS, [TIMED_OUT])).toEqual([]);
  });

  it('matches only when every failed attempt has the shape', () => {
    // With retries, a timeout on one attempt does not account for a real assertion on another.
    const AXE = 'the license badges introduce no axe violations on /software/';
    expect(entriesForPlaywrightTest(LICENSES, AXE, [TIMED_OUT, TIMED_OUT]).map((e) => e.id)).toEqual(['pw-license-badges-axe']);
    expect(entriesForPlaywrightTest(LICENSES, AXE, [TIMED_OUT, asserted('expect(received).toEqual(expected)')])).toEqual([]);
    expect(entriesForPlaywrightTest(LICENSES, AXE, [asserted('expect(received).toEqual(expected)'), TIMED_OUT])).toEqual([]);
  });

  it('matches a templated title in its own file, at every value the loop generates', () => {
    const looped: UnreliableEntry = {
      ...REGISTER[0],
      id: 'looped',
      suite: 'playwright',
      file: 'e2e/looped.spec.ts',
      unit: 'fits at ${width}px',
      wholeModule: undefined,
      failure: 'timeout',
    };
    const match = (file: string, title: string) => entriesForPlaywrightTest(file, title, [TIMED_OUT], [looped]).map((e) => e.id);
    expect(match('/checkout/site/e2e/looped.spec.ts', 'fits at 1600px')).toEqual(['looped']);
    expect(match('/checkout/site/e2e/looped.spec.ts', 'fits at 1920px')).toEqual(['looped']);
    expect(match('/checkout/site/e2e/looped.spec.ts', 'fits at 1600px, twice')).toEqual([]);
    expect(match('/checkout/site/e2e/other.spec.ts', 'fits at 1600px')).toEqual([]);
  });
});

describe('errorText', () => {
  it('drops colour codes and the source snippet a Playwright message quotes', () => {
    const message =
      "Error: \u001b[2mexpect(\u001b[22mlocator).toBeVisible() failed\n\nLocator: locator('.th-lead-full')\n" +
      "Expected: visible\n\n  45 |   await page.goto('./topics/');\n> 47 |   await expect(lead).toBeVisible();";
    expect(errorText(message)).toBe("Error: expect(locator).toBeVisible() failed\n\nLocator: locator('.th-lead-full')\nExpected: visible");
  });

  it('drops a terminal hyperlink, so a locator inside one reads whole', () => {
    const linked = "Locator: \u001b]8;;file:///x.ts\u0007locator('.th-lead-full')\u001b]8;;\u0007\nTimeout: 5000ms";
    expect(errorText(linked)).toBe("Locator: locator('.th-lead-full')\nTimeout: 5000ms");
    expect(errorText(linked)).toContain("locator('.th-lead-full')\n");
  });

  it('leaves a message with no snippet whole', () => {
    expect(errorText('Test timeout of 30000ms exceeded.')).toBe('Test timeout of 30000ms exceeded.');
  });
});

describe('formatReport', () => {
  const entry = (over: Partial<UnreliableEntry> = {}): UnreliableEntry => ({
    id: 'x',
    suite: 'vitest',
    file: 'scripts/parser/metrics.test.ts',
    unit: 'a hook',
    anchor: 'anchor',
    shape: 'load',
    condition: 'fails under load',
    evidence: 'measured',
    reproduce: 'run the control',
    status: 'open',
    tickets: ['tucca-cellag/caail-planning#207'],
    ...over,
  });

  it('returns null when nothing matched, so the header is itself the signal', () => {
    expect(formatReport([])).toBeNull();
  });

  it('never tells the reader the failure can be ignored', () => {
    const report = formatReport([entry()])!;
    expect(report).toContain('NOT permission to ignore');
    expect(report).toContain('run the control');
  });

  it('de-duplicates by id so a file failing twice is reported once', () => {
    const report = formatReport([entry(), entry()])!;
    expect(report).toContain('1 known-unreliable entry accounts');
    expect(report.match(/fails under load/g)).toHaveLength(1);
  });

  it('agrees in number and verb', () => {
    expect(formatReport([entry()])!).toContain('1 known-unreliable entry accounts');
    expect(formatReport([entry(), entry({ id: 'y' })])!).toContain(
      '2 known-unreliable entries account',
    );
  });

  it('counts entries rather than failures, and says which it is counting', () => {
    // One registered vitest file can fail fifteen tests when its budget is blown.
    // "1 of the failures above" would then invite the reader to treat the other
    // fourteen as unregistered regressions when they are the same file.
    const report = formatReport([entry()])!;
    expect(report).not.toContain('of the failures above');
    expect(report).toContain('count of\nentries rather than of failures');
  });
});

describe('formatEntry', () => {
  it('leads with the file and unit, then the condition', () => {
    const lines = formatEntry(REGISTER[0]).split('\n');
    expect(lines[0]).toContain(REGISTER[0].file);
    expect(lines[2]).toContain('condition:');
  });

  it('omits the optional lines when the entry has none', () => {
    const bare = formatEntry({
      id: 'x',
      suite: 'vitest',
      file: 'f.ts',
      unit: 'u',
      anchor: 'a',
      shape: 'load',
      condition: 'c',
      evidence: 'e',
      reproduce: 'r',
      status: 'open',
      tickets: ['T'],
    });
    expect(bare).not.toContain('careful:');
    expect(bare).not.toContain('mitigation:');
  });
});

describe('openEntries', () => {
  it('returns only open entries', () => {
    // Asserted as "nothing returned is non-open" rather than "the set of statuses is
    // exactly ['open']". The latter goes red the day the last flake is fixed and every
    // entry becomes mitigated or guarded, which is the one outcome this work is for.
    expect(openEntries().filter((entry) => entry.status !== 'open')).toEqual([]);
  });

  it('returns nothing when the register is entirely mitigated', () => {
    expect(
      openEntries(REGISTER.map((entry) => ({ ...entry, status: 'mitigated' as const }))),
    ).toEqual([]);
  });
});
