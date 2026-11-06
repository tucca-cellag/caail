/**
 * doi-relation.ts — say whether an item's DOI names the item itself or the paper that
 * describes it.
 *
 * A dataset, database or software entry's `doi` is, by the curation rule in
 * `caail-db-authoring`, its ASSOCIATED PUBLICATION: the paper a reader would cite for it.
 * A few are instead the deposit's own DOI, minted by a data repository (a Zenodo record, a
 * figshare item). Nothing in the API told the two apart, so a consumer matching new finds
 * against what CAAIL holds had to guess, and guessing wrong either re-queues a held deposit
 * or keys an item by a paper that also describes other things.
 *
 * The rule is the DOI's REGISTRANT (the part before the first `/`), matched exactly against
 * the data repositories below. A DOI from any other registrant is a publication. That is a
 * rule, not a lookup, so a repository missing from the list is misread as a publication:
 * add it here when one turns up. Exact matching matters because registrants are numeric
 * strings and `10.52810` is not `10.5281`.
 */

import { doiKey } from './citations.js';

/** Data-repository DOI registrants → the repository, for the reader of this file. */
export const DATA_REPOSITORY_REGISTRANTS: ReadonlyMap<string, string> = new Map([
  ['10.5281', 'Zenodo'],
  ['10.6084', 'figshare'],
  ['10.5061', 'Dryad'],
  ['10.17632', 'Mendeley Data'],
  ['10.7910', 'Harvard Dataverse'],
  ['10.17605', 'OSF'],
  ['10.5524', 'GigaDB'],
  ['10.1594', 'PANGAEA'],
]);

export type DoiRelation = 'own' | 'publication';

/**
 * `own` when the DOI's registrant is a data repository, `publication` for any other DOI,
 * and null when there is no DOI at all (or the value is not one).
 */
export function doiRelation(doi: string | null | undefined): DoiRelation | null {
  const key = doiKey(doi);
  if (!key || !/^10\.\d{4,9}\//.test(key)) return null;
  const registrant = key.slice(0, key.indexOf('/'));
  return DATA_REPOSITORY_REGISTRANTS.has(registrant) ? 'own' : 'publication';
}
