/**
 * canonical-files.ts — which files in a canonical directory are published.
 *
 * `docs/adr/0002-what-the-repo-publishes.md` establishes `*.local.md` as the
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
const INSTRUCTION_FILES: ReadonlySet<string> = new Set(['claude.md']);

/** The suffix reserved for private companions (ADR-0002), gitignored. */
export const PRIVATE_COMPANION_SUFFIX = '.local.md';

/**
 * True when `name` is a Markdown file belonging to the published corpus.
 *
 * Excludes agent-instruction files and `*.local.md` private companions. Takes
 * a bare file name, not a path.
 *
 * Matched case-insensitively, because the `.gitignore` rule it pairs with is:
 * this repo has `core.ignoreCase=true`, so git treats `Cow.LOCAL.md` as
 * ignored — i.e. private — and a case-sensitive test here would publish it.
 * On a case-sensitive filesystem the divergence runs the other way and the
 * file is committable; excluding it is still the right side to err on, since
 * a page missing from the corpus is visible and a private file inlined into
 * llms-full.txt is not.
 */
export function isPublishedMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.endsWith('.md')) return false;
  if (INSTRUCTION_FILES.has(lower)) return false;
  if (lower.endsWith(PRIVATE_COMPANION_SUFFIX)) return false;
  return true;
}
