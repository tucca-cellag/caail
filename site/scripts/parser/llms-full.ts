/**
 * llms-full.ts — generates public/llms-full.txt, the llmstxt.org "expanded"
 * full-text index for AI agents.
 *
 * CAAIL's site pages are deliberately compressed navigation summaries; the
 * authoritative full text is the canonical Markdown in the repo root. This
 * concatenates that Markdown (one fetch = the whole library) with a short header
 * and a `# ===== <path> =====` delimiter per file. CLAUDE.md agent files are
 * excluded — they're instructions, not library content.
 *
 * NOT QUITE VERBATIM, AND THE EXCEPTION IS NAMED HERE BECAUSE IT USED TO SAY
 * VERBATIM AND STOPPED BEING TRUE. Sources under `site/src/content/` are
 * Starlight pages rather than canonical repo-root Markdown; for those the YAML
 * frontmatter is stripped and the `title` is re-emitted as an `# H1`, so the
 * section opens the way every other section does. Every repo-root source is
 * still byte-for-byte. The served header names which pages those are, derived
 * rather than typed, so this comment cannot go stale when a second one is added.
 * See `splitFrontmatter` and `buildHeader`.
 *
 * The build core (`buildLlmsFullText`) is pure and reads only; the file write
 * is invoked from generate-data.ts's CLI block (like the other parser output).
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPublishedMarkdown } from '../../src/lib/canonical-files.js';

/** Repo root: parser → scripts → site → repo (three levels up). */
const REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));
/** site/public/ (two levels up from parser/, then into public/). */
const PUBLIC_DIR: string = fileURLToPath(new URL('../../public/', import.meta.url));

/**
 * Sorted published `.md` files in a canonical dir, README first.
 *
 * `isPublishedMarkdown` excludes CLAUDE.md and `*.local.md` private
 * companions; each match is inlined verbatim below, so a companion admitted
 * here would be concatenated into the served llms-full.txt.
 */
function dirMarkdown(repoRoot: string, dir: string): string[] {
  return readdirSync(join(repoRoot, dir))
    .filter(isPublishedMarkdown)
    .sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : a.localeCompare(b)))
    .map((f) => `${dir}/${f}`);
}

/** Ordered list of canonical source files (relative to repo root). */
export function llmsFullSources(repoRoot: string = REPO_ROOT): string[] {
  return [
    'README.md',
    'Papers.md',
    'Software.md',
    'Databases.md',
    ...dirMarkdown(repoRoot, 'Datasets'),
    ...dirMarkdown(repoRoot, 'ResearchAreas'),
    ...dirMarkdown(repoRoot, 'Methods'),
    ...dirMarkdown(repoRoot, 'Primers'),
    'OtherResources.md',
    'Funding.md',
    'ReferenceWorks.md',
    'AwesomeLists.md',
    'Talks.md',
    'CONTRIBUTING.md',
    'Community.md',
    'site/src/content/docs/curation.mdx',
  ];
}

/**
 * The served header, with the frontmatter caveat DERIVED from the source list.
 *
 * `FRONTMATTER_PREFIX` is a prefix test precisely so a second Starlight page can join the
 * list. The moment one does, a hardcoded "that page, and only that one" is false and nothing
 * fails, since `llms-full.test.ts` asserts only the first line. This docstring's own history
 * is the argument: the sentence above it said VERBATIM until this branch made it untrue.
 */
function buildHeader(sources: string[]): string {
  const withFrontmatter = sources.filter((s) => s.startsWith(FRONTMATTER_PREFIX));
  const caveat = withFrontmatter.length
    ? `Sources are reproduced as written, except ${withFrontmatter.length === 1 ? 'one site page' : `${withFrontmatter.length} site pages`} (${withFrontmatter.join(', ')}), whose metadata block is replaced by the page title as a heading. `
    : 'Sources are reproduced as written. ';
  return (
    '# CAAIL — Cellular Agriculture AI Library (full canonical text)\n\n' +
    "> Single-file concatenation of CAAIL's canonical Markdown, for AI agents. " +
    caveat +
    'The website pages are compressed navigation summaries; this file is the ' +
    'authoritative full text. Source repository: https://github.com/tucca-cellag/caail\n'
  );
}

/**
 * Sources whose leading `---` block is frontmatter rather than a horizontal rule.
 *
 * A PATH TEST, NOT A CONTENT TEST, and that is the entire correctness argument. Two previous
 * versions tried to recognise frontmatter by looking at it and both were wrong in both
 * directions:
 *
 *   1. "anchored to the start, closing fence required" silently deleted the first paragraph of
 *      `---\n\nIntro.\n\n---\n\nMore.`, because the lazy body ran to the SECOND rule.
 *   2. "…and every line must look like YAML" still deleted `---\n\nNote: this is important.
 *      \n\n---\n\nBody.`, because `Note:` satisfies a `key:` pattern — and it REJECTED a real
 *      Starlight block sequence (`head:` / `- tag: meta`), because `- tag:` starts at column 0
 *      with a dash. Prose that looks like YAML and YAML that looks like prose both exist.
 *
 * Nothing about the bytes distinguishes the two cases reliably, so this does not try. Only
 * Starlight content pages carry frontmatter, Starlight REQUIRES it, and no canonical repo-root
 * Markdown has any — so the path answers the question exactly and the ~45 canonical files are
 * never examined at all. A `---` rule in Papers.md is now unreachable by this code rather than
 * defended against by a heuristic.
 */
const FRONTMATTER_PREFIX = 'site/src/content/';

/**
 * Split the leading YAML frontmatter off a Starlight content page.
 *
 * `buildLlmsFullText` inlines RAW BYTES, so an unstripped `title:` / `description:` block
 * reaches an agent as body prose. `rel` is the repo-relative source path and decides whether
 * this file may be touched at all; see FRONTMATTER_PREFIX for why that is a path test.
 */
export function splitFrontmatter(
  content: string,
  rel: string,
): { title: string | null; body: string } {
  if (!rel.startsWith(FRONTMATTER_PREFIX)) return { title: null, body: content };

  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  const titleLine = m ? /^title\s*:\s*(.+?)\s*$/m.exec(m[1]) : null;
  const title = titleLine ? titleLine[1].replace(/^["']|["']$/g, '') : null;
  const rest = m ? content.slice(m[0].length).replace(/^\s+/, '') : content;
  return { title, body: flattenDirectives(rest) };
}

/**
 * Turn Starlight container directives into plain Markdown.
 *
 * `:::caution[Entries are drafted by AI agents]` is markup only Starlight renders. Inlined
 * raw, an agent reads the fence instead of an emphasised line — and on this page that line is
 * the AI-drafting disclosure, which is both the most important sentence on it and the one the
 * e2e suite pins as must-be-above-the-fold. Five review rounds raised this before it was
 * fixed. The argument for leaving it was that the TEXT survives, which is true, and is a
 * weaker property than the text arriving as prose.
 *
 * SAFE ONLY BECAUSE THE CALLER ALREADY GATED ON PATH. This runs after the
 * `FRONTMATTER_PREFIX` check, so it can never reach a canonical repo-root file — where a line
 * beginning `:::` is ordinary text and rewriting it would be the same class of damage the two
 * frontmatter heuristics did. Do not lift it out of that branch.
 */
function flattenDirectives(body: string): string {
  return body
    .split('\n')
    .map((line) => {
      const open = /^:::[a-z]+(?:\[(.*)\])?\s*$/i.exec(line);
      if (open) return open[1] ? `**${open[1]}**` : '';
      return /^:::\s*$/.test(line) ? '' : line;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** Build the full llms-full.txt content from the canonical Markdown. */
export function buildLlmsFullText(repoRoot: string = REPO_ROOT): string {
  // One list, computed once and handed to both. Recomputing it inside buildHeader re-ran four
  // readdirSync passes and, worse, let the header describe a different set than the body
  // concatenates — the exact invariant buildHeader exists to hold.
  const sources = llmsFullSources(repoRoot);
  const parts = [buildHeader(sources)];
  for (const rel of sources) {
    const { title, body } = splitFrontmatter(readFileSync(join(repoRoot, rel), 'utf-8'), rel);
    // Every canonical source opens with its own `# H1`, which is how a reader of the
    // concatenated file knows what a section is. A frontmatter page has its title in the
    // metadata instead, so re-emit it rather than letting the section be identified only by
    // a path: `site/src/content/docs/curation.mdx` does not say "Curation Methodology".
    const heading = title ? `# ${title}\n\n` : '';
    parts.push(`\n\n# ===== ${rel} =====\n\n${heading}${body.trimEnd()}\n`);
  }
  return parts.join('');
}

/** Write public/llms-full.txt; returns the byte length written. */
export function writeLlmsFull(
  outDir: string = PUBLIC_DIR,
  repoRoot: string = REPO_ROOT,
): number {
  const text = buildLlmsFullText(repoRoot);
  writeFileSync(join(outDir, 'llms-full.txt'), text, 'utf-8');
  return text.length;
}
