/**
 * pure-modules.test.ts — the no-imports constraint, checked rather than asserted.
 *
 * `private-paths.test.ts` is the guard proving the credentials file and every
 * private working tree are gitignored. Give any module it statically imports an
 * import of its own and a throw anywhere in the new chain aborts COLLECTION of
 * that file, so not one probe runs. Measured on this branch: the run reports
 * `Tests no tests` and names whatever module actually threw.
 *
 * Until this existed the constraint was prose in three docstrings, which
 * CLAUDE.md rules out in terms: "A comment saying 'keep these in sync' documents
 * the risk; it does not mitigate it. The fix is always one of two things: derive
 * the value instead of typing it, or add a check that fails when the two
 * disagree." This does the first.
 *
 * THE LIST IS DERIVED, not kept. An earlier version named three modules by hand,
 * so a fourth extracted the same way would have been unguarded with this file
 * green, and the docstring counted them in prose beside the array that knew.
 * Both are the defect this branch spent several rounds removing from the guard
 * itself. The set now comes from the guard's own static imports, so a module
 * added there is covered the moment it is added.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/** lib/ -> src/ -> site/ */
const SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GUARD = 'scripts/private-paths.test.ts';

/** Source with block and line comments removed, so prose cannot trip a scan. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Every module specifier this file imports, whether by `import`, by
 * `export … from`, or dynamically. Multi-line and `export * as ns from` forms
 * included: an earlier per-line regex missed both, which meant a "pure" module
 * could take on a real dependency with this suite green.
 */
function importedSpecifiers(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  for (const re of [
    /\bimport\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,  // import x from 'y'
    /\bimport\s*['"]([^'"]+)['"]/g,                    // side-effect import
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,          // dynamic import
    /\bexport\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,   // re-export, incl. * as ns
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const m of code.matchAll(re)) out.push(m[1]);
  }
  return out;
}

/** The guard's STATIC project imports, as paths relative to site/. */
function guardStaticProjectImports(): string[] {
  const src = readFileSync(join(SITE_ROOT, GUARD), 'utf-8');
  const code = stripComments(src);
  // Dynamic imports are deliberately excluded: they run inside a test body, so a
  // throw in one fails that test rather than the whole file, which is the entire
  // reason the guard was changed to reach the parser that way.
  const dynamic = new Set(
    [...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  );
  return importedSpecifiers(src)
    .filter((spec) => spec.startsWith('.') && !dynamic.has(spec))
    .map((spec) => normalize(join(dirname(GUARD), spec)).replace(/\.js$/, '.ts'));
}

describe('the modules the private-path guard depends on stay import-free', () => {
  const targets = guardStaticProjectImports();

  it('finds the guard\'s static project imports at all', () => {
    // A FLOOR. If the scan silently returned nothing, every assertion below
    // would pass by iterating an empty list, which is the shape this repo has
    // been bitten by repeatedly.
    expect(
      targets,
      `no static project imports were found in ${GUARD}, which almost certainly `
        + `means the scan broke rather than that the guard has none`,
    ).not.toEqual([]);
  });

  for (const rel of targets) {
    it(`${rel} imports nothing`, () => {
      const specs = importedSpecifiers(readFileSync(join(SITE_ROOT, rel), 'utf-8'));
      expect(
        specs,
        `${rel} is statically imported by ${GUARD}, so it must import nothing: a `
          + `throw anywhere in a dependency chain takes every private-tree probe `
          + `down during COLLECTION, reporting "Tests no tests" rather than a `
          + `publishing failure. If this module genuinely needs an import, change `
          + `the guard to reach it dynamically instead, the way it reaches the `
          + `parser`,
      ).toEqual([]);
    });
  }
});
