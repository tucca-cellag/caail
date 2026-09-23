/**
 * search-terms.ts — load the curated search vocabulary for every matrix area and
 * method, and prove it covers exactly the axes Taxonomy.md defines.
 *
 * `search-terms.json` (committed beside this module) holds, per research area and per
 * AI/ML method, the short phrases a literature search or a relevance scorer should look
 * for: CAAIL's research phrasing plus the plain-language synonyms general science writing
 * uses instead. It ships in the agent API as `taxonomy.json` → `searchTerms`, so a tool
 * that searches for work CAAIL might index reads its vocabulary from CAAIL at run time,
 * and editing this file retunes that tool.
 *
 * ## Why the terms are curated rather than mined from the definitions
 *
 * Phrases mined from Taxonomy.md's definition prose are dominated by the prose's own
 * connective tissue ("better described", "neither half") and miss how the work is written
 * about elsewhere: "artificial intelligence", "large language model" and "protein design"
 * occur in no definition. The definitions state scope; they are not a search vocabulary.
 *
 * ## The matching contract
 *
 * Terms are written in base form, and the `contract` string in the file says how a
 * consumer must match them (case, dash variants, plural stems). It is data rather than
 * code here because the consumers live outside this repository; stating it beside the
 * terms is what lets two of them apply the same rule.
 *
 * ## Why the coverage check exists
 *
 * The file is keyed by axis label, and labels change: a row renamed in Taxonomy.md would
 * otherwise leave its terms under a key nothing reads, while the renamed row ships with
 * none, and every check stays green. So `buildSearchTerms` asserts the key sets equal the
 * live axes exactly, in both directions, and fails the build naming the difference.
 *
 * No disk writes; generate-data.ts passes the result to the agent API.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SearchTermsSchema, type SearchTerms, type TaxonomyData } from './types.js';

/** Absolute path to the committed search vocabulary, stable regardless of cwd. */
export const SEARCH_TERMS_PATH: string = fileURLToPath(
  new URL('./search-terms.json', import.meta.url),
);

/** Axes the file must cover, and where each one's live labels come from. */
const COVERED_AXES = [
  ['areas', 'area'],
  ['methods', 'method'],
] as const;

/** Unicode dashes the contract tells consumers to fold to an ASCII hyphen. */
const FOLDED_DASHES = /[‐-―−]/;

/**
 * A term as the contract expects it stored: NFKC, lowercase, trimmed, single-spaced, and
 * already dash-folded. A consumer folds the text it searches; if a stored term kept an en
 * dash it would be compared against folded text and silently match nothing.
 */
function isNormalized(term: string): boolean {
  return (
    term.length > 0 &&
    !FOLDED_DASHES.test(term) &&
    term === term.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
  );
}

/** The identity a consumer matches on: hyphen and space are the same character to it. */
function matchKey(term: string): string {
  return term.replace(/-/g, ' ');
}

/**
 * Load `search-terms.json` and check it against the live taxonomy.
 *
 * @param taxonomy  The model from buildTaxonomyModel; its `axes.area` and `axes.method`
 *                  keys are the labels the file must cover.
 * @param path      Path to the terms file (defaults to the committed one).
 * @throws          If the file fails its schema, if its area or method keys differ from
 *                  the live axes in either direction, or if a term is not in the stored
 *                  form or appears twice in one list.
 */
export function buildSearchTerms(
  taxonomy: TaxonomyData,
  path: string = SEARCH_TERMS_PATH,
): SearchTerms {
  const terms = SearchTermsSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
  const problems: string[] = [];

  for (const [field, axis] of COVERED_AXES) {
    const live = new Set(Object.keys(taxonomy.axes[axis]));
    const have = new Set(Object.keys(terms[field]));
    const missing = [...live].filter((l) => !have.has(l));
    const unknown = [...have].filter((l) => !live.has(l));
    if (missing.length > 0) {
      problems.push(`${field}: no entry for ${missing.map((l) => `"${l}"`).join(', ')}`);
    }
    if (unknown.length > 0) {
      problems.push(
        `${field}: ${unknown.map((l) => `"${l}"`).join(', ')} names no ${axis} in Taxonomy.md`,
      );
    }
  }

  const lists: Array<[where: string, list: string[]]> = [
    ['methodGeneric', terms.methodGeneric],
    ...Object.entries(terms.areas).map(([l, v]) => [`areas["${l}"]`, v] as [string, string[]]),
    ...Object.entries(terms.methods).map(([l, v]) => [`methods["${l}"]`, v] as [string, string[]]),
  ];
  for (const [where, list] of lists) {
    const bad = list.filter((t) => !isNormalized(t));
    if (bad.length > 0) {
      problems.push(
        `${where}: not lowercase/trimmed/single-spaced/dash-folded: ${bad.map((t) => `"${t}"`).join(', ')}`,
      );
    }
    // Repeats are judged as the consumer sees them, so "water-holding" and "water holding"
    // count as one term listed twice.
    const keys = list.map(matchKey);
    const dupes = list.filter((_, i) => keys.indexOf(keys[i]) !== i);
    if (dupes.length > 0) problems.push(`${where}: repeated ${dupes.map((t) => `"${t}"`).join(', ')}`);
  }

  if (problems.length > 0) {
    throw new Error(
      `search-terms: ${path} does not match the live taxonomy:\n  - ` +
        problems.join('\n  - ') +
        `\nEvery research area and AI/ML method in Taxonomy.md needs exactly one entry, keyed ` +
        `by its heading text. When a row or column is added or renamed, add or move its ` +
        `entry here in the same change. An area may hold an empty list, which says ` +
        `deliberately that it is found by method terms alone.`,
    );
  }
  return terms;
}

/**
 * The taxonomy model as the agent API serves it: the definitions plus `searchTerms`.
 * One constructor for every caller, so none can hand the API a taxonomy without the
 * vocabulary; ApiTaxonomySchema would reject it at run time, after it compiled.
 */
export function buildApiTaxonomy(
  taxonomy: TaxonomyData,
  path: string = SEARCH_TERMS_PATH,
): TaxonomyData & { searchTerms: SearchTerms } {
  return { ...taxonomy, searchTerms: buildSearchTerms(taxonomy, path) };
}
