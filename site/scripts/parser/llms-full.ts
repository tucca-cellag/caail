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
 * VERBATIM AND STOPPED BEING TRUE. One source is a Starlight page rather than
 * canonical repo-root Markdown (`site/src/content/docs/curation.mdx`). For that
 * one, and only that one, the YAML frontmatter is stripped and its `title` is
 * re-emitted as an `# H1` so the section opens the way every other section does.
 * Every repo-root source is still byte-for-byte. See `splitFrontmatter`.
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

const HEADER =
  '# CAAIL — Cellular Agriculture AI Library (full canonical text)\n\n' +
  "> Single-file concatenation of CAAIL's canonical Markdown, plus the site's " +
  'Curation Methodology page, for AI agents. Sources are reproduced as written, ' +
  'except that page, whose metadata block is replaced by its title as a heading. ' +
  'The website pages are compressed navigation summaries; this file is the ' +
  'authoritative full text. Source repository: https://github.com/tucca-cellag/caail\n';

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
  if (!m) return { title: null, body: content };

  const titleLine = /^title\s*:\s*(.+?)\s*$/m.exec(m[1]);
  const title = titleLine ? titleLine[1].replace(/^["']|["']$/g, '') : null;
  return { title, body: content.slice(m[0].length).replace(/^\s+/, '') };
}

/** Build the full llms-full.txt content from the canonical Markdown. */
export function buildLlmsFullText(repoRoot: string = REPO_ROOT): string {
  const parts = [HEADER];
  for (const rel of llmsFullSources(repoRoot)) {
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
