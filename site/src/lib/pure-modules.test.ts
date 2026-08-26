/**
 * pure-modules.test.ts — the no-imports constraint, checked rather than asserted.
 *
 * `private-paths.test.ts` is the guard proving the credentials file and every
 * private working tree are gitignored. Give any module it STATICALLY imports an
 * import of its own and a throw anywhere in the new chain aborts COLLECTION of
 * that file, so not one probe runs and the report reads `Tests no tests`.
 * Measured on this branch.
 *
 * Until this existed the constraint was prose in three docstrings, which
 * CLAUDE.md rules out: a comment documents a risk, it does not mitigate it.
 *
 * NO COMMENT STRIPPING, DELIBERATELY, and this is the load-bearing decision in
 * the file. An earlier version stripped comments before scanning, which produced
 * a defect in each of two consecutive review rounds:
 *
 *   - The block-comment regex was not string-aware. Two glob literals in one
 *     module (`'∗∗/∗.local.md'` … `'∗∗/∗.local.mdx'`) opened and closed a fake
 *     comment and everything between them was deleted, including a real
 *     `import`. Measured: the scan then reported the module imports nothing.
 *     `canonical-files.ts` already contains that exact shape.
 *   - The line-comment regex was anchored to line start, so a TRAILING
 *     `// import y from './y'` survived and produced a false positive.
 *
 * Regexes cannot decide comment and string context in JavaScript, so a better
 * regex was the wrong repair twice over. Scanning the RAW source removes the
 * question: a comment mentioning an import now reads exactly like an import, so
 * the check errs toward FALSE POSITIVES and can have no false negatives from
 * this cause. That is the right direction to be wrong in. The cost is that
 * prose in these three modules must not write a module specifier in quotes,
 * which is why this docstring writes its glob example with U+2217.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/** lib/ -> src/ -> site/ */
const SITE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const GUARD = 'scripts/private-paths.test.ts';

/**
 * Every module specifier in this source, by any syntax.
 *
 * `from '…'` catches static imports, `import type`, and every re-export form
 * including `export * as ns from` and the multi-line `export { … } from`, none
 * of which a line-anchored pattern reaches. The other three cover the syntaxes
 * that carry no `from` at all.
 */
function moduleSpecifiers(src: string): string[] {
  const out: string[] = [];
  for (const re of [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /^[ \t]*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const m of src.matchAll(re)) out.push(m[1]);
  }
  return out;
}

/** The guard's STATIC project imports, as paths relative to site/. */
function guardStaticProjectImports(): string[] {
  const src = readFileSync(join(SITE_ROOT, GUARD), 'utf-8');
  // Dynamic imports are excluded on purpose: they run inside a test body, so a
  // throw in one fails that test rather than the whole file, which is exactly
  // why the guard was changed to reach the parser that way.
  const dynamic = new Set(
    [...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
  );
  return [...new Set(moduleSpecifiers(src))]
    .filter((spec) => spec.startsWith('.') && !dynamic.has(spec))
    .map((spec) => normalize(join(dirname(GUARD), spec)).replace(/\.js$/, '.ts'));
}

// COLLECTION MUST NOT THROW. Computing this in the describe body once meant a
// renamed guard file aborted collection of THIS file and reported `Tests no
// tests`, which is the precise failure mode it was written to eliminate, in the
// file that eliminates it. Captured instead, and asserted below as an ordinary
// test, so the whole suite still reports.
let targets: string[] = [];
let scanError: unknown;
try {
  targets = guardStaticProjectImports();
} catch (e) {
  scanError = e;
}

describe('the modules the private-path guard depends on stay import-free', () => {
  it('can read the guard and find its static project imports', () => {
    expect(
      scanError,
      `reading ${GUARD} threw, so nothing below was checked. It was probably `
        + `moved or renamed; point GUARD at its new path`,
    ).toBeUndefined();
    // A FLOOR. A silently empty scan would make every assertion below pass by
    // iterating nothing, which is the shape this repo keeps being bitten by.
    expect(
      targets,
      `no static project imports were found in ${GUARD}, which almost certainly `
        + `means the scan broke rather than that the guard has none`,
    ).not.toEqual([]);
  });

  for (const rel of targets) {
    it(`${rel} imports nothing`, () => {
      expect(
        moduleSpecifiers(readFileSync(join(SITE_ROOT, rel), 'utf-8')),
        `${rel} is statically imported by ${GUARD}, so it must import nothing: a `
          + `throw anywhere in a dependency chain takes every private-tree probe `
          + `down during COLLECTION, reporting "Tests no tests" rather than a `
          + `publishing failure. If this module genuinely needs an import, change `
          + `the guard to reach it dynamically instead, the way it reaches the `
          + `parser. If this is a false positive from prose, rewrite the prose: `
          + `this scan reads raw source on purpose`,
      ).toEqual([]);
    });
  }
});
