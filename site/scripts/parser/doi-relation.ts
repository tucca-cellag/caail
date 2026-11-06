/**
 * doi-relation.ts — say whether an item's DOI names the item itself or the paper that
 * describes it, and reduce a written DOI to one comparable form.
 *
 * A dataset, database or software entry's `doi` is, by the curation rule in
 * `caail-db-authoring`, its ASSOCIATED PUBLICATION: the paper a reader would cite for it.
 * A few are instead the deposit's own DOI, minted by a data repository (a Zenodo record, a
 * figshare item). Nothing in the API told the two apart, so a consumer matching new finds
 * against what CAAIL holds had to guess, and guessing wrong either re-queues a held deposit
 * or keys an item by a paper that also describes other things.
 *
 * The rule is the DOI's REGISTRANT (the part before the first `/`), matched exactly against
 * the data hosts below. A DOI from any other registrant is a publication. That is a rule,
 * not a lookup, and it has two known limits: a host missing from the list is read as a
 * publication (add it here when one turns up), and a repository that also mints DOIs for
 * reports or preprints (Zenodo does) reads those as the item's own. Exact matching matters
 * because registrants are numeric strings and `10.52810` is not `10.5281`.
 */

import { doiKey } from './citations.js';

/** Data-host DOI registrants → the host, for the reader of this file. */
export const DATA_REPOSITORY_REGISTRANTS: ReadonlyMap<string, string> = new Map([
  ['10.5281', 'Zenodo'],
  ['10.6084', 'figshare'],
  ['10.5061', 'Dryad'],
  ['10.17632', 'Mendeley Data'],
  ['10.7910', 'Harvard Dataverse'],
  ['10.17605', 'OSF'],
  ['10.5524', 'GigaDB'],
  ['10.1594', 'PANGAEA'],
  ['10.57967', 'Hugging Face'],
  ['10.34740', 'Kaggle'],
  ['10.7303', 'Synapse'],
  ['10.24433', 'Code Ocean'],
]);

export type DoiRelation = 'own' | 'publication';

/**
 * A validated bare DOI: decode once, normalise with `doiKey` (the rule every citation and
 * author join already uses, so the two cannot disagree), then require the `10.NNNN/…`
 * shape. Null when the value is not a DOI.
 */
export function bareDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  try { v = decodeURIComponent(v); } catch { /* a stray % is not an encoding; keep the text */ }
  const key = doiKey(v);
  return key && /^10\.\d{4,9}\/\S+$/.test(key) ? key : null;
}

/**
 * `own` when the DOI's registrant is a data host, `publication` for any other DOI, and null
 * when there is no DOI at all (or the value is not one).
 */
export function doiRelation(doi: string | null | undefined): DoiRelation | null {
  const key = bareDoi(doi);
  if (!key) return null;
  return DATA_REPOSITORY_REGISTRANTS.has(key.slice(0, key.indexOf('/'))) ? 'own' : 'publication';
}
