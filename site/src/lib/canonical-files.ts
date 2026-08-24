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
 * - `src/content/loaders/caail-docs-loader.ts` does NOT, and must not be
 *   "fixed" to use it. It filters candidates through the `CAAIL_PAGES`
 *   allow-list, so an unregistered id is dropped already; the allow-list is
 *   the stronger guarantee and this predicate would hide which one is load
 *   bearing.
 */

/** Agent-instruction files, which are never part of the published corpus. */
const INSTRUCTION_FILES: ReadonlySet<string> = new Set(['CLAUDE.md']);

/** The suffix reserved for private companions (ADR-0002), gitignored. */
export const PRIVATE_COMPANION_SUFFIX = '.local.md';

/**
 * True when `name` is a Markdown file belonging to the published corpus.
 *
 * Excludes agent-instruction files and `*.local.md` private companions. Takes
 * a bare file name, not a path.
 */
export function isPublishedMarkdown(name: string): boolean {
  if (!name.endsWith('.md')) return false;
  if (INSTRUCTION_FILES.has(name)) return false;
  if (name.endsWith(PRIVATE_COMPANION_SUFFIX)) return false;
  return true;
}
