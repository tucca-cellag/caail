/**
 * worktree-include.ts — parsing `.worktreeinclude`.
 *
 * Its own module rather than a second topic inside `canonical-files.ts`, whose
 * subject is which Markdown in a canonical directory is published. The failure
 * modes here are different ones (a CRLF line ending, a whitespace-only line), and a file answering two unrelated questions is a file
 * nobody greps for the second one.
 *
 * No imports, and it must keep none. Asserted by a test rather than only stated
 * here. The consumers are the two guard suites, NOT the docs loader or any
 * build-time script: an earlier draft of this sentence said otherwise, which
 * would have had someone either preserve the constraint for a consumer that does
 * not exist or relax it on finding none.
 */

/**
 * The effective rules in a `.worktreeinclude`, given its CONTENTS.
 *
 * Takes a string rather than a path on purpose: this module has no imports and
 * must keep none. The caller does its own `readFileSync`.
 *
 * It exists because the same four-line strip was written out twice, in
 * `private-paths.test.ts` and `canonical-files.test.ts`, each then asserting
 * `toContain` on the result. A `.worktreeinclude` that ever grows a syntax the
 * strip mishandles (a CRLF line ending, a whitespace-only line)
 * would get fixed in one copy while the other went on answering differently,
 * with nothing failing. That is the drift `patternOf`'s docstring in the first
 * of those files argues against, two functions further down the same file.
 */
export function worktreeIncludeRules(contents: string): string[] {
  return contents
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// INLINE `#` IS DELIBERATELY NOT STRIPPED, and the docstrings above no longer
// claim it is. `.worktreeinclude` is the harness's format rather than git's, and
// whether it supports a trailing comment at all has not been measured. Stripping
// to the first `#` would silently truncate a rule legitimately containing one;
// not stripping it makes such a rule visible as a rule that did not match. If a
// trailing comment is ever added to that file, measure the harness first.
