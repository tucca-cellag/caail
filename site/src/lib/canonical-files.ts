/**
 * canonical-files.ts — which files in a canonical directory are published.
 *
 * The repo's publishing rule (CLAUDE.md) establishes `*.local.md` as the
 * suffix for a private companion living beside its public file. Nothing stops
 * one being created inside `Datasets/`, `ResearchAreas/`, `Methods/` or
 * `Primers/`, so every reader of those directories has to have an answer for
 * it. This is that answer, asked once.
 *
 * Do not trust a count of the callers written here — `grep` for
 * `readdirSync` over a canonical directory instead. What is worth recording is
 * that not every enumerator needs this predicate, and why:
 *
 * - `dirMarkdown` (scripts/parser/llms-full.ts) inlines each match VERBATIM
 *   into public/llms-full.txt, so it needs it.
 * - `countMdFiles` (scripts/parser/counts.ts) derives the homepage species and
 *   research-area counts, so it needs it.
 * - `caail-pages.test.ts` compares the directories against `CAAIL_PAGES` and
 *   needs it, or a companion is reported as an unregistered page — a failure
 *   that reads as map drift and sends the next reader after a bug that is not
 *   there.
 * - `src/content/loaders/caail-docs-loader.ts` has two branches and they are
 *   covered differently. Its canonical-directory scan does NOT need this
 *   predicate and must not be "fixed" to use it: candidates go through the
 *   `CAAIL_PAGES` allow-list, which drops an unregistered id already and is
 *   the stronger guarantee, so adding the predicate would hide which one is
 *   load bearing. Its `glob()` over `src/content/docs` has no allow-list at
 *   all, so it is excluded in the glob pattern instead.
 */

/** Agent-instruction files, which are never part of the published corpus. */
const INSTRUCTION_FILES: ReadonlySet<string> = new Set(['CLAUDE.md']);

/**
 * The suffixes reserved for private companions, gitignored.
 *
 * Both, not just `.md`: every file under `site/src/content/docs/` is `.mdx`,
 * and that is a directory the convention sanctions a companion in. Keep this
 * in step with the `*.local.*` entries in `.gitignore` and `.worktreeinclude`
 * — those decide whether the file is committable, this decides whether it is
 * published, and the two answering differently is the whole failure mode.
 */
export const PRIVATE_COMPANION_SUFFIXES = ['.local.md', '.local.mdx'] as const;

/**
 * True when `name` is a private companion, whatever its extension or case.
 *
 * Case-insensitive on purpose, because the `.gitignore` rule it pairs with is:
 * this repo has `core.ignoreCase=true`, so git treats `Cow.LOCAL.md` as
 * ignored — i.e. private — and a case-sensitive test here would publish it.
 * On a case-sensitive filesystem the divergence runs the other way and the
 * file is committable; excluding it is still the right side to err on, since
 * a page missing from the corpus is visible and a private file inlined into
 * llms-full.txt is not.
 */
export function isPrivateCompanion(name: string): boolean {
  const lower = name.toLowerCase();
  return PRIVATE_COMPANION_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

/**
 * Glob exclusions for the companion suffixes, for a loader that filters by
 * pattern rather than by predicate.
 *
 * Derived from `PRIVATE_COMPANION_SUFFIXES` rather than written out, so a
 * pattern cannot be "tidied" back to a plain string without the test that
 * compares the two going red. That tidy is the likely regression: the array
 * form reads as redundant to anyone who does not know why it is there.
 */
export function privateCompanionGlobExclusions(): string[] {
  return PRIVATE_COMPANION_SUFFIXES.map((suffix) => `!**/*${suffix}`);
}

/**
 * True when `name` is a Markdown file belonging to the published corpus.
 *
 * Excludes agent-instruction files and private companions. Accepts either a
 * bare file name or a path; the basename is taken first, so a caller that
 * already holds `${dir}/${name}` can pass it straight in.
 *
 * The extension and instruction-file tests are deliberately case-SENSITIVE,
 * unlike `isPrivateCompanion`. They pair with the other enumerators rather
 * than with `.gitignore`: `CAAIL_PAGES.idForSourcePath` strips the extension
 * case-sensitively and the docs loader's canonical scan tests `.md` the same
 * way, so admitting `Foo.MD` here would have this function alone call it a
 * page — inlining it into llms-full.txt while the site renders no route for
 * it and `caail-pages.test.ts` reports it as map drift.
 */
export function isPublishedMarkdown(nameOrPath: string): boolean {
  // Take the basename first. Without it the instruction-file check, which is a
  // whole-string match, fails OPEN on a path: isPublishedMarkdown(
  // 'Datasets/CLAUDE.md') would return true. That matters because this
  // docstring invites new enumerators to adopt the predicate, and the nearest
  // candidate — caail-docs-loader.ts's canonical scan — already builds
  // `${dir}/${name}` strings, so wiring it in as-was would have admitted every
  // directory's CLAUDE.md. The companion check would have survived (it is a
  // suffix match); the instruction-file check would not.
  const name = nameOrPath.split('/').pop() ?? nameOrPath;
  if (!name.endsWith('.md')) return false;
  if (INSTRUCTION_FILES.has(name)) return false;
  if (isPrivateCompanion(name)) return false;
  return true;
}

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
