/**
 * search-terms.ts: load the curated search vocabulary for every matrix area and
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

import { ZodError } from 'zod';

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

/**
 * The contract's regular plural rules, one row each. `name` is the wording the contract uses;
 * a test asserts the committed contract names every row, so the rules the duplicate check
 * applies and the rules consumers are told to apply cannot drift apart unnoticed.
 */
export const PLURAL_RULES: ReadonlyArray<{ name: string; plural: (w: string) => string | null }> = [
  { name: '+s', plural: (w) => `${w}s` },
  { name: '+es', plural: (w) => `${w}es` },
  { name: 'y to ies', plural: (w) => (w.endsWith('y') ? `${w.slice(0, -1)}ies` : null) },
  { name: 'is to es', plural: (w) => (w.endsWith('is') ? `${w.slice(0, -2)}es` : null) },
  { name: 'ix to ices', plural: (w) => (w.endsWith('ix') ? `${w.slice(0, -2)}ices` : null) },
];

/** A word's regular plurals under PLURAL_RULES. */
function pluralsOf(word: string): string[] {
  return PLURAL_RULES.map((r) => r.plural(word)).filter((f): f is string => f !== null);
}

/**
 * Whether a consumer following the contract would treat two stored terms as one: hyphen and
 * space are the same, and each word may stand for its regular plural.
 */
function sameToConsumer(a: string, b: string): boolean {
  const wa = a.split(/[ -]/);
  const wb = b.split(/[ -]/);
  return (
    wa.length === wb.length &&
    wa.every((w, i) => w === wb[i] || pluralsOf(w).includes(wb[i]) || pluralsOf(wb[i]).includes(w))
  );
}

/**
 * Load `search-terms.json` and check it against the live taxonomy.
 *
 * @param taxonomy  The model from buildTaxonomyModel; its `axes.area` and `axes.method`
 *                  keys are the labels the file must cover.
 * @param path      Path to the terms file (defaults to the committed one).
 * @throws          If the file fails its schema, if its area or method keys differ from
 *                  the live axes in either direction, or if a term appears twice in one list
 *                  as a consumer reads it. Every failure names the file.
 */
export function buildSearchTerms(
  taxonomy: TaxonomyData,
  path: string = SEARCH_TERMS_PATH,
): SearchTerms {
  let terms: SearchTerms;
  try {
    terms = SearchTermsSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
  } catch (err) {
    // Name the file on every failure, not only the checks below. A ZodError's own message is
    // its issues JSON-encoded, which escapes the quotes each term is shown in, so list them.
    const detail =
      err instanceof ZodError
        ? err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message} (${i.code})`).join('\n  - ')
        : String(err);
    throw new Error(`search-terms: ${path} failed to load:\n  - ${detail}`);
  }
  const coverage: string[] = [];
  const form: string[] = [];

  for (const [field, axis] of COVERED_AXES) {
    const live = new Set(Object.keys(taxonomy.axes[axis]));
    const have = new Set(Object.keys(terms[field]));
    const missing = [...live].filter((l) => !have.has(l));
    const unknown = [...have].filter((l) => !live.has(l));
    if (missing.length > 0) {
      coverage.push(`${field}: no entry for ${missing.map((l) => `"${l}"`).join(', ')}`);
    }
    if (unknown.length > 0) {
      coverage.push(
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
    // Repeats are judged as the consumer sees them, so "water-holding" and "water holding",
    // or "cell line" and "cell lines", count as one term listed twice.
    const dupes = list.filter((t, i) => list.slice(0, i).some((earlier) => sameToConsumer(earlier, t)));
    if (dupes.length > 0) form.push(`${where}: repeated ${dupes.map((t) => `"${t}"`).join(', ')}`);
  }

  const sections: string[] = [];
  if (coverage.length > 0) {
    sections.push(
      `does not match the live taxonomy:\n  - ${coverage.join('\n  - ')}\n` +
        `Every research area and AI/ML method in Taxonomy.md needs exactly one entry, keyed by ` +
        `its heading text. When a row or column is added or renamed, add or move its entry ` +
        `here in the same change. An area may hold an empty list, which says deliberately that ` +
        `term matching never assigns it.`,
    );
  }
  if (form.length > 0) {
    sections.push(
      `has terms the matching contract cannot use:\n  - ${form.join('\n  - ')}\n` +
        `List each term once; a consumer treats hyphen and space, and a word and its regular ` +
        `plural, as the same term.`,
    );
  }
  if (sections.length > 0) throw new Error(`search-terms: ${path} ${sections.join('\nIt also ')}`);
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
