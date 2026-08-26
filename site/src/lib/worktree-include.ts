/**
 * worktree-include.ts — parsing `.worktreeinclude`.
 *
 * Its own module rather than a second topic inside `canonical-files.ts`, whose
 * subject is which Markdown in a canonical directory is published. The failure
 * modes here are different ones (an inline `#`, a CRLF line ending, a
 * whitespace-only line), and a file answering two unrelated questions is a file
 * nobody greps for the second one.
 *
 * No imports, and it must keep none: this is pulled into build-time scripts and
 * the docs loader alike.
 */

/**
 * The effective rules in a `.worktreeinclude`, given its CONTENTS.
 *
 * Takes a string rather than a path on purpose: this module has no imports and
 * must keep none, because it is pulled into build-time scripts and the docs
 * loader alike. The caller does its own `readFileSync`.
 *
 * It exists because the same four-line strip was written out twice, in
 * `private-paths.test.ts` and `canonical-files.test.ts`, each then asserting
 * `toContain` on the result. A `.worktreeinclude` that ever grows a syntax the
 * strip mishandles (an inline `#`, a CRLF line ending, a whitespace-only line)
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
