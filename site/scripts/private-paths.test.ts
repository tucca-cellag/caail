/**
 * private-paths.test.ts: `internal-docs/` must resolve as gitignored.
 *
 * `internal-docs/` holds this project's own decision records, research notes
 * and traffic figures. Its entire protection is one line in `.gitignore`, and
 * until this file existed nothing verified that line was still there. Delete
 * it, reword it, or lose it in a conflict resolution and nothing fails: no
 * build breaks, no test goes red, and the next `git add -A` stages the
 * contents into a repo that is PUBLIC, where pull requests cannot be deleted.
 *
 * Measured on the branch that added the rule, with the rule absent:
 * `git add -A --dry-run` reported 43 private paths and looked entirely
 * ordinary. That is the failure this guard converts into a red run.
 *
 * `.gitignore` is in `test.yml`'s paths filter, so this runs on exactly the
 * edit most likely to break it. Before that filter existed, a PR touching only
 * `.gitignore` triggered no workflow at all.
 *
 * Scope is `internal-docs/` alone, deliberately. `manuscript/` has the
 * identical property and holds the outreach roster, so it is arguably the more
 * exposed of the two; whether this assertion should instead cover every
 * must-stay-ignored path as a set is CAAIL-331's open question and is not
 * answered here.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** scripts/ → site/ → repo root. */
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Representative paths, not an inventory. They need not exist on disk:
 * `check-ignore --no-index` answers about the RULE, which is the thing under
 * test. A guard keyed to files that happen to be present would pass in a
 * fresh clone that has none of them.
 */
const PROBES = [
  'internal-docs/CONTEXT.md',
  'internal-docs/adr/0002-what-the-repo-publishes.md',
  'internal-docs/agents/issue-tracker.md',
  'internal-docs/research/some-future-note.md',
  'internal-docs/superpowers/some-future-spec.md',
];

describe('internal-docs/ stays out of the public repo', () => {
  it('gitignores every probe path under internal-docs/', () => {
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
      expect(
        (res.stdout ?? '').trim(),
        `${probe} is ignored, but by a rule outside the committed .gitignore, `
          + `so nothing in this repo guarantees it for anyone else`,
      ).toMatch(/^\.gitignore:\d+:/);
    }
  });

  it('has no tracked files under internal-docs/', () => {
    // The other direction, and the one that means it has already gone wrong.
    // The rule above can be present and correct while a file committed before
    // it was added stays tracked forever, since .gitignore does not apply
    // retroactively to the index.
    const res = spawnSync('git', ['ls-files', '--', 'internal-docs/'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
    expect(res.error, 'git ls-files could not run').toBeUndefined();
    expect(res.status, `git ls-files exited ${res.status}`).toBe(0);
    const tracked = (res.stdout ?? '').trim();
    expect(tracked, 'these internal-docs/ files are TRACKED and will be published').toBe('');
  });

  it('.worktreeinclude carries a rule for internal-docs/ (presence, not effect)', () => {
    // .worktreeinclude copies *.local.md into every worktree. Without a rule
    // for internal-docs/ a worktree receives the private companion of a file
    // whose public partner is absent, which is the state ADR-0002 warns
    // produces an agent re-deriving the withheld mechanics into a public file.
    //
    // LIMIT, stated because the name used to overclaim: this asserts the rule
    // is PRESENT, not that it WORKS. `/internal-docs/` is the file's first
    // directory pattern; every other rule here is a file glob. Nothing below
    // verifies the worktree copier expands a trailing-slash directory to the
    // files beneath it. If it does not, `*.local.md` still copies
    // internal-docs/agents/issue-tracker.local.md while its public partner
    // stays absent, which is the half-state above, with this test green.
    // Verifying the effect means creating a worktree, which no unit test here
    // should do; it belongs in the same change that relies on the behaviour.
    // Read the working tree, not HEAD, matching canonical-files.test.ts. The
    // rule and the guard for it land in one commit, so a HEAD-based read is
    // red until the moment it is committed and proves nothing either way.
    const src = readFileSync(join(REPO_ROOT, '.worktreeinclude'), 'utf-8');
    const rules = src
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(rules, '.worktreeinclude has no rule carrying internal-docs/').toContain('/internal-docs/');
  });
});
