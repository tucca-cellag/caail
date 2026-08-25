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
 * Split a leading YAML frontmatter block off a source file.
 *
 * Every canonical repo-root source here is plain Markdown with no frontmatter, so this is a
 * no-op for all of them. It exists for the one Starlight page in the list, whose `title:` and
 * `description:` would otherwise be concatenated in as body prose: `buildLlmsFullText` inlines
 * RAW BYTES, so an agent fetching llms-full.txt reads the YAML as content.
 *
 * THE SHAPE CHECK IS NOT BELT-AND-BRACES, IT IS THE WHOLE CORRECTNESS ARGUMENT. `---` is also
 * `<hr>` in Markdown, and this function runs over ~45 canonical files it must not touch. An
 * earlier version anchored to the start and required a closing fence, which sounds sufficient
 * and is not: on `---\n\nIntro paragraph.\n\n---\n\nMore text.` the lazy body matches through
 * to the SECOND rule and the intro paragraph is silently deleted from the agent-facing
 * artifact. Requiring the captured block to look like YAML — every non-blank line a `key:`, a
 * continuation, or a comment, and at least one real key — is what tells the two apart, because
 * a prose paragraph has no colon-terminated key at the start of a line.
 */
export function splitFrontmatter(content: string): { title: string | null; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!m) return { title: null, body: content };

  const block = m[1];
  const lines = block.split(/\r?\n/);
  const isYamlish = (l: string) =>
    l.trim() === '' || l.trimStart().startsWith('#') || /^\s+\S/.test(l) || /^[A-Za-z_][\w.-]*\s*:/.test(l);
  const hasKey = lines.some((l) => /^[A-Za-z_][\w.-]*\s*:/.test(l));
  if (!hasKey || !lines.every(isYamlish)) return { title: null, body: content };

  const titleLine = /^title\s*:\s*(.+?)\s*$/m.exec(block);
  const title = titleLine ? titleLine[1].replace(/^["']|["']$/g, '') : null;
  return { title, body: content.slice(m[0].length).replace(/^\s+/, '') };
}

/** Build the full llms-full.txt content from the canonical Markdown. */
export function buildLlmsFullText(repoRoot: string = REPO_ROOT): string {
  const parts = [HEADER];
  for (const rel of llmsFullSources(repoRoot)) {
    const { title, body } = splitFrontmatter(readFileSync(join(repoRoot, rel), 'utf-8'));
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
