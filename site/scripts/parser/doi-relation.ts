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
 * the data hosts below. A DOI from any other registrant is a publication. Exact matching
 * matters because registrants are numeric strings and `10.52810` is not `10.5281`.
 *
 * One refinement, for the DOI a catalog item or curated dataset entry carries
 * (`itemDoiRelation`): Zenodo mints DOIs for documents as well as deposits, so a Zenodo
 * DOI is `own` only where its record's Zenodo resource type is a deposit, and `publication`
 * where it is a document (`ZENODO_DOCUMENT_TYPES`). The types are read offline from the
 * committed `zenodo-types.json`, which the opt-in `fetch:zenodo-types` refreshes
 * (tucca-cellag/caail-planning#760). `sw:project-pisces`'s DOI names Zenodo's software
 * documentation about the tool, so it is `publication`.
 *
 * The limits that remain: a data host missing from the list is read as a publication (add
 * it here when one turns up); a non-Zenodo host that also mints document DOIs still reads
 * them as the item's own, since only Zenodo's types are cached; and a DOI found in an
 * inventory cell or matched by `db:check` keeps the plain registrant rule (`doiRelation`),
 * since there the DOI is the cell's own deposit link.
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

/** Zenodo's registrant, whose DOIs name a document as often as a deposit. */
export const ZENODO_REGISTRANT = '10.5281';

/**
 * Zenodo resource types (a record's `metadata.resource_type.type`) whose record documents
 * an item rather than depositing it. Any other type (dataset, software, image, video,
 * other…) is a deposit.
 */
export const ZENODO_DOCUMENT_TYPES: ReadonlySet<string> = new Set(['publication', 'poster', 'presentation', 'lesson']);

/**
 * `doiRelation` for the DOI a catalog item or curated dataset entry carries: the registrant
 * rule, except that a Zenodo DOI whose record is a document (`typeOf` gives its cached Zenodo
 * resource type) is `publication`. A Zenodo DOI with no cached type keeps the registrant
 * rule, `own`; the corpus test fails while any item's Zenodo DOI is uncached, so that
 * fallback is only ever met by a DOI added since the last `fetch:zenodo-types`.
 */
export function itemDoiRelation(
  doi: string | null | undefined,
  typeOf: (key: string) => string | undefined,
): DoiRelation | null {
  const key = bareDoi(doi);
  if (!key) return null;
  const relation = doiRelation(key);
  if (relation !== 'own' || key.slice(0, key.indexOf('/')) !== ZENODO_REGISTRANT) return relation;
  const type = typeOf(key);
  return type !== undefined && ZENODO_DOCUMENT_TYPES.has(type) ? 'publication' : 'own';
}
