/**
 * taxonomy.ts — turns the canonical Taxonomy.md into a validated TaxonomyData
 * model: a `label → definition` map for every matrix row and column.
 *
 * Taxonomy.md is the single source of truth for what each matrix axis means.
 * The Papers Explorer shows these definitions in a hover/click popup, so the
 * text has to be available client-side; extracting it here (rather than
 * hard-coding it in the component) keeps the popup in lock-step with the
 * canonical file — a renamed row can't silently drift from its definition.
 *
 * Each `### Heading` in Taxonomy.md is a row or column whose heading text
 * matches the matrix label in Papers.md exactly (e.g. "GNN", "GAN / VAE",
 * "Bioprocess & Scale-Up"). We split on those H3 headings via `sectionsAfter`
 * and flatten the following paragraph(s) to plain text — markdown emphasis is
 * dropped, which is fine for a tooltip.
 *
 * No disk writes — emitting taxonomy.json is generate-data.ts's job. The
 * every-matrix-label-has-a-definition cross-check also lives there, where the
 * Papers.md methods/areas are in scope.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toString as mdToString } from 'mdast-util-to-string';

import { parseMarkdown, sectionsAfter } from './markdown.js';
import { TaxonomyDataSchema, type TaxonomyData } from './types.js';

/**
 * Absolute path to the canonical repo-root Taxonomy.md, resolved from this
 * module's location (parser → scripts → site → repo root), stable regardless
 * of cwd — mirrors PAPERS_MD_PATH in papers.ts.
 */
export const TAXONOMY_MD_PATH: string = fileURLToPath(
  new URL('../../../Taxonomy.md', import.meta.url),
);

/**
 * Build the validated TaxonomyData model from a Taxonomy.md file.
 *
 * Every `### Heading` becomes one `definitions[heading]` entry whose value is
 * the heading's paragraph prose flattened to plain text. The H2 section
 * headers ("Research areas (columns)", "AI/ML methods (rows)") are depth-2 and
 * so don't start an H3 section — they cleanly separate the two groups.
 *
 * @param taxonomyPath  Path to Taxonomy.md (defaults to the repo-root file).
 * @returns             A schema-validated TaxonomyData object.
 */
export function buildTaxonomyModel(
  taxonomyPath: string = TAXONOMY_MD_PATH,
): TaxonomyData {
  const src = readFileSync(taxonomyPath, 'utf-8');
  const root = parseMarkdown(src);

  const definitions: Record<string, string> = {};

  for (const { heading, nodes } of sectionsAfter(root, 3)) {
    // Flatten only the prose paragraphs under the heading; join multi-paragraph
    // definitions with a single space so the popup reads as one block.
    const text = nodes
      .filter((n) => n.type === 'paragraph')
      // Collapse the source's hard line-wrapping (and any inner runs) to single
      // spaces so the stored definition is one clean line per paragraph.
      .map((n) => mdToString(n).replace(/\s+/g, ' ').trim())
      .filter((t) => t.length > 0)
      .join(' ')
      .trim();

    if (text.length > 0) {
      definitions[heading] = text;
    }
  }

  return TaxonomyDataSchema.parse({ definitions });
}
