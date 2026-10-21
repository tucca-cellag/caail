/**
 * authors.ts: tells apart different people who share a shared-author key, using the
 * full author names publishers deposit with each paper's DOI.
 *
 * The shared-author graph keys every author `surname|first-initial` (graph.ts
 * `authorKey`), because Papers.md citations are APA and carry initials only. The key
 * also joins different people: ref 49's "Liu, S." is Sherry Liu, and the FarmGTEx
 * papers' "Liu, S." is Shuli Liu (tucca-cellag/caail-planning#552). The committed
 * author-cache.json, written by fetch-authors.ts, records every authorship on each
 * paper with its full given name and any ORCID: from Crossref, and from DataCite for
 * the DOIs Crossref does not hold (in this corpus, the arXiv ones).
 *
 * Two papers' authorships under one key compare as:
 *   - same person: the ORCIDs match, or the given names agree (equal once initials and
 *     separators are dropped, or one a prefix of the other, so "Ana" and "Ana Maria"
 *     agree, as do "Chris" and "Christopher");
 *   - different people: both given names are known in full and do not agree;
 *   - unknown otherwise: no record, a given name that is initials only or starts with
 *     one ("J. Craig"), or a key matching two authorships on one paper.
 * Only "different people" removes a join. The rule never adds an edge and never removes
 * one for lack of evidence, so a paper missing from the cache joins exactly as before.
 *
 * Different ORCIDs alone are not evidence, because one person can hold two ORCID
 * records: Kexin Huang carries one ORCID on ref 49 and another on ref 123.
 *
 * OpenAlex author ids were tried first and rejected. OpenAlex's record of ref 49 lists
 * no Liu at all, and it splits one person across ids; the evidence is on
 * tucca-cellag/caail-planning#552.
 *
 * Pure: no I/O.
 */

import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { doiKey } from './citations.js';
import type { Reference } from './types.js';

// ---------------------------------------------------------------------------
// Cache schema (input: the committed author-cache.json)
// ---------------------------------------------------------------------------

/** One author position on a paper, as the registry deposited it. */
export const AuthorshipSchema = z.object({
  given: z.string().min(1).nullable(),
  family: z.string().min(1).nullable(),
  /** Bare ORCID iD (`0000-0002-1825-0097`), never the URL form. */
  orcid: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/)
    .nullable(),
});

export const AuthorRecordSchema = z.object({
  /** Which registry the authorships came from. */
  source: z.enum(['crossref', 'datacite']),
  authors: z.array(AuthorshipSchema),
});

export const AuthorCacheSchema = z.object({
  /** ISO timestamp of the fetch run that produced this cache. */
  generatedAt: z.string(),
  /** Keyed by bare lowercase DOI (citations.ts `doiKey`). */
  works: z.record(z.string(), AuthorRecordSchema),
});

export type Authorship = z.infer<typeof AuthorshipSchema>;
export type AuthorRecord = z.infer<typeof AuthorRecordSchema>;
export type AuthorCache = z.infer<typeof AuthorCacheSchema>;

/** Absolute path to the committed author cache (parser input, refreshed by `pnpm fetch:authors`). */
export const AUTHOR_CACHE_PATH: string = fileURLToPath(new URL('./author-cache.json', import.meta.url));

// ---------------------------------------------------------------------------
// Name normalization
// ---------------------------------------------------------------------------

/** Lowercase with accents removed, so "Ávila" and "Avila" compare equal. */
export function foldName(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Letters only, after folding: the form surnames are compared in ("D’Mellow" → "dmellow"). */
function letters(s: string): string {
  return foldName(s).replace(/[^a-z]/g, '');
}

/**
 * A given name reduced to the part that can tell two people apart: folded, initials
 * dropped, separators removed. "Yusuf H." → "yusuf", "Ji-Hoe" → "jihoe",
 * "Xiao Ming" → "xiaoming". Empty when there is nothing to compare: no name, a name of
 * initials only, or a name that starts with an initial ("J. Craig"), since someone who
 * goes by a middle name may appear elsewhere under the first.
 */
export function givenCore(given: string | null): string {
  if (!given) return '';
  const tokens = foldName(given)
    .replace(/\./g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z]/g, ''))
    .filter(Boolean);
  if (tokens.length === 0 || tokens[0].length < 2) return '';
  return tokens.filter((t) => t.length > 1).join('');
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type Identity = 'same' | 'different' | 'unknown';

/** Whether two authorships under one key are the same person (see the module docstring). */
export function compareAuthorships(a: Authorship, b: Authorship): Identity {
  if (a.orcid && b.orcid && a.orcid === b.orcid) return 'same';
  const ga = givenCore(a.given);
  const gb = givenCore(b.given);
  if (!ga || !gb) return 'unknown';
  return ga.startsWith(gb) || gb.startsWith(ga) ? 'same' : 'different';
}

/**
 * The one authorship on a paper that a shared-author key names, or null when none or
 * more than one does. The key is graph.ts's `surname|first-initial`, or the bare surname
 * when the citation gave no initial.
 */
export function resolveAuthorship(authors: readonly Authorship[], key: string): Authorship | null {
  const [surname, initial = ''] = key.split('|');
  const want = letters(surname);
  if (!want) return null;
  const hits = authors.filter(
    (a) =>
      a.family !== null &&
      letters(a.family) === want &&
      (!initial || (foldName(a.given ?? '').match(/[a-z]/)?.[0] ?? '') === initial),
  );
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Build the check graph.ts runs on each pair of papers sharing a key: true only when the
 * cache shows the key naming a different person on each paper. Resolutions are memoized,
 * since a common key is checked once per pair of the papers carrying it.
 */
export function differentPeopleCheck(
  cache: AuthorCache,
  refs: readonly Pick<Reference, 'id' | 'doi'>[],
): (a: number, b: number, key: string) => boolean {
  const recordById = new Map<number, AuthorRecord>();
  for (const r of refs) {
    const k = doiKey(r.doi);
    const record = k ? cache.works[k] : undefined;
    if (record) recordById.set(r.id, record);
  }
  const memo = new Map<string, Authorship | null>();
  const resolve = (id: number, key: string): Authorship | null => {
    const m = `${id}|${key}`;
    if (!memo.has(m)) {
      const record = recordById.get(id);
      memo.set(m, record ? resolveAuthorship(record.authors, key) : null);
    }
    return memo.get(m) ?? null;
  };
  return (a, b, key) => {
    const x = resolve(a, key);
    const y = resolve(b, key);
    return x !== null && y !== null && compareAuthorships(x, y) === 'different';
  };
}

/** DOIs of papers with no record in the cache, whose shared-author joins fall back to names only. */
export function uncachedDois(cache: AuthorCache | null, refs: readonly Pick<Reference, 'doi'>[]): string[] {
  const dois = refs.map((r) => doiKey(r.doi)).filter((d): d is string => d !== null);
  return [...new Set(dois.filter((d) => !cache?.works[d]))].sort();
}
