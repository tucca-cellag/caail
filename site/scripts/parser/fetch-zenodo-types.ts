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
 * version, whose type is recorded under the concept DOI: measured 2026-11-13, record
 * 23124562 (Project PISCES's concept DOI) answered 302 to record 23124563.
 *
 * It keeps what it already knows: a DOI it cannot read (a failed request, an error status, a
 * body that is not the record) keeps its earlier entry, if any, is reported, and the run goes
 * on; a 429 or 503 stops the run, since the service is asking for less, and every DOI it did
 * not fetch is named. What it has is written either way. A DOI no item carries drops out.
 *
 * Where Zenodo cannot answer for a DOI at all (one that is no `zenodo.<record>` DOI, or a
 * record id it answers 404 to), the way out is to record the type by hand in
 * `zenodo-types.json`. The fetch keeps a type recorded for such a DOI and does not report
 * it as failed, so a run after that exits cleanly.
 */

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { zenodoItemDois } from './citation-counts.js';
import { loadZenodoTypeEntries, ZENODO_TYPES_PATH, zenodoRecordId, type ZenodoTypeEntry } from './doi-relation.js';

/**
 * A generic client name and nothing else: no person, project, organisation or repository
 * (rules/request-identity). Zenodo answers Node's default User-Agent with 403, measured
 * 2026-11-13, so the default cannot be sent unchanged; this name was measured to get 200.
 */
const USER_AGENT = 'zenodo-types-fetch/1.0';
const PAUSE_MS = 5_000;

export type { ZenodoTypeEntry };

/** The way out named wherever Zenodo cannot answer for a DOI. */
const BY_HAND = 'record its type by hand in zenodo-types.json';

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
  /**
   * A DOI Zenodo cannot answer for: a type already recorded is kept and is no failure, since
   * recording it by hand is the way out; with none recorded, that way out is named.
   */
  const unanswerable = (doi: string, why: string, wayOut: string = BY_HAND): void => {
    const entry = known[doi];
    if (entry) {
      types[doi] = entry;
      log(`${doi}: ${why}; kept its recorded type, ${entry.type}`);
    } else {
      failed.push(`${doi}: ${why}; ${wayOut}`);
    }
  };
  for (const [i, doi] of dois.entries()) {
    const id = zenodoRecordId(doi);
    if (id === null) {
      unanswerable(doi, 'not a zenodo.<record> DOI, so there is no record id to ask for');
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
      if (res.status === 404) {
        unanswerable(doi, `HTTP 404, so Zenodo has no record ${id} to read`, `if the DOI is right, ${BY_HAND}`);
        continue;
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

/**
 * The entries already committed, keyed by bare DOI as the parse reads them
 * (`loadZenodoTypeEntries`), so a key written by hand in another form is matched rather than
 * dropped on the next run.
 */
export function committedZenodoTypes(path: string = ZENODO_TYPES_PATH): Record<string, ZenodoTypeEntry> {
  return Object.fromEntries(loadZenodoTypeEntries(path));
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  (async () => {
    const dois = zenodoItemDois();
    const { types, failed } = await fetchZenodoTypes(dois, committedZenodoTypes());
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
