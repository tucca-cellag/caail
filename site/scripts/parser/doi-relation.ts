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
 * them as the item's own, since only Zenodo's types are cached; and a DOI written as a link
 * (in an inventory cell, or among the links `db:check` compares) keeps the plain registrant
 * rule (`doiRelation`), since a link listed as a deposit is one. A curated entry's own `doi`
 * column is an item DOI wherever it is read, the parse and `db:check` alike.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

/** Whether a bare DOI is Zenodo's, by its exact registrant (`10.52810` is not `10.5281`). */
export function isZenodoDoi(key: string): boolean {
  return key.startsWith(`${ZENODO_REGISTRANT}/`);
}

/** The committed Zenodo resource types, written by the opt-in `fetch:zenodo-types`. */
export const ZENODO_TYPES_PATH = join(dirname(fileURLToPath(import.meta.url)), 'zenodo-types.json');

/**
 * Load `bare DOI -> Zenodo resource type` (a record's `metadata.resource_type.type`) from
 * the committed cache. Empty if absent; a cache that is present but malformed throws.
 */
export function loadZenodoTypes(path: string = ZENODO_TYPES_PATH): Map<string, string> {
  if (!existsSync(path)) return new Map();
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as { types?: Record<string, { type?: unknown }> };
  if (raw.types === undefined || typeof raw.types !== 'object') throw new Error(`${path}: no "types" object`);
  return new Map(Object.entries(raw.types).map(([doi, v]) => {
    if (typeof v?.type !== 'string') throw new Error(`${path}: ${doi} has no resource type`);
    return [doi, v.type];
  }));
}

/** The committed types, read on first use and kept for the process, which is one parse or one check. */
let committedTypes: Map<string, string> | undefined;

/** A bare DOI's recorded Zenodo resource type, from the committed cache. */
export function cachedZenodoType(key: string): string | undefined {
  return (committedTypes ??= loadZenodoTypes()).get(key);
}

/**
 * Zenodo resource types (a record's `metadata.resource_type.type`) whose record documents
 * an item rather than depositing it. Any other type (dataset, software, image, video,
 * other…) is a deposit.
 */
export const ZENODO_DOCUMENT_TYPES: ReadonlySet<string> = new Set(['publication', 'poster', 'presentation', 'lesson']);

/**
 * `doiRelation` for the DOI a catalog item or curated dataset entry carries, which the parse
 * serves and `db:check` matches by: the registrant rule, except that a Zenodo DOI is
 * `publication` where its record is a document and `own` where it is a deposit, by its
 * Zenodo resource type (`typeOf`, the committed cache unless a test injects one). A Zenodo
 * DOI with no recorded type throws, naming the fetch to run, so a parse or check fails
 * rather than serve a guessed `own`.
 */
export function itemDoiRelation(
  doi: string | null | undefined,
  typeOf: (key: string) => string | undefined = cachedZenodoType,
): DoiRelation | null {
  const key = bareDoi(doi);
  if (!key) return null;
  if (!isZenodoDoi(key)) return doiRelation(key);
  const type = typeOf(key);
  if (type === undefined) {
    throw new Error(`doi-relation: ${key} has no recorded Zenodo resource type; run \`pnpm --dir site fetch:zenodo-types\` ` +
      `and commit site/scripts/parser/zenodo-types.json.`);
  }
  return ZENODO_DOCUMENT_TYPES.has(type) ? 'publication' : 'own';
}
