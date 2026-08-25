/**
 * private-paths.test.ts: the private working trees must resolve as gitignored.
 *
 * `internal-docs/` holds this project's own decision records, research notes
 * and traffic figures; `manuscript/` holds drafts and the outreach roster.
 * Each is protected by exactly one line in `.gitignore`, and until this file
 * existed nothing verified either line was still there. Delete one, reword it,
 * or lose it in a conflict resolution and nothing fails: no build breaks, no
 * test goes red, and the next `git add -A` stages the contents into a repo
 * that is PUBLIC, where pull requests cannot be deleted.
 *
 * Snapshot, 2026-08-25, measured on the branch that added the `internal-docs/`
 * rule and with that rule absent: `git add -A --dry-run` reported 43 private
 * paths and looked entirely ordinary. That figure tracks one working
 * directory and will drift; `git add -A --dry-run` prints the real one. It is
 * recorded because the number is the argument, not because it is stable.
 *
 * `.gitignore` is in `test.yml`'s paths filter, so this runs on exactly the
 * edit most likely to break it. Before that filter existed, a PR touching only
 * `.gitignore` triggered no workflow at all.
 *
 * Covering both trees rather than one: an earlier draft guarded `internal-docs/`
 * alone while naming `manuscript/` as "arguably the more exposed of the two",
 * which is a guard that documents the hole it leaves. Whether this should
 * instead enumerate EVERY must-stay-ignored path as a set, derived rather than
 * listed, is CAAIL-331's open question and is still not answered here.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** scripts/ → site/ → repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** The trees whose whole protection is a single .gitignore line. */
const PRIVATE_TREES = ['internal-docs/', 'manuscript/'];

/**
 * Representative paths, not an inventory. They need not exist on disk:
 * `check-ignore --no-index` answers about the RULE, which is the thing under
 * test. A guard keyed to files that happen to be present would pass in a
 * fresh clone that has none of them.
 *
 * WHAT IS DELIBERATELY NOT PROBED: the nine files under internal-docs/ that
 * duplicate documents still TRACKED and public at docs/ and CONTEXT.md. An
 * earlier draft probed exactly those, so the guard asserted privacy for
 * documents anyone can read on GitHub, and would have passed while every
 * genuinely private file was untouched by it. Probe what is actually secret.
 */
const PROBES = [
  'internal-docs/superpowers/specs/2026-08-05-curator-review-queue-design.md',
  'internal-docs/research/caail-315-measurement-surface.md',
  'internal-docs/superpowers/caail-203-audit/audit.py',
  // Not Markdown, on purpose. Narrowing the rule to `/internal-docs/**/*.md`
  // would keep every .md probe green while the traffic figures the docstring
  // names became committable. Two of these three are also not .md for the same
  // reason: a guard whose probes share one extension tests that extension.
  'internal-docs/metrics/traffic.ndjson',
  'manuscript/outreach/roster.csv',
  'manuscript/figures/figure-1.png',
  // Paths that do not exist, so the guard is about the RULE rather than
  // today's directory listing.
  'internal-docs/some-future-note.md',
  'manuscript/some-future-draft.md',
];

describe('the private working trees stay out of the public repo', () => {
  it('gitignores every probe path, by a rule in this repo', () => {
    for (const probe of PROBES) {
      // --no-index is load-bearing for the same reason canonical-files.test.ts
      // gives: in index-aware mode git check-ignore never reports a TRACKED
      // path, so the moment one of these was committed (the exact failure) the
      // check would go quiet and pass. Asking about the rule instead is the
      // only form that stays honest after the defect has already happened.
      // -v, not -q, and the SOURCE is asserted rather than just the match.
      // check-ignore consults every exclude source: .git/info/exclude,
      // core.excludesFile, nested .gitignore files. A contributor with
      // internal-docs/ in ~/.config/git/ignore could delete the committed rule,
      // run this suite, see green and push. Only CI would catch it, and the
      // comment in .gitignore claims this test pins that line specifically.
      const res = spawnSync('git', ['check-ignore', '--no-index', '-v', probe], {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
      });
      // 0 = matched, 1 = no rule matched. Anything else means the check did not
      // run, and an unchecked check must fail rather than pass quietly.
      expect(res.error, `git check-ignore could not run for ${probe}`).toBeUndefined();
      expect([0, 1], `git check-ignore exited ${res.status} for ${probe}`).toContain(res.status);
      expect(
        res.status,
        `${probe} is NOT gitignored: private working docs are committable into a public repo`,
      ).toBe(0);
      // Output shape: `<source>:<line>:<pattern>\t<pathname>`.
      //
      // LIMIT: check-ignore reads the WORKING-TREE .gitignore, not
      // HEAD:.gitignore, so this proves the rule is in the repo's own file and
      // not in a personal exclude source. It does NOT prove the rule is
      // committed: an unstaged local re-add passes here and would fail in CI,
      // which is the right way round but is not what a message saying
      // "committed" would mean.
      expect(
        (res.stdout ?? '').trim(),
        `${probe} is ignored, but by a rule outside this repo's .gitignore `
          + `(a personal core.excludesFile or .git/info/exclude), so nothing `
          + `here guarantees it for anyone else`,
      ).toMatch(/^\.gitignore:\d+:/);
    }
  });

  it('has no tracked files under either private tree', () => {
    // The other direction, and the one that means it has already gone wrong.
    // The rule above can be present and correct while a file committed before
    // it was added stays tracked forever, since .gitignore does not apply
    // retroactively to the index.
    const res = spawnSync('git', ['ls-files', '--', ...PRIVATE_TREES], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(res.error, 'git ls-files could not run').toBeUndefined();
    expect(res.status, `git ls-files exited ${res.status}`).toBe(0);
    const tracked = (res.stdout ?? '').trim();
    expect(tracked, 'these private files are TRACKED and will be published').toBe('');
  });

});
