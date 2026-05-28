/**
 * counts.ts — computes the six homepage aggregate counts for counts.json.
 *
 * Takes an already-built PapersData model (so `papers` = model.references.length)
 * and reads the repo-root corpus files to compute the remaining five:
 *   - software      H3 headings in Software.md
 *   - databases     H3 headings in Databases.md
 *   - species       *.md files in Datasets/ (excluding README.md, CLAUDE.md)
 *   - researchAreas *.md files in ResearchAreas/ (excluding CLAUDE.md)
 *   - talks         list-item links under `## YouTube Videos` in OtherResources.md
 *
 * The result is validated with CountsSchema.parse() before returning so a
 * shape regression throws here rather than downstream at build time.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visit } from 'unist-util-visit';
import type { Root, Heading, ListItem } from 'mdast';

import { parseMarkdown, sectionsAfter } from './markdown.js';
import { CountsSchema, type Counts, type PapersData } from './types.js';

// ---------------------------------------------------------------------------
// Repo-root resolution
// ---------------------------------------------------------------------------

/**
 * Default repo root: three levels up from this module's location.
 * parser/ → scripts/ → site/ → repo root
 */
const DEFAULT_REPO_ROOT: string = fileURLToPath(
  new URL('../../../', import.meta.url),
);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Count top-level `heading` nodes of depth === 3 in a parsed mdast Root.
 */
function countH3Headings(root: Root): number {
  let count = 0;
  for (const node of root.children) {
    if (node.type === 'heading' && (node as Heading).depth === 3) {
      count++;
    }
  }
  return count;
}

/**
 * Count list-item links under the first `## YouTube Videos` section in
 * OtherResources.md, stopping at the next `##` heading.
 *
 * "A list-item link" = a `listItem` node that contains at least one `link`
 * child (anywhere in its subtree). We count list items with links rather than
 * counting raw links so that a list item with multiple links still counts once.
 */
function countYouTubeVideos(root: Root): number {
  // Use sectionsAfter at depth 2 to isolate `## YouTube Videos`.
  const sections = sectionsAfter(root, 2);
  const youtubeSection = sections.find(
    (s) => s.heading.trim() === 'YouTube Videos',
  );
  if (!youtubeSection) return 0;

  let count = 0;
  for (const node of youtubeSection.nodes) {
    if (node.type !== 'list') continue;
    // Walk list items; count each that contains at least one link node.
    visit(node, 'listItem', (item: ListItem) => {
      let hasLink = false;
      visit(item, 'link', () => {
        hasLink = true;
      });
      if (hasLink) count++;
    });
  }
  return count;
}

/**
 * Count *.md files in `dir`, excluding the given names (case-sensitive).
 */
function countMdFiles(dir: string, exclude: string[]): number {
  const excludeSet = new Set(exclude);
  const entries = readdirSync(dir);
  return entries.filter(
    (name) => name.endsWith('.md') && !excludeSet.has(name),
  ).length;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute the six homepage counts given an already-built PapersData model
 * and the repo root directory.
 *
 * @param model     Validated PapersData (from buildPapersModel)
 * @param repoRoot  Absolute path to the repository root (defaults to the
 *                  canonical repo root resolved from this module's location).
 *                  Override in tests to point at a fixture directory.
 * @returns         A validated Counts object.
 */
export function computeCounts(
  model: PapersData,
  repoRoot: string = DEFAULT_REPO_ROOT,
): Counts {
  // --- papers ---
  const papers = model.references.length;

  // --- software: H3 headings in Software.md ---
  const softwareSrc = readFileSync(join(repoRoot, 'Software.md'), 'utf-8');
  const software = countH3Headings(parseMarkdown(softwareSrc));

  // --- databases: H3 headings in Databases.md ---
  const databasesSrc = readFileSync(join(repoRoot, 'Databases.md'), 'utf-8');
  const databases = countH3Headings(parseMarkdown(databasesSrc));

  // --- species: *.md pages in Datasets/ excluding README.md and CLAUDE.md ---
  const species = countMdFiles(join(repoRoot, 'Datasets'), [
    'README.md',
    'CLAUDE.md',
  ]);

  // --- researchAreas: *.md files in ResearchAreas/ excluding CLAUDE.md ---
  const researchAreas = countMdFiles(join(repoRoot, 'ResearchAreas'), [
    'CLAUDE.md',
  ]);

  // --- talks: list-item links under ## YouTube Videos in OtherResources.md ---
  const otherResourcesSrc = readFileSync(
    join(repoRoot, 'OtherResources.md'),
    'utf-8',
  );
  const talks = countYouTubeVideos(parseMarkdown(otherResourcesSrc));

  const result: Counts = {
    papers,
    software,
    databases,
    species,
    researchAreas,
    talks,
  };

  // Validate before returning — shape regressions throw here, not downstream.
  return CountsSchema.parse(result);
}
