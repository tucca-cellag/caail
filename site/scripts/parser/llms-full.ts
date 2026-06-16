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

/** Repo root: parser → scripts → site → repo (three levels up). */
const REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));
/** site/public/ (two levels up from parser/, then into public/). */
const PUBLIC_DIR: string = fileURLToPath(new URL('../../public/', import.meta.url));

/** Sorted `.md` files in a canonical dir, README first, CLAUDE.md excluded. */
function dirMarkdown(repoRoot: string, dir: string): string[] {
  return readdirSync(join(repoRoot, dir))
    .filter((f) => f.endsWith('.md') && f !== 'CLAUDE.md')
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
    ...dirMarkdown(repoRoot, 'Primers'),
    'OtherResources.md',
    'Funding.md',
    'ReferenceWorks.md',
    'AwesomeLists.md',
    'Talks.md',
    'CONTRIBUTING.md',
  ];
}

const HEADER =
  '# CAAIL — Cellular Agriculture AI Library (full canonical text)\n\n' +
  "> Single-file concatenation of CAAIL's canonical Markdown, for AI agents. " +
  'The website pages are compressed navigation summaries; this file is the ' +
  'authoritative full text. Source repository: https://github.com/tucca-cellag/caail\n';

/** Build the full llms-full.txt content from the canonical Markdown. */
export function buildLlmsFullText(repoRoot: string = REPO_ROOT): string {
  const parts = [HEADER];
  for (const rel of llmsFullSources(repoRoot)) {
    const content = readFileSync(join(repoRoot, rel), 'utf-8').trimEnd();
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
