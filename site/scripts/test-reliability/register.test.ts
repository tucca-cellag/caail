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

import {
  REGISTER,
  openEntries,
  entriesForVitestModule,
  entriesForPlaywrightTest,
  formatEntry,
  formatReport,
  titleMatches,
  unsupportedPlaceholders,
  type UnreliableEntry,
} from './register.js';

/** `site/`, two levels up from `site/scripts/test-reliability/`. */
const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * How many `describe` calls in `source` are named exactly `name`, in any quote style and
 * with any modifier (`describe.skip(`, `describe.sequential(`).
 */
function describeCalls(source: string, name: string): number {
  const literal = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ["'", '"', '`'].reduce(
    (total, quote) => total + [...source.matchAll(new RegExp(`\\bdescribe(?:\\.\\w+)*\\(\\s*${quote}${literal}${quote}`, 'g'))].length,
    0,
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
    // Playwright entries are matched by exact title at report time, so a title that
    // drifts would silently stop matching and the register would quietly do nothing.
    // Checked only for entries whose file is a spec: the artifact entries point at the
    // preflight module and describe the suite rather than one named test.
    const drifted: string[] = [];
    for (const entry of REGISTER) {
      if (entry.suite !== 'playwright' || !entry.file.endsWith('.spec.ts')) continue;
      const source = readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      if (!source.includes(entry.unit)) {
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

  it('every named vitest test still exists in its file', () => {
    // The vitest analogue of the Playwright title check above. Without it, renaming a
    // test that an entry narrows to leaves the entry silently matching nothing: the
    // register keeps listing it, the reporter never fires, and the failure it was
    // written for reads as unregistered.
    const drifted: string[] = [];
    for (const entry of REGISTER) {
      if (entry.suite !== 'vitest' || !entry.tests) continue;
      const source = readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      for (const name of entry.tests) {
        if (!source.includes(name)) {
          drifted.push(`${entry.id}: no test named ${JSON.stringify(name)} in ${entry.file}`);
        }
      }
    }
    expect(drifted).toEqual([]);
  });

  it('every named vitest suite is the name of exactly one describe call in its file', () => {
    // A suite name can appear elsewhere in its module, as `buildLlmsFullText` does in
    // the import of the function it tests, so finding the text proves nothing: renaming
    // the describe would leave the entry matching nothing with this check green. The
    // reporter matches a suite by its bare name, so a second describe of that name, under
    // another parent, would be labelled too; requiring exactly one makes the bare name
    // unambiguous, and a second one fails here instead of being mislabelled.
    const wrong: string[] = [];
    for (const entry of REGISTER) {
      if (entry.suite !== 'vitest' || !entry.suites) continue;
      const source = readFileSync(join(SITE_ROOT, entry.file), 'utf-8');
      for (const name of entry.suites) {
        const calls = describeCalls(source, name);
        if (calls !== 1) {
          wrong.push(`${entry.id}: ${calls} describe calls named ${JSON.stringify(name)} in ${entry.file}, not 1`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('a vitest entry whose module holds unregistered tests narrows to named tests', () => {
    // community.test.ts holds three tests and only one is residue-prone; one of the
    // other two is the guard against a real Slack-invite paste. An entry there without
    // `tests` would label a genuine leak as a known artifact.
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

describe('entriesForVitestModule', () => {
  it('matches a project-relative module id', () => {
    const hits = entriesForVitestModule('scripts/parser/metrics.test.ts');
    expect(hits.map((entry) => entry.id)).toEqual(['vitest-metrics-corpus-hook']);
  });

  it('matches a module-level entry even when no failed test name is known', () => {
    // A hook timeout produces no failed TestCase, which is exactly how the five
    // slow-fixture entries fail. They must still match.
    expect(entriesForVitestModule('scripts/parser/metrics.test.ts', {}).map((e) => e.id)).toEqual([
      'vitest-metrics-corpus-hook',
    ]);
  });

  it('a narrowed entry matches only when one of its named tests failed', () => {
    const file = 'src/lib/community.test.ts';
    const registered = 'appears nowhere under site/ except this module and its test';
    expect(entriesForVitestModule(file, { tests: [registered] }).map((e) => e.id)).toEqual([
      'vitest-community-invite-walk',
    ]);
    // A real Slack-invite paste fails the SAME test, so that case is still registered;
    // what must not match is the module's other tests failing on their own.
    expect(
      entriesForVitestModule(file, { tests: ['exposes a base-relative community path, not a baked-in /caail prefix'] }),
    ).toEqual([]);
    expect(entriesForVitestModule(file, {})).toEqual([]);
    // A suite of the same name failing its own hook is not one of the named tests.
    expect(entriesForVitestModule(file, { suites: [registered] })).toEqual([]);
  });

  it('a suite-narrowed entry matches only that suite failing with an error of its own', () => {
    // `failures.suites` holds only suites whose own hook failed (`failuresIn` in the
    // reporter, checked against vitest by vitest-reporter.test.ts). So a test failing
    // inside the suite arrives as a failed test name and must not match the suite.
    const hooked: UnreliableEntry = {
      ...REGISTER[0],
      id: 'suite-narrowed',
      file: 'scripts/parser/fixture.test.ts',
      tests: undefined,
      suites: ['the suite with a hook'],
    };
    const match = (failures: Parameters<typeof entriesForVitestModule>[1]) =>
      entriesForVitestModule(hooked.file, failures, [hooked]).map((e) => e.id);
    expect(match({ suites: ['the suite with a hook'] })).toEqual(['suite-narrowed']);
    expect(match({ tests: ['a test inside the suite with a hook'] })).toEqual([]);
    expect(match({ suites: ['another suite'] })).toEqual([]);
    expect(match({})).toEqual([]);
  });

  it('a test-narrowed entry may name a templated test', () => {
    const looped: UnreliableEntry = {
      ...REGISTER[0],
      id: 'looped',
      file: 'scripts/parser/fixture.test.ts',
      tests: ['parses ${name}'],
    };
    const match = (tests: string[]) =>
      entriesForVitestModule(looped.file, { tests }, [looped]).map((e) => e.id);
    expect(match(['parses Papers.md'])).toEqual(['looped']);
    expect(match(['emits Papers.md'])).toEqual([]);
  });

  it('matches an absolute path ending in the registered file', () => {
    const hits = entriesForVitestModule('/checkout/site/scripts/db/emit.test.ts');
    expect(hits.map((entry) => entry.id)).toEqual(['vitest-db-emit']);
  });

  it('normalises Windows separators', () => {
    const hits = entriesForVitestModule('C:\\checkout\\site\\scripts\\db\\emit.test.ts');
    expect(hits.map((entry) => entry.id)).toEqual(['vitest-db-emit']);
  });

  it('does not match a path that merely ends in the same basename', () => {
    // `endsWith('scripts/db/emit.test.ts')` without the leading separator would match
    // `other/scripts/db/emit.test.ts`; requiring the separator keeps a same-named file
    // in a different tree from inheriting an entry that was never about it.
    expect(entriesForVitestModule('somewhere/notscripts/db/emit.test.ts')).toEqual([]);
  });

  it('returns nothing for an unregistered module', () => {
    expect(entriesForVitestModule('scripts/parser/apa.test.ts')).toEqual([]);
  });

  it('does not match a Playwright entry', () => {
    expect(entriesForVitestModule('e2e/licenses.spec.ts')).toEqual([]);
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

  it('matches on file plus exact test title', () => {
    const hits = entriesForPlaywrightTest(
      LICENSES,
      'the catalog license facet narrows the grid to a tier',
    );
    expect(hits.map((entry) => entry.id)).toEqual(['pw-license-facet']);
  });

  it('does not match the other nine tests in the same registered file', () => {
    expect(entriesForPlaywrightTest(LICENSES, 'the /licenses/ hub lists the 4 tiers')).toEqual([]);
  });

  it('does not match the registered title in a DIFFERENT spec file', () => {
    // Copying licenses.spec.ts to cover /databases/ is the obvious next change here.
    // A title-only match would greet a genuine failure in the copy with this entry's
    // "already mitigated" verdict, which is the mislabelling the register prevents.
    expect(
      entriesForPlaywrightTest(
        '/checkout/site/e2e/databases-licenses.spec.ts',
        'the catalog license facet narrows the grid to a tier',
      ),
    ).toEqual([]);
  });

  it('accepts a site-relative path as well as an absolute one', () => {
    const hits = entriesForPlaywrightTest(
      'e2e/licenses.spec.ts',
      'the catalog license facet narrows the grid to a tier',
    );
    expect(hits.map((entry) => entry.id)).toEqual(['pw-license-facet']);
  });

  it('matches a templated title in its own file, at every value the loop generates', () => {
    const looped: UnreliableEntry = {
      ...REGISTER[0],
      id: 'looped',
      suite: 'playwright',
      file: 'e2e/looped.spec.ts',
      unit: 'fits at ${width}px',
    };
    const match = (file: string, title: string) => entriesForPlaywrightTest(file, title, [looped]).map((e) => e.id);
    expect(match('/checkout/site/e2e/looped.spec.ts', 'fits at 1600px')).toEqual(['looped']);
    expect(match('/checkout/site/e2e/looped.spec.ts', 'fits at 1920px')).toEqual(['looped']);
    expect(match('/checkout/site/e2e/looped.spec.ts', 'fits at 1600px, twice')).toEqual([]);
    expect(match('/checkout/site/e2e/other.spec.ts', 'fits at 1600px')).toEqual([]);
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
