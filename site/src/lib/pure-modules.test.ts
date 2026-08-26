/**
 * pure-modules.test.ts — the no-imports constraint, checked rather than asserted.
 *
 * Three modules state in their own docstrings that they have no imports and must
 * keep none. That constraint is load-bearing: `private-paths.test.ts` is the
 * guard proving `.env` and nine private working trees are gitignored, and it
 * reaches all three. Give any of them an import and a throw anywhere in the new
 * dependency chain takes the guard down during collection, which was MEASURED on
 * this branch to report `Tests no tests` with not one probe executed.
 *
 * Until this file existed the constraint was prose only, which CLAUDE.md's first
 * Gotcha rules out in terms: "A comment saying 'keep these in sync' documents the
 * risk; it does not mitigate it. The fix is always one of two things: derive the
 * value instead of typing it, or add a check that fails when the two disagree."
 * This is the second of those.
 *
 * It deliberately does NOT assert the reverse (that these are the only pure
 * modules). A new pure module should be free to appear without editing a list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** lib/ -> src/ -> site/ */
const SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const MUST_HAVE_NO_IMPORTS = [
  // Read by the private-path guard. Extracted OUT of caail-docs-loader.ts
  // precisely so that guard stops importing `astro/loaders`.
  'src/content/canonical-sources.ts',
  // The one `.worktreeinclude` parse, after the same strip existed twice.
  'src/lib/worktree-include.ts',
  // The one `git check-ignore -v` parse, after three copies of it disagreed.
  'src/lib/gitignore-report.ts',
];

describe('the modules the private-path guard depends on stay import-free', () => {
  for (const rel of MUST_HAVE_NO_IMPORTS) {
    it(`${rel} imports nothing`, () => {
      const src = readFileSync(join(SITE_ROOT, rel), 'utf-8');
      // Static imports, side-effect imports, `export ... from`, and the dynamic
      // form. A line starting with ` *` is a docstring and never a statement, so
      // prose describing the rule cannot trip it.
      const offenders = src
        .split('\n')
        .map((l, i) => [i + 1, l] as const)
        .filter(([, l]) => /^\s*(import\b|export\s+(\*|\{[^}]*\})\s+from\b)/.test(l)
          || /^[^*/]*\brequire\s*\(/.test(l)
          || /^[^*/]*\bimport\s*\(/.test(l))
        .map(([n, l]) => `${n}: ${l.trim()}`);

      expect(
        offenders,
        `${rel} states in its own docstring that it has no imports, and the `
          + `private-path guard depends on that: a throw anywhere in a new `
          + `dependency chain takes every .env and private-tree probe down `
          + `during collection, reporting "Tests no tests" rather than a `
          + `publishing failure. If this module genuinely needs an import, the `
          + `guard needs re-checking first, and the docstring needs correcting `
          + `either way`,
      ).toEqual([]);
    });
  }
});
