/**
 * fetch-zenodo-types.ts: OPT-IN and networked. Records the Zenodo resource type of every
 * Zenodo DOI a catalog item or curated dataset entry carries, in the committed
 * `zenodo-types.json`, which `itemDoiRelation` reads offline to tell a Zenodo document (a
 * publication about the item) from a deposit (the item itself)
 * (tucca-cellag/caail-planning#760). `parse` and `build` stay network-free.
 *
 * Run it after adding or changing such a DOI: `pnpm --dir site fetch:zenodo-types`. The
 * parse refuses an item's Zenodo DOI with no recorded type, and so does `pnpm test`. It sends
 * one request per DOI to Zenodo's public records API, five seconds apart, under a generic
 * client name (`USER_AGENT`). A concept DOI's record id redirects to its latest version, whose type is
 * recorded under the concept DOI.
 *
 * It keeps what it already knows: a DOI it cannot read keeps its earlier entry, if any, and
 * is reported, and the run goes on; a 429 or 503 stops the run, since the service is asking
 * for less, and what was fetched is still written. A DOI no item carries any more drops out.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { zenodoItemDois } from './citation-counts.js';
import { ZENODO_TYPES_PATH } from './doi-relation.js';

const PAUSE_MS = 5_000;

/**
 * A generic client name and nothing else: no person, project, organisation or repository
 * (rules/request-identity). Zenodo answers Node's default User-Agent with 403, measured
 * 2026-11-13, so the default cannot be sent unchanged; this name was measured to get 200.
 */
const USER_AGENT = 'zenodo-types-fetch/1.0';

type Entry = { type: string; subtype?: string };

/** The entries already committed, kept for a DOI this run cannot read. */
function previous(): Record<string, Entry> {
  if (!existsSync(ZENODO_TYPES_PATH)) return {};
  return (JSON.parse(readFileSync(ZENODO_TYPES_PATH, 'utf-8')) as { types?: Record<string, Entry> }).types ?? {};
}

async function main(): Promise<void> {
  const known = previous();
  const types: Record<string, Entry> = {};
  const failed: string[] = [];
  const dois = zenodoItemDois();
  for (const [i, doi] of dois.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    const keep = (why: string): void => {
      failed.push(`${doi}: ${why}`);
      if (known[doi]) types[doi] = known[doi]!;
    };
    const id = /^10\.5281\/zenodo\.(\d+)$/.exec(doi)?.[1];
    if (id === undefined) {
      keep('not a zenodo.<record> DOI, so no record id to ask for');
      continue;
    }
    const res = await fetch(`https://zenodo.org/api/records/${id}`, { headers: { 'User-Agent': USER_AGENT } });
    if (res.status === 429 || res.status === 503) {
      keep(`HTTP ${res.status}, so the run stops here`);
      for (const rest of dois.slice(i + 1)) if (known[rest]) types[rest] = known[rest]!;
      break;
    }
    if (!res.ok) {
      keep(`HTTP ${res.status} ${res.statusText}`);
      continue;
    }
    const record = (await res.json()) as { metadata?: { resource_type?: { type?: unknown; subtype?: unknown } } };
    const rt = record.metadata?.resource_type;
    if (typeof rt?.type !== 'string') {
      keep('the record has no resource_type.type');
      continue;
    }
    types[doi] = typeof rt.subtype === 'string' ? { type: rt.type, subtype: rt.subtype } : { type: rt.type };
    console.log(`${doi}: ${rt.type}${typeof rt.subtype === 'string' ? ` (${rt.subtype})` : ''}`);
  }
  const sorted = Object.fromEntries(Object.keys(types).sort().map((k) => [k, types[k]!]));
  writeFileSync(ZENODO_TYPES_PATH, `${JSON.stringify({ types: sorted }, null, 2)}\n`);
  console.log(`fetch-zenodo-types: wrote ${Object.keys(sorted).length} of ${dois.length} types to ${ZENODO_TYPES_PATH}`);
  if (failed.length > 0) {
    console.error(`fetch-zenodo-types: ${failed.length} not fetched:\n  ${failed.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
