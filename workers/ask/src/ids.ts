/**
 * Entry ids: the identifier each indexed item is recorded under, and the vector
 * id it is stored under in Vectorize.
 *
 * An entry id is the item's own frozen id where the published API serves one
 * (`sw:`, `db:`, `ds:`, `report:`), `paper:<n>` for a reference, and a derived
 * id for the two kinds the API serves without one: a taxonomy term and a study
 * whose data are shared only on request. These are what a question record lists
 * as cited, so they have to stay stable across index rebuilds.
 *
 * Pure: the Worker and the index build both import it.
 */

export function paperItemId(id: number): string {
  return `paper:${id}`;
}

/**
 * GitHub's heading slug, which Starlight also gives the rendered Taxonomy.md
 * headings. A copy of `ghSlug` in site/src/lib/axis-links.ts, which cannot be
 * imported here because it reads `import.meta.env` when loaded; corpus.test.ts
 * runs both over every taxonomy label.
 */
export function taxonomySlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/ /g, '-');
}

export function termItemId(label: string): string {
  return `term:${taxonomySlug(label)}`;
}

/**
 * A study listed as having data only on request carries no id in the API, so
 * its paper's DOI names it. The DOI is lowercased because DOIs are matched
 * without regard to case.
 */
export function onRequestItemId(paperDoi: string): string {
  return `onrequest:${paperDoi.toLowerCase()}`;
}

/**
 * The vector id for an entry: the first 32 hex digits of the SHA-256 of its entry
 * id. Vectorize caps a vector id at 64 bytes and some dataset ids are longer, so
 * every id is hashed rather than only the long ones, which keeps one rule. The
 * entry id itself travels in the vector's metadata.
 */
export async function vectorId(itemId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(itemId));
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
