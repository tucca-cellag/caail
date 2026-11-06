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
import type { DoiRelation } from './types.js';

/**
 * The shape of a bare DOI: `10.`, a registrant (dotted subdivisions allowed, as in
 * `10.1000.1`), `/`, a suffix. The parser and db:check share it. `src/lib/report-compose.ts`
 * still keeps an older regex of its own, tracked in tucca-cellag/caail-planning#173.
 */
export const DOI_SHAPE = /^10\.\d{4,9}(?:\.\d+)*\/\S+$/;

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

export type { DoiRelation };

/**
 * A validated bare DOI: `doiKey` (the rule every citation and author join already uses, so
 * the two cannot disagree) plus a check for the DOI shape, `10.` then a registrant (dotted
 * subdivisions allowed, as in `10.1000.1`) then `/`. It does not percent-decode: a value read
 * out of a URL is decoded where it is read (`statedDoi`), so a stored DOI and its citation
 * key stay byte-identical. Null when the value is not a DOI.
 */
export function bareDoi(value: string | null | undefined): string | null {
  const key = doiKey(value);
  return key && DOI_SHAPE.test(key) ? key : null;
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
