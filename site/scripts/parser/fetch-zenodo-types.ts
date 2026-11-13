/**
 * fetch-zenodo-types.ts: OPT-IN and networked. Records the Zenodo resource type of every
 * Zenodo DOI a catalog item or curated dataset entry carries, in the committed
 * `zenodo-types.json`, which `itemDoiRelation` reads offline to tell a Zenodo document (a
 * publication about the item) from a deposit (the item itself)
 * (tucca-cellag/caail-planning#760). `parse` and `build` stay network-free.
 *
 * Run it after adding or changing such a DOI: `pnpm --dir site fetch:zenodo-types`.
 * `pnpm --dir site test` fails until every one is recorded. It sends one request per DOI
 * to Zenodo's public records API, five seconds apart, and stops on the first failure
 * rather than retrying. A concept DOI's record id redirects to its latest version, whose
 * type is recorded under the concept DOI. The file is rewritten from the current DOIs, so a
 * DOI no item carries any more drops out.
 */

import { writeFileSync } from 'node:fs';

import { zenodoItemDois, ZENODO_TYPES_PATH } from './citation-counts.js';

/** A client name and the public repository, nothing personal (rules/request-identity). */
const USER_AGENT = 'CAAIL-zenodo-types (https://github.com/tucca-cellag/caail)';
const PAUSE_MS = 5_000;

async function main(): Promise<void> {
  const types: Record<string, { type: string; subtype?: string }> = {};
  for (const [i, doi] of zenodoItemDois().entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    const id = /^10\.5281\/zenodo\.(\d+)$/.exec(doi)?.[1];
    if (id === undefined) throw new Error(`fetch-zenodo-types: ${doi} is not a zenodo.<record> DOI`);
    const res = await fetch(`https://zenodo.org/api/records/${id}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`fetch-zenodo-types: ${doi}: HTTP ${res.status} ${res.statusText}`);
    const record = (await res.json()) as { metadata?: { resource_type?: { type?: unknown; subtype?: unknown } } };
    const rt = record.metadata?.resource_type;
    if (typeof rt?.type !== 'string') throw new Error(`fetch-zenodo-types: ${doi}: the record has no resource_type.type`);
    types[doi] = typeof rt.subtype === 'string' ? { type: rt.type, subtype: rt.subtype } : { type: rt.type };
    console.log(`${doi}: ${rt.type}${typeof rt.subtype === 'string' ? ` (${rt.subtype})` : ''}`);
  }
  writeFileSync(ZENODO_TYPES_PATH, `${JSON.stringify({ types }, null, 2)}\n`);
  console.log(`fetch-zenodo-types: wrote ${Object.keys(types).length} types to ${ZENODO_TYPES_PATH}`);
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
