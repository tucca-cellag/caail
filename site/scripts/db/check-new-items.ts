/**
 * check-new-items.ts (db:check-new-items): the CI guard that refuses a change adding a new
 * item while new items are paused until CAAIL v2. db:add refuses on its own (add-item.ts);
 * this catches every other way a new key reaches the NDJSON, since a row edited in by hand,
 * an insert made through db:build and db:export, and a db:bootstrap fold all pass db:check,
 * db:verify and the sync guard. Comparing the commit under test against its base is the one
 * place that sees a new key whichever way it arrived. (An entry added to the Markdown alone,
 * with the NDJSON untouched, is refused by lint-papers.yml's sync guard instead.)
 *
 *   NODE_OPTIONS='--experimental-sqlite --no-warnings' pnpm --dir site db:check-new-items <base>
 *
 * Refused: an id in `items.ndjson` at HEAD that is not at `<base>`, other than a topic tag
 * (a subject label, not a catalog entry), and a DOI in `datasets_on_request.ndjson` at HEAD
 * that is not at `<base>`. Two corrections may add a key, each declared in a trailer on a
 * commit in `<base>..HEAD`, one trailer per new key, and each held key named once (a value
 * repeated word for word counts once). Neither mints a paper id:
 *
 *   - a split of a held item into two, `Splits: <new id> from <held id>`, passes when the
 *     held id is at `<base>` and still at HEAD (a split keeps the item it splits);
 *   - a re-mint, `Re-mints: <new id> from <old id>`, passes when the old key is at `<base>`
 *     and gone at HEAD (a re-mint replaces it). It covers an id CLAUDE.md sanctions
 *     repairing and a corrected Data on request DOI.
 *
 * The other state of each is refused and points at the other trailer, so neither act can
 * pass under the other's name. Git reads a trailer only from a commit message's last
 * paragraph, and the trailers must survive the merge: a squash can rewrite them away, and
 * the push run on main then refuses the key once, after it has landed. With
 * NEW_ITEMS_PAUSED false it checks nothing, so lifting the pause in add-item.ts lifts this
 * guard too.
 */

import { execFileSync } from 'node:child_process';
import { join, relative, sep } from 'node:path';
import { exitOnRefusal, NDJSON_DIR, REPO_ROOT, RefusalError, runsAsMain } from './lib.js';
import { NEW_ITEMS_PAUSED } from './add-item.js';

/** The commit trailer a split names its held item in. */
export const SPLIT_TRAILER = 'Splits';
/** The commit trailer a re-mint names the id it replaces in. */
export const REMINT_TRAILER = 'Re-mints';

/** A table's NDJSON path relative to the repository root, as git names it, from NDJSON_DIR. */
const ndjsonPath = (table: string) => relative(REPO_ROOT, join(NDJSON_DIR, `${table}.ndjson`)).split(sep).join('/');
const ITEMS = ndjsonPath('items');
const ON_REQUEST = ndjsonPath('datasets_on_request');

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
 * way is recorded in `problems`, naming `heldName` as the trailer's own help does. A value
 * repeated word for word (a cherry-picked or re-applied commit) is one declaration.
 */
function declarations(key: string, heldName: string, values: string[], problems: string[]) {
  const out: { raw: string; newId: string; heldId: string }[] = [];
  for (const raw of new Set(values.map((v) => v.trim()))) {
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
  const newIds = new Set<string>(); // item ids a trailer lets through
  const newDois = new Set<string>(); // Data on request DOIs a trailer lets through
  const named = new Set<string>(); // held keys a valid trailer has already named
  // Within one change, each held item is split or re-minted once, into one new key, so a
  // single held item cannot be named again and again in it. (Across changes nothing counts
  // earlier uses; a reviewer reads each trailer on its own pull request.)
  const firstNaming = (key: string, raw: string, held: string): boolean => {
    if (!named.has(held)) {
      named.add(held);
      return true;
    }
    problems.push(`${key}: ${raw}: ${held} is named by more than one trailer, and each held item is split or re-minted once`);
    return false;
  };

  // Neither trailer mints a paper id: every new paper is a new reference in the matrix, and
  // a bad paper id is retired rather than re-minted (CLAUDE.md). Nor does either name a
  // topic tag as what it corrects: a topic is a subject label, so it holds no entry.
  const topicHeld = (key: string, raw: string, held: string): boolean => {
    if (!held.startsWith('topic:')) return false;
    problems.push(`${key}: ${raw}: ${held} is a topic tag, not a catalog entry, so there is nothing to split or re-mint`);
    return true;
  };
  for (const { raw, newId, heldId } of declarations(SPLIT_TRAILER, 'held id', trailers.splits, problems)) {
    if (topicHeld(SPLIT_TRAILER, raw, heldId)) continue;
    if (newId.startsWith('paper:')) {
      problems.push(`${SPLIT_TRAILER}: ${raw}: a split never mints a paper id; each new paper is a new reference`);
    } else if (!base.itemIds.has(heldId)) {
      problems.push(`${SPLIT_TRAILER}: ${raw}: ${heldId} is not on the base, so this is not a split of a held item`);
    } else if (!head.itemIds.has(heldId)) {
      problems.push(`${SPLIT_TRAILER}: ${raw}: ${heldId} is gone, and a split keeps the item it splits; a replaced id is named in "${REMINT_TRAILER}:"`);
    } else if (firstNaming(SPLIT_TRAILER, raw, heldId)) {
      newIds.add(newId);
    }
  }
  // A re-mint replaces a held key with a new key of the same kind: an item id with an item
  // id (whose type may change, as a move between pages does), or the DOI that keys a Data
  // on request study with another DOI. Never a paper id, on either side.
  for (const { raw, newId, heldId } of declarations(REMINT_TRAILER, 'old id', trailers.remints, problems)) {
    if (topicHeld(REMINT_TRAILER, raw, heldId)) continue;
    const isDoi = base.onRequestDois.has(heldId);
    if (newId.startsWith('paper:') || heldId.startsWith('paper:')) {
      problems.push(`${REMINT_TRAILER}: ${raw}: a paper id is never re-minted; a bad one is retired`);
    } else if (!isDoi && !base.itemIds.has(heldId)) {
      problems.push(`${REMINT_TRAILER}: ${raw}: ${heldId} is not on the base, so this is not a re-mint of a held item`);
    } else if (isDoi ? head.onRequestDois.has(heldId) : head.itemIds.has(heldId)) {
      problems.push(`${REMINT_TRAILER}: ${raw}: ${heldId} is still here, and a re-mint replaces the id; a split is named in "${SPLIT_TRAILER}:"`);
    } else if (firstNaming(REMINT_TRAILER, raw, heldId)) {
      (isDoi ? newDois : newIds).add(newId);
    }
  }

  for (const id of [...head.itemIds].sort()) {
    if (base.itemIds.has(id) || id.startsWith('topic:') || newIds.has(id)) continue;
    problems.push(`${id} is a new item`);
  }
  for (const doi of [...head.onRequestDois].sort()) {
    if (base.onRequestDois.has(doi) || newDois.has(doi)) continue;
    problems.push(`the Data on request study ${doi} is new`);
  }
  return problems;
}

/** The refusal CI prints: the pause in public words, what to do instead, then each problem. */
export function refusalMessage(problems: string[]): string {
  return [
    'db:check-new-items: new items are paused until CAAIL v2, so this change may not add one.',
    'Edits to items already here, and removals, still pass. A correction that adds an id names',
    'what it corrects in a commit trailer, one per new id: a split of a held item into two keeps it,',
    `"${SPLIT_TRAILER}: <new id> from <held id>"; a repair that replaces a held item's id (never a`,
    `paper's), or a Data on request study's DOI, drops the old one, "${REMINT_TRAILER}: <new id> from <old id>".`,
    'A trailer goes in the last paragraph of a commit message, the only place git reads one.',
    'Neither trailer adds a new item: suggest one through an issue instead.',
    ...problems.map((p) => `  ✗ ${p}`),
  ].join('\n');
}

const git = (repo: string, args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8' });

/**
 * A file's text at `ref`. A base without it reads as '' (a base older than the file); a head
 * without it is refused, since db:export writes every table even when it is empty, so a
 * missing file means the catalog moved and reading it as empty would pass every new item.
 */
function fileAt(repo: string, ref: string, path: string, side: 'base' | 'head'): string {
  if (git(repo, ['ls-tree', '--name-only', ref, '--', path]).trim()) return git(repo, ['show', `${ref}:${path}`]);
  if (side === 'base') return '';
  throw new RefusalError(`db:check-new-items: ${path} is not at ${ref}, so there is no catalog to check; if it moved, move this guard's path with it.`);
}

/** The catalog keys at `ref`, refusing a file that does not parse and naming it and the ref. */
function keysAt(repo: string, ref: string, side: 'base' | 'head'): CatalogKeys {
  const read = (path: string, field: string): Set<string> => {
    const text = fileAt(repo, ref, path, side);
    try {
      return ndjsonField(text, field);
    } catch (err) {
      throw new RefusalError(`db:check-new-items: ${path} at ${ref} is not valid NDJSON: ${(err as Error).message}`);
    }
  };
  return { itemIds: read(ITEMS, 'id'), onRequestDois: read(ON_REQUEST, 'doi') };
}

/** Refuses a ref that is not a commit in the clone, naming it, rather than letting git throw. */
function assertCommit(repo: string, ref: string): void {
  try {
    git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new RefusalError(`db:check-new-items: ${ref} is not a commit in this clone, so there is nothing to compare against.`);
  }
}

/** The values of every `<key>:` trailer on the commits in `base..head`. */
function trailerValues(repo: string, base: string, head: string, key: string): string[] {
  // unfold: a value wrapped onto an indented continuation line reads as one line.
  return git(repo, ['log', `--format=%(trailers:key=${key},valueonly,unfold,separator=%x00)%x00`, `${base}..${head}`])
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
  assertCommit(repo, base);
  assertCommit(repo, head);
  return newItemProblems(keysAt(repo, base, 'base'), keysAt(repo, head, 'head'), {
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
