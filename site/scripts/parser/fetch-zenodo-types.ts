/**
 * fetch-zenodo-types.ts: OPT-IN and networked. Records the Zenodo resource type of every
 * Zenodo DOI a catalog item or curated dataset entry carries, in the committed
 * `zenodo-types.json`, which `itemDoiRelation` reads offline to tell a Zenodo document (a
 * publication about the item) from a deposit (the item itself)
 * (tucca-cellag/caail-planning#760). `parse` and `build` stay network-free.
 *
 * Run it after adding or changing such a DOI: `pnpm --dir site fetch:zenodo-types`. The
 * parse, `db:check` and `pnpm test` all refuse an item's Zenodo DOI with no recorded type. It
 * sends one request per DOI to Zenodo's public records API, five seconds apart, under a
 * generic client name (`USER_AGENT`). A concept DOI's record id redirects to its latest
 * version, whose type is recorded under the concept DOI.
 *
 * It keeps what it already knows: a DOI it cannot read (a failed request, an error status, a
 * body that is not the record) keeps its earlier entry, if any, is reported, and the run goes
 * on; a 429 or 503 stops the run, since the service is asking for less, and every DOI it did
 * not fetch is named. What it has is written either way. A DOI no item carries drops out.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { zenodoItemDois } from './citation-counts.js';
import { ZENODO_TYPES_PATH, zenodoRecordId } from './doi-relation.js';

/**
 * A generic client name and nothing else: no person, project, organisation or repository
 * (rules/request-identity). Zenodo answers Node's default User-Agent with 403, measured
 * 2026-11-13, so the default cannot be sent unchanged; this name was measured to get 200.
 */
const USER_AGENT = 'zenodo-types-fetch/1.0';
const PAUSE_MS = 5_000;

export type ZenodoTypeEntry = { type: string; subtype?: string };

/** The slice of `fetch` this script uses, so a test can stub the network. */
export type ZenodoFetch = (url: string, init: { headers: Record<string, string> }) =>
  Promise<{ ok: boolean; status: number; statusText: string; json(): Promise<unknown> }>;

/**
 * Each DOI's Zenodo resource type, with every DOI it could not fetch and why. `known` is what is
 * already recorded, kept for a DOI this run cannot read and for those after a 429 or 503 stop.
 */
export async function fetchZenodoTypes(
  dois: readonly string[],
  known: Readonly<Record<string, ZenodoTypeEntry>>,
  opts: { fetchImpl?: ZenodoFetch; sleep?: (ms: number) => Promise<void>; log?: (m: string) => void } = {},
): Promise<{ types: Record<string, ZenodoTypeEntry>; failed: string[] }> {
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as ZenodoFetch);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = opts.log ?? ((m: string) => console.log(m));
  const types: Record<string, ZenodoTypeEntry> = {};
  const failed: string[] = [];
  const keep = (doi: string, why: string): void => {
    failed.push(`${doi}: ${why}`);
    if (known[doi]) types[doi] = known[doi]!;
  };
  for (const [i, doi] of dois.entries()) {
    const id = zenodoRecordId(doi);
    if (id === null) {
      keep(doi, 'not a zenodo.<record> DOI, so there is no record id to ask for');
      continue;
    }
    if (i > 0) await sleep(PAUSE_MS);
    let entry: ZenodoTypeEntry;
    try {
      const res = await fetchImpl(`https://zenodo.org/api/records/${id}`, { headers: { 'User-Agent': USER_AGENT } });
      if (res.status === 429 || res.status === 503) {
        keep(doi, `HTTP ${res.status}, so the run stopped here`);
        for (const rest of dois.slice(i + 1)) keep(rest, 'not tried after the stop');
        break;
      }
      if (!res.ok) {
        keep(doi, `HTTP ${res.status} ${res.statusText}`);
        continue;
      }
      const rt = ((await res.json()) as { metadata?: { resource_type?: { type?: unknown; subtype?: unknown } } })?.metadata?.resource_type;
      if (typeof rt?.type !== 'string') {
        keep(doi, 'the record has no resource_type.type');
        continue;
      }
      entry = typeof rt.subtype === 'string' ? { type: rt.type, subtype: rt.subtype } : { type: rt.type };
    } catch (err) {
      keep(doi, (err as Error).message);
      continue;
    }
    types[doi] = entry;
    log(`${doi}: ${entry.type}${entry.subtype ? ` (${entry.subtype})` : ''}`);
  }
  return { types, failed };
}

/** The entries already committed. */
function committed(): Record<string, ZenodoTypeEntry> {
  if (!existsSync(ZENODO_TYPES_PATH)) return {};
  return (JSON.parse(readFileSync(ZENODO_TYPES_PATH, 'utf-8')) as { types?: Record<string, ZenodoTypeEntry> }).types ?? {};
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  (async () => {
    const dois = zenodoItemDois();
    const { types, failed } = await fetchZenodoTypes(dois, committed());
    const sorted = Object.fromEntries(Object.keys(types).sort().map((k) => [k, types[k]!]));
    writeFileSync(ZENODO_TYPES_PATH, `${JSON.stringify({ types: sorted }, null, 2)}\n`);
    console.log(`fetch-zenodo-types: wrote ${Object.keys(sorted).length} of ${dois.length} types to ${ZENODO_TYPES_PATH}`);
    if (failed.length > 0) {
      console.error(`fetch-zenodo-types: ${failed.length} not fetched:\n  ${failed.join('\n  ')}`);
      process.exitCode = 1;
    }
  })().catch((err: unknown) => {
    console.error(`fetch-zenodo-types: FAILED: ${(err as Error).message}`);
    process.exitCode = 1;
  });
}
