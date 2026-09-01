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
 * IT WALKS THE CLOSURE, NOT ONE LEVEL, and that is the difference between
 * checking the constraint and checking a proxy for it. The hazard is a throw
 * during module EVALUATION anywhere the guard can reach, so the property being
 * protected was always transitive; requiring each direct import to carry zero
 * specifiers was a sufficient shortcut that happened to hold while all three
 * were leaf data modules. It stopped holding the moment one of them needed to
 * derive a list from a sibling rather than restate it, which is the defect
 * CLAUDE.md names as this repo's most expensive recurring one — so the shortcut
 * was the thing standing between the guard and a hand-typed copy of a constant.
 *
 * The rule the walk enforces: a module in the closure may import PROJECT
 * SIBLINGS, by relative path, and nothing else. Each sibling is then walked on
 * the same terms, so a bare specifier cannot enter at any depth. That admits a
 * pure in-repo module, which cannot introduce an evaluation throw the repo does
 * not already own, and still admits no third-party module graph, which can. A
 * hand-maintained allow-list of permitted siblings was rejected for the reason
 * the walk exists: it would be one more list nothing checks.
 *
 * DYNAMIC IMPORTS COUNT INSIDE THE CLOSURE, unlike in the guard itself. The
 * guard's own are excluded because they run in a test body, where a throw fails
 * that test rather than collection. A module reached by the walk has no such
 * protection, so every syntax counts against it.
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
import { readFileSync, existsSync } from 'node:fs';
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

/**
 * A relative specifier, as a path relative to site/.
 *
 * FOUR CANDIDATE SPELLINGS, because this repo uses more than one and an earlier
 * version of this function assumed the first. `.js` maps to `.ts` because the
 * project's imports are written the way NodeNext wants them emitted while what
 * is on disk is the TypeScript source; the extensionless form is legal and is
 * what `DataTableViews.astro` uses to reach `table-layout`; and a directory
 * specifier resolves through its `index.ts`. Assuming the `.js` form alone made
 * a legal sibling import report as a MISSING FILE, under a message telling the
 * reader it had been moved.
 *
 * Falls back to the primary spelling when none exists, so an unresolvable
 * specifier is reported by the readability probe rather than silently skipped.
 */
function resolveFrom(fromRel: string, spec: string): string {
  const base = normalize(join(dirname(fromRel), spec));
  const candidates = [base.replace(/\.js$/, '.ts'), base, `${base}.ts`, join(base, 'index.ts')];
  return candidates.find((c) => existsSync(join(SITE_ROOT, c))) ?? candidates[0];
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
    .map((spec) => resolveFrom(GUARD, spec));
}

/** A module in the closure, with whatever disqualifies it. */
interface Member {
  /** Path relative to site/. */
  rel: string;
  /** Specifiers that are not project siblings. Non-empty means it fails. */
  bare: string[];
  /** Set when the file could not be read at all. */
  unreadable?: string;
}

/**
 * Every module reachable from `seeds` by relative imports, seeds included.
 *
 * Breadth-first and cycle-safe. A module that cannot be READ is recorded rather
 * than thrown on, for the same reason the seed scan is: a throw here aborts
 * collection of this file, which is the failure it exists to eliminate.
 */
function walkClosure(seeds: string[]): Member[] {
  const members: Member[] = [];
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const rel = queue.shift() as string;
    if (seen.has(rel)) continue;
    seen.add(rel);
    let src: string;
    try {
      src = readFileSync(join(SITE_ROOT, rel), 'utf-8');
    } catch (e) {
      members.push({ rel, bare: [], unreadable: (e as Error).message });
      continue;
    }
    const specs = moduleSpecifiers(src);
    members.push({ rel, bare: specs.filter((spec) => !spec.startsWith('.')) });
    for (const spec of specs) {
      if (spec.startsWith('.')) queue.push(resolveFrom(rel, spec));
    }
  }
  return members;
}

// COLLECTION MUST NOT THROW. Computing this in the describe body once meant a
// renamed guard file aborted collection of THIS file and reported `Tests no
// tests`, which is the precise failure mode it was written to eliminate, in the
// file that eliminates it. Captured instead, and asserted below as an ordinary
// test, so the whole suite still reports.
let seeds: string[] = [];
let members: Member[] = [];
let scanError: unknown;
try {
  seeds = guardStaticProjectImports();
  members = walkClosure(seeds);
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
      seeds,
      `no static project imports were found in ${GUARD}, which almost certainly `
        + `means the scan broke rather than that the guard has none`,
    ).not.toEqual([]);
  });

  // The walk records an unreadable module rather than throwing, so without this
  // it would fail SILENTLY: an unreadable member carries no specifiers, so its
  // own assertion below passes by having nothing to check. Same shape as the
  // floor above, one level down.
  it('every module in the closure can be read', () => {
    expect(
      members.filter((m) => m.unreadable).map((m) => `${m.rel}: ${m.unreadable}`),
      `a module reachable from ${GUARD} could not be read, so it was not `
        + `checked. Two causes, and they want opposite fixes. Either the module `
        + `was moved or renamed, and the specifier pointing at it is now wrong; `
        + `or this is PROSE, because the scan reads raw source on purpose and a `
        + `docstring writing a quoted path after the word f-r-o-m is enqueued `
        + `and read exactly like an import. If it is prose, rewrite the prose`,
    ).toEqual([]);
  });

  for (const m of members) {
    it(`${m.rel} imports nothing outside the closure`, () => {
      expect(
        m.bare,
        `${m.rel} is reachable from ${GUARD} by static relative imports, so it `
          + `may import project siblings and nothing else: a throw anywhere in `
          + `the chain takes every private-tree probe down during COLLECTION, `
          + `reporting "Tests no tests" rather than a publishing failure. A `
          + `sibling is walked on these same terms, so importing one is safe; a `
          + `third-party package is not and is what this rejects. If the guard `
          + `genuinely needs this module's data through a package, change the `
          + `guard to reach it dynamically instead, the way it reaches the `
          + `parser. If this is a false positive from prose, rewrite the prose: `
          + `this scan reads raw source on purpose`,
      ).toEqual([]);
    });
  }
});
