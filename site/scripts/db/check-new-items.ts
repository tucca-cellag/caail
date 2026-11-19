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
 * that is not at `<base>`. Two corrections may add an id, each declared in a trailer on a
 * commit in `<base>..HEAD`, one trailer per new id:
 *
 *   - a split of a held item into two, `Splits: <new id> from <held id>`, passes when the
 *     held id is at `<base>` and still at HEAD (a split keeps the item it splits);
 *   - a re-mint of an id CLAUDE.md sanctions repairing, `Re-mints: <new id> from <old id>`,
 *     passes when the old id is at `<base>` and gone at HEAD (a re-mint replaces it).
 *
 * The other state of each is refused and points at the other trailer, so neither act can
 * pass under the other's name. With NEW_ITEMS_PAUSED false it checks nothing, so lifting
 * the pause in add-item.ts lifts this guard too.
 */

import { execFileSync } from 'node:child_process';
import { exitOnRefusal, REPO_ROOT, RefusalError, runsAsMain } from './lib.js';
import { NEW_ITEMS_PAUSED } from './add-item.js';

/** The commit trailer a split names its held item in. */
export const SPLIT_TRAILER = 'Splits';
/** The commit trailer a re-mint names the id it replaces in. */
export const REMINT_TRAILER = 'Re-mints';

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

/** The values of every trailer in a change's commits that may let a new id through, by key. */
export interface Trailers {
  splits: string[];
  remints: string[];
}

/**
 * Each `<key>:` trailer value read as `<new id> from <held id>`. One that does not read that
 * way is recorded in `problems`, naming `heldName` as the trailer's own help does.
 */
function declarations(key: string, heldName: string, values: string[], problems: string[]) {
  const out: { raw: string; newId: string; heldId: string }[] = [];
  for (const value of values) {
    const raw = value.trim();
    const m = raw.match(/^(\S+) from (\S+)$/);
    if (m) out.push({ raw, newId: m[1], heldId: m[2] });
    else problems.push(`${key}: ${raw}: not "<new id> from <${heldName}>"`);
  }
  return out;
}

/**
 * What `head` adds to `base` that a pull request may not add while new items are paused, one
 * line each; empty when nothing is refused.
 */
export function newItemProblems(base: CatalogKeys, head: CatalogKeys, trailers: Trailers): string[] {
  const problems: string[] = [];
  const declared = new Set<string>();
  for (const { raw, newId, heldId } of declarations(SPLIT_TRAILER, 'held id', trailers.splits, problems)) {
    if (!base.itemIds.has(heldId)) {
      problems.push(`${SPLIT_TRAILER}: ${raw}: ${heldId} is not on the base, so this is not a split of a held item`);
    } else if (!head.itemIds.has(heldId)) {
      problems.push(`${SPLIT_TRAILER}: ${raw}: ${heldId} is gone, and a split keeps the item it splits; a replaced id is named in "${REMINT_TRAILER}:"`);
    } else {
      declared.add(newId);
    }
  }
  for (const { raw, newId, heldId } of declarations(REMINT_TRAILER, 'old id', trailers.remints, problems)) {
    if (!base.itemIds.has(heldId)) {
      problems.push(`${REMINT_TRAILER}: ${raw}: ${heldId} is not on the base, so this is not a re-mint of a held item`);
    } else if (head.itemIds.has(heldId)) {
      problems.push(`${REMINT_TRAILER}: ${raw}: ${heldId} is still here, and a re-mint replaces the id; a split is named in "${SPLIT_TRAILER}:"`);
    } else {
      declared.add(newId);
    }
  }
  for (const id of [...head.itemIds].sort()) {
    if (base.itemIds.has(id) || id.startsWith('topic:') || declared.has(id)) continue;
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
    'Edits to items already here, and removals, still pass. A correction that adds an id names',
    'what it corrects in a commit trailer, one per new id: a split of a held item into two keeps it,',
    `"${SPLIT_TRAILER}: <new id> from <held id>"; a repair that replaces a held item's id drops the old`,
    `one, "${REMINT_TRAILER}: <new id> from <old id>".`,
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

/** The values of every `<key>:` trailer on the commits in `base..head`. */
function trailerValues(repo: string, base: string, head: string, key: string): string[] {
  return git(repo, ['log', `--format=%(trailers:key=${key},valueonly,separator=%x00)%x00`, `${base}..${head}`])
    .split('\0')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * The problems with `head` (HEAD by default) against `base` in the repository at `repo`,
 * reading both from their commits (never the working tree, which other CI steps regenerate)
 * and the trailers from every commit in `base..head`.
 */
export function checkNewItems(repo: string, base: string, head = 'HEAD'): string[] {
  return newItemProblems(keysAt(repo, base), keysAt(repo, head), {
    splits: trailerValues(repo, base, head, SPLIT_TRAILER),
    remints: trailerValues(repo, base, head, REMINT_TRAILER),
  });
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
