/**
 * canonical-files.ts — which files in a canonical directory are published.
 *
 * Two parser entry points enumerate the canonical directories on a bare
 * extension test: `dirMarkdown` in llms-full.ts, which inlines each match
 * VERBATIM into public/llms-full.txt, and `countMdFiles` in counts.ts, which
 * derives the homepage species and research-area counts. Both need the same
 * answer to the same question, so it is asked once here.
 *
 * `docs/adr/0002-what-the-repo-publishes.md` establishes `*.local.md` as the
 * suffix for a private companion living beside its public file. Nothing stops
 * one being created inside `Datasets/`, `ResearchAreas/`, `Methods/` or
 * `Primers/`, and without this predicate both call sites would treat it as
 * canonical content.
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
