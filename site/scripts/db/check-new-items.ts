/**
 * check-new-items.ts (db:check-new-items): the CI guard that refuses a change adding a new
 * item by any route while new items are paused until CAAIL v2. db:add refuses on its own
 * (add-item.ts); this catches every other route, since a row edited by hand into the NDJSON,
 * an insert made through db:build and db:export, and a db:bootstrap fold all pass db:check,
 * db:verify and the sync guard. Comparing the commit under test against its base is the one
 * place that sees a new id whichever way it arrived.
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:check-new-items <base>
 *
 * Refused: an id in `items.ndjson` at HEAD that is not at `<base>`, other than a topic tag
 * (a subject label, not a catalog entry), and a DOI in `datasets_on_request.ndjson` at HEAD
 * that is not at `<base>`. A correction that splits a held item into two may add the new
 * item's id, when a commit in `<base>..HEAD` carries the trailer
 * `Splits: <new id> from <held id>` and the held id is at `<base>`. With NEW_ITEMS_PAUSED
 * false it checks nothing, so lifting the pause in add-item.ts lifts this guard too.
 */

import { execFileSync } from 'node:child_process';
import { exitOnRefusal, REPO_ROOT, RefusalError, runsAsMain } from './lib.js';
import { NEW_ITEMS_PAUSED } from './add-item.js';

/** The commit trailer a split names its held item in. */
export const SPLIT_TRAILER = 'Splits';

const ITEMS = 'site/db/ndjson/items.ndjson';
const ON_REQUEST = 'site/db/ndjson/datasets_on_request.ndjson';

/** The keys that say whether a catalog entry is new: item ids, and Data on request DOIs. */
export interface CatalogKeys {
  itemIds: Set<string>;
  onRequestDois: Set<string>;
}

function ndjsonField(text: string, field: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const value = (JSON.parse(line) as Record<string, unknown>)[field];
    if (typeof value !== 'string') throw new Error(`a row has no string "${field}": ${line}`);
    out.add(value);
  }
  return out;
}

/** The catalog keys held in an `items.ndjson` and a `datasets_on_request.ndjson`. */
export function catalogKeys(itemsNdjson: string, onRequestNdjson: string): CatalogKeys {
  return { itemIds: ndjsonField(itemsNdjson, 'id'), onRequestDois: ndjsonField(onRequestNdjson, 'doi') };
}

/**
 * What `head` adds to `base` that a pull request may not add while new items are paused, one
 * line each; empty when nothing is refused. `splitTrailers` are the values of every
 * `Splits:` trailer in the range.
 */
export function newItemProblems(base: CatalogKeys, head: CatalogKeys, splitTrailers: string[]): string[] {
  const problems: string[] = [];
  const splits = new Set<string>();
  for (const raw of splitTrailers) {
    const m = raw.trim().match(/^(\S+) from (\S+)$/);
    if (!m) {
      problems.push(`${SPLIT_TRAILER}: ${raw.trim()}: not "<new id> from <held id>"`);
      continue;
    }
    const [, newId, heldId] = m;
    if (!base.itemIds.has(heldId)) {
      problems.push(`${SPLIT_TRAILER}: ${raw.trim()}: ${heldId} is not on the base, so this is not a split of a held item`);
      continue;
    }
    splits.add(newId);
  }
  for (const id of [...head.itemIds].sort()) {
    if (base.itemIds.has(id) || id.startsWith('topic:') || splits.has(id)) continue;
    problems.push(`${id} is a new item`);
  }
  for (const doi of [...head.onRequestDois].sort()) {
    if (!base.onRequestDois.has(doi)) problems.push(`the Data on request study ${doi} is new`);
  }
  return problems;
}

/** The refusal CI prints: the pause in public words, what to do instead, then each problem. */
export function refusalMessage(problems: string[]): string {
  return [
    'db:check-new-items: new items are paused until CAAIL v2, so this change may not add one.',
    'Edits to items already here, and removals, still pass. A correction that splits a held item',
    `into two names it in a commit trailer: "${SPLIT_TRAILER}: <new id> from <held id>".`,
    ...problems.map((p) => `  ✗ ${p}`),
  ].join('\n');
}

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' });

/** A file's text at `ref`, or '' when `ref` does not have it (a base older than the file). */
function fileAt(repo: string, ref: string, path: string): string {
  if (!git(repo, ['ls-tree', '--name-only', ref, '--', path]).trim()) return '';
  return git(repo, ['show', `${ref}:${path}`]);
}

function keysAt(repo: string, ref: string): CatalogKeys {
  return catalogKeys(fileAt(repo, ref, ITEMS), fileAt(repo, ref, ON_REQUEST));
}

/**
 * The problems with `head` (HEAD by default) against `base` in the repository at `repo`,
 * reading both from their commits (never the working tree, which other CI steps regenerate)
 * and the split trailers from every commit in `base..head`.
 */
export function checkNewItems(repo: string, base: string, head = 'HEAD'): string[] {
  const trailers = git(repo, ['log', `--format=%(trailers:key=${SPLIT_TRAILER},valueonly,separator=%x00)%x00`, `${base}..${head}`])
    .split('\0')
    .map((t) => t.trim())
    .filter(Boolean);
  return newItemProblems(keysAt(repo, base), keysAt(repo, head), trailers);
}

function main(): void {
  try {
    const base = process.argv[2];
    if (!base) throw new RefusalError('usage: db:check-new-items <base commit>');
    if (!NEW_ITEMS_PAUSED) {
      console.log('db:check-new-items: new items are not paused, so there is nothing to check.');
      return;
    }
    const problems = checkNewItems(REPO_ROOT, base);
    if (problems.length) throw new RefusalError(refusalMessage(problems));
    console.log(`db:check-new-items: no new item since ${base}.`);
  } catch (err) {
    exitOnRefusal(err);
  }
}

if (runsAsMain(import.meta.url)) main();
