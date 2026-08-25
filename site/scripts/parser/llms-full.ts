/**
 * llms-full.ts — generates public/llms-full.txt, the llmstxt.org "expanded"
 * full-text index for AI agents.
 *
 * CAAIL's site pages are deliberately compressed navigation summaries; the
 * authoritative full text is the canonical Markdown in the repo root. This
 * concatenates that Markdown VERBATIM (one fetch = the whole library) with a
 * short header and a `# ===== <path> =====` delimiter per file. CLAUDE.md agent
 * files are excluded — they're instructions, not library content.
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
  "> Single-file concatenation of CAAIL's canonical Markdown, for AI agents. " +
  'The website pages are compressed navigation summaries; this file is the ' +
  'authoritative full text. Source repository: https://github.com/tucca-cellag/caail\n';

/**
 * Drop a leading YAML frontmatter block.
 *
 * Every canonical repo-root source here is plain Markdown with no frontmatter, so this is a
 * no-op for all of them. It exists for the one Starlight page in the list, whose `title:` and
 * `description:` would otherwise be concatenated in as body prose: this function inlines RAW
 * BYTES, so an agent fetching llms-full.txt reads the YAML as content. The heading delimiter
 * above already states the path, which is what the title would have told it.
 *
 * Anchored to the very start and requiring the closing fence, so a horizontal rule (`---`) in
 * ordinary Markdown, or a file that merely opens with one, is left alone.
 */
export function stripFrontmatter(content: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
  return m ? content.slice(m[0].length).replace(/^\s+/, '') : content;
}

/** Build the full llms-full.txt content from the canonical Markdown. */
export function buildLlmsFullText(repoRoot: string = REPO_ROOT): string {
  const parts = [HEADER];
  for (const rel of llmsFullSources(repoRoot)) {
    const content = stripFrontmatter(readFileSync(join(repoRoot, rel), 'utf-8')).trimEnd();
    parts.push(`\n\n# ===== ${rel} =====\n\n${content}\n`);
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
