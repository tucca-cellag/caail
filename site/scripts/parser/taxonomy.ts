/**
 * taxonomy.ts — turns the canonical Taxonomy.md into a validated TaxonomyData
 * model: per-axis `label → definition` maps, plus a flat matrix lookup.
 *
 * Taxonomy.md is the single source of truth for what each matrix axis means.
 * The Papers Explorer shows these definitions in a hover/click popup, and the
 * agent API serves them as `taxonomy.json` ("read before trusting a
 * placement"), so the text has to be available outside the Markdown. Extracting
 * it here (rather than hard-coding it in the component) keeps both in lock-step
 * with the canonical file — a renamed row can't silently drift.
 *
 * ## Why definitions are keyed by axis and not by heading text alone
 *
 * Taxonomy.md defines three *separate* vocabularies under three H2 sections:
 * research areas (matrix columns), AI/ML methods (matrix rows), and subject
 * themes (topic tags). Sharing a label across two of them is legal here, and
 * this keying is what makes it safe.
 *
 * The clash that motivated this — a `Bioprocess & Scale-Up` column beside a
 * `Bioprocess & Scale-Up` theme — no longer exists: ADR-0001 renamed the theme
 * to `Bioprocess & Manufacturing` and wrote a naming convention into Taxonomy.md
 * saying no label may appear on both subject axes. This module predates that and
 * is kept anyway, as defence in depth rather than as the only defence: the
 * convention is prose that a future editor can breach in one keystroke, and the
 * failure it produces is silent (see below). Axis-keying makes that breach
 * harmless instead of catastrophic.
 *
 * An earlier version flattened every `### Heading` into one map, so the later
 * heading won. The theme blurb (two lines, no scope boundaries, ending in a
 * self-reference) silently replaced the column scope (explicit in-scope and
 * out-of-scope criteria) for a column carrying 29 primary references, and
 * `taxonomy.json` shipped 39 definitions where the file held 40. Nothing
 * caught it: the downstream guard asserted the label had a *non-empty*
 * definition, and it did — just the wrong one.
 *
 * So: uniqueness is enforced *within* an axis, sharing is allowed *across*
 * axes, and every lookup must name the axis it means. `definitions` remains a
 * flat map for the matrix lookup callers already do, but it now covers areas
 * and methods only, and building it asserts those two do not collide with each
 * other (which would make the flat map ambiguous again by a different route).
 *
 * No disk writes — emitting taxonomy.json is generate-data.ts's job. The
 * every-matrix-label-has-a-definition cross-check also lives there, where the
 * Papers.md methods/areas are in scope.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Root } from 'mdast';
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

/** The three vocabularies Taxonomy.md defines. */
export type TaxonomyAxis = 'area' | 'method' | 'theme';

/**
 * Taxonomy.md's H2 group headings → the vocabulary each one defines.
 *
 * This is the axis assignment, and it is deliberately an exact-match table
 * rather than a heuristic: a new H2 that carries definitions fails the build
 * with a message naming this constant, so adding a fourth vocabulary is a
 * decision someone makes rather than one that happens.
 */
const AXIS_BY_SECTION: ReadonlyMap<string, TaxonomyAxis> = new Map([
  ['Research areas (columns)', 'area'],
  ['AI/ML methods (rows)', 'method'],
  ['Subject themes (topic tags)', 'theme'],
]);

/** Flatten a heading's prose paragraphs to one clean plain-text line. */
function flattenDefinition(nodes: readonly { type: string }[]): string {
  return nodes
    .filter((n) => n.type === 'paragraph')
    // Collapse the source's hard line-wrapping (and any inner runs) to single
    // spaces so the stored definition is one clean line per paragraph.
    .map((n) => mdToString(n).replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 0)
    .join(' ')
    .trim();
}

/**
 * Build the validated TaxonomyData model from a Taxonomy.md file.
 *
 * Each `## Group` is one axis (see AXIS_BY_SECTION) and each `### Heading`
 * beneath it is one definition in that axis, valued at the heading's prose
 * flattened to plain text.
 *
 * @param taxonomyPath  Path to Taxonomy.md (defaults to the repo-root file).
 * @returns             A schema-validated TaxonomyData object.
 * @throws              If a heading is defined twice within one axis, if an
 *                      area and a method share a label, or if definitions
 *                      appear under an H2 that AXIS_BY_SECTION does not map.
 */
export function buildTaxonomyModel(
  taxonomyPath: string = TAXONOMY_MD_PATH,
): TaxonomyData {
  const src = readFileSync(taxonomyPath, 'utf-8');
  const root = parseMarkdown(src);

  const axes: Record<TaxonomyAxis, Record<string, string>> = {
    area: {},
    method: {},
    theme: {},
  };

  for (const group of sectionsAfter(root, 2)) {
    // Re-split this H2's contents on its H3 headings, reusing the same helper
    // rather than hand-rolling a second walk.
    const sections = sectionsAfter(
      { type: 'root', children: group.nodes } as Root,
      3,
    );

    // Flatten before deciding whether this section defines anything, so
    // "carries definitions" means what it says. `flattenDefinition` keeps only
    // paragraphs, so an H3 whose body is a list or a table contributes nothing
    // and must not make an unmapped H2 look like a vocabulary.
    const defined = sections
      .map(({ heading, nodes }) => ({ heading, text: flattenDefinition(nodes) }))
      .filter(({ text }) => text.length > 0);

    const axis = AXIS_BY_SECTION.get(group.heading);
    if (axis === undefined) {
      // An H2 with no definitions under it is just prose, and fine. One that
      // carries definitions has no axis to file them under, and guessing is
      // how the original collision would come back.
      if (defined.length === 0) continue;
      throw new Error(
        `taxonomy: "## ${group.heading}" carries ${defined.length} "###" ` +
          `definition(s) but is not a known axis. Taxonomy.md defines three ` +
          `vocabularies: ${[...AXIS_BY_SECTION.keys()].map((k) => `"${k}"`).join(', ')}. ` +
          `Add the new section to AXIS_BY_SECTION in ${'scripts/parser/taxonomy.ts'} ` +
          `and decide which vocabulary it defines.`,
      );
    }

    const bucket = axes[axis];
    for (const { heading, text } of defined) {
      if (bucket[heading] !== undefined) {
        throw new Error(
          `taxonomy: "### ${heading}" is defined twice under ` +
            `"## ${group.heading}". Labels may repeat across axes (a column and ` +
            `a theme can share a name) but must be unique within one, or a ` +
            `lookup silently resolves to whichever came last.`,
        );
      }
      bucket[heading] = text;
    }
  }

  // The flat matrix lookup: areas + methods, which is what a Papers.md label
  // can be. Themes are reachable only via `axes.theme`, so a theme can never
  // again answer a question about a column.
  const definitions: Record<string, string> = { ...axes.area };
  for (const [label, text] of Object.entries(axes.method)) {
    if (definitions[label] !== undefined) {
      throw new Error(
        `taxonomy: "${label}" is both a research area and an AI/ML method. ` +
          `The two share the flat matrix lookup, so a shared label makes it ` +
          `ambiguous. Rename one, or split the lookup by axis at every caller.`,
      );
    }
    definitions[label] = text;
  }

  return TaxonomyDataSchema.parse({ definitions, axes });
}
