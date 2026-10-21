/**
 * authors.ts: the shared-author match key, and telling apart different people who share
 * one, using the full author names publishers deposit with each paper's DOI.
 *
 * The shared-author graph keys every author `surname|first-initial` (`authorKey`),
 * because Papers.md citations are APA and carry initials only. The key also joins
 * different people: ref 49's "Liu, S." is Sherry Liu, and the FarmGTEx papers'
 * "Liu, S." is Shuli Liu (tucca-cellag/caail-planning#552). The committed
 * author-cache.json, written by fetch-authors.ts, records every authorship on each paper
 * with its full given name and any ORCID: from Crossref, and from DataCite for the DOIs
 * Crossref does not hold (in this corpus, the arXiv ones).
 *
 * Two papers' authorships under one key compare as:
 *   - same person: the ORCIDs match, or the given names agree: equal once initials and
 *     separators are dropped, one a prefix of the other ("Chris" and "Christopher"), or
 *     every part of one among the other's parts ("Maria" and "Ana Maria");
 *   - unknown: a given name that is initials only or starts with one ("J. Craig"), or two
 *     names of five or more letters one letter apart ("Mohamed" and "Mohammed"), which
 *     is as likely a spelling variant as a different person;
 *   - different people: both given names known in full and none of the above.
 * Only "different people" removes a join. Where a key matches several authorships on
 * one paper, the join is removed only when every one of them is a different person from
 * every one on the other paper; when the citation gives a second initial ("Kim, J. W."),
 * only authorships with that second initial are candidates, so a co-author who merely
 * shares the key cannot stand in for the cited person. An authorship the cache cannot
 * find (no record, no DOI, or a family name spelled differently from the citation) keeps
 * its join, so the rule never removes an edge without evidence.
 *
 * Known gap: a nickname that is not a prefix of the full name ("Mike" and "Michael")
 * reads as different people unless both authorships carry the same ORCID.
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
  /** Which registry the authorships came from, or `none` when the fetch found the DOI in neither. */
  source: z.enum(['crossref', 'datacite', 'none']),
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

/**
 * Latin letters that Unicode does not decompose into a base letter plus a mark, so
 * stripping marks leaves them as they are. Mapped to how ASCII writes them: "Łukasz" is
 * published as "Lukasz", "Strauß" as "Strauss", "Sæther" as "Saether".
 */
const UNDECOMPOSED: Readonly<Record<string, string>> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  ı: 'i',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
};

/** Lowercase, with accents removed and undecomposed Latin letters mapped ("Ávila" → "avila", "Strauß" → "strauss"). */
export function foldName(s: string): string {
  return [...s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()].map((c) => UNDECOMPOSED[c] ?? c).join('');
}

/**
 * A surname as the key carries it: folded, with spaces, hyphens and apostrophes removed,
 * so "del Rio‐Chanona", "del Rio-Chanona" and "del Rio Chanona" are one surname, as are
 * "Ávila" and "Avila". Letters in other scripts are kept rather than dropped.
 */
function surnameForm(s: string): string {
  return foldName(s).replace(/[^\p{L}]/gu, '');
}

/**
 * Normalize an APA author string ("Surname, F. M.") to the match key `surname|f`. The
 * surname is folded (`surnameForm`), and the initial is the first letter after the
 * comma, folded to its plain form, so "Á." keys as `a` and "Ł." as `l` rather than being
 * dropped or replaced by the next initial. Falls back to the surname alone when there is
 * no comma or no initial. Returns null for empty input.
 */
export function authorKey(author: string): string | null {
  const trimmed = author.trim();
  if (!trimmed) return null;
  const [surnameRaw, initialsRaw = ''] = trimmed.split(',');
  const surname = surnameForm(surnameRaw);
  if (!surname) return null;
  const firstInitial = foldName(initialsRaw.match(/\p{L}/u)?.[0] ?? '').charAt(0);
  return firstInitial ? `${surname}|${firstInitial}` : surname;
}

/** German umlauts, which ASCII writes two ways: without the dots ("Muller") or as a digraph ("Mueller"). */
const UMLAUT_DIGRAPH: Readonly<Record<string, string>> = { ä: 'ae', ö: 'oe', ü: 'ue' };

/**
 * Every key an APA author string matches under. One, except for a surname with a German
 * umlaut, which ASCII writes two ways, so "Müller, X." keys as both `muller|x` (matching
 * "Muller, X.") and `mueller|x` (matching "Mueller, X."). The variant comes only from the
 * umlaut itself: rewriting every "ue" would merge distinct surnames such as Xue and Xu.
 */
export function authorKeys(author: string): string[] {
  const key = authorKey(author);
  if (!key) return [];
  const nfc = author.normalize('NFC');
  const comma = nfc.indexOf(',');
  const surname = comma === -1 ? nfc : nfc.slice(0, comma);
  if (!/[äöü]/i.test(surname)) return [key];
  const digraph = surname.replace(/[äöü]/gi, (c) => UMLAUT_DIGRAPH[c.toLowerCase()]);
  const variant = authorKey(digraph + (comma === -1 ? '' : nfc.slice(comma)));
  return variant && variant !== key ? [key, variant] : [key];
}

/**
 * The initials a name abbreviates to, folded: "Jong Woo" → ["j", "w"], "Ji-Hoe" →
 * ["j", "h"], and the initials part of a citation, "J. W.", → ["j", "w"].
 */
export function initialsOf(name: string | null): string[] {
  if (!name) return [];
  return foldName(name)
    .replace(/\./g, ' ')
    .split(/[\s\-‐‑–]+/)
    .map((t) => t.match(/\p{L}/u)?.[0] ?? '')
    .filter(Boolean);
}

/**
 * A given name split into the parts that can tell two people apart: folded, initials
 * dropped, split at spaces and hyphens. "Yusuf H." → ["yusuf"], "Ji-Hoe" → ["ji", "hoe"].
 * Empty when there is nothing to compare: no name, a name of initials only, or a name
 * that starts with an initial ("J. Craig"), since someone who goes by a middle name may
 * appear elsewhere under the first.
 */
export function givenParts(given: string | null): string[] {
  if (!given) return [];
  const parts = foldName(given)
    .replace(/\./g, ' ')
    .split(/[\s\-‐‑–]+/)
    .map((t) => t.replace(/[^a-z]/g, ''))
    .filter(Boolean);
  if (parts.length === 0 || parts[0].length < 2) return [];
  return parts.filter((t) => t.length > 1);
}

/** The given name as one comparable string: "Xiao Ming" and "Xiao-Ming" both → "xiaoming". */
export function givenCore(given: string | null): string {
  return givenParts(given).join('');
}

/** Whether two strings are at most one insertion, deletion or substitution apart. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (s.length === l.length) i++;
    j++;
  }
  return edits + (l.length - j) + (s.length - i) <= 1;
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type Identity = 'same' | 'different' | 'unknown';

/** Whether two authorships under one key are the same person (see the module docstring). */
export function compareAuthorships(a: Authorship, b: Authorship): Identity {
  if (a.orcid && b.orcid && a.orcid === b.orcid) return 'same';
  const pa = givenParts(a.given);
  const pb = givenParts(b.given);
  if (pa.length === 0 || pb.length === 0) return 'unknown';
  const ja = pa.join('');
  const jb = pb.join('');
  if (ja.startsWith(jb) || jb.startsWith(ja)) return 'same';
  const [fewer, more] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (fewer.every((t) => more.includes(t))) return 'same';
  if (Math.min(ja.length, jb.length) >= 5 && withinOneEdit(ja, jb)) return 'unknown';
  return 'different';
}

/**
 * Every authorship on a paper that a shared-author key names: usually one, none when the
 * record spells the name differently from the citation, and several when two authors on
 * the paper share the key. Each authorship is keyed with `authorKeys` itself, from its
 * family name and full given name, so the cache and the citation strings can only
 * disagree where their spellings do, never where two copies of the keying rule would.
 * With `secondInitials`, only authorships whose second initial is among them count.
 */
export function authorshipsFor(
  authors: readonly Authorship[],
  key: string,
  secondInitials?: ReadonlySet<string>,
): Authorship[] {
  if (!key) return [];
  // A key with no initial (the citation gave none) matches on the surname alone.
  const bare = !key.includes('|');
  return authors.filter((a) => {
    if (a.family === null) return false;
    const own = authorKeys(`${a.family}, ${a.given ?? ''}`);
    const named = bare ? own.some((k) => k.split('|')[0] === key) : own.includes(key);
    if (!named) return false;
    return !secondInitials?.size || secondInitials.has(initialsOf(a.given)[1] ?? '');
  });
}

/**
 * Build the check graph.ts runs on each pair of papers sharing a key: true only when the
 * cache shows the key naming a different person on each paper. Resolutions are memoized,
 * since a common key is checked once per pair of the papers carrying it.
 */
export function differentPeopleCheck(
  cache: AuthorCache,
  refs: readonly (Pick<Reference, 'id' | 'doi'> & { authors?: string[] | null })[],
): (a: number, b: number, key: string) => boolean {
  const recordById = new Map<number, AuthorRecord>();
  const citedById = new Map<number, string[]>();
  for (const r of refs) {
    const k = doiKey(r.doi);
    const record = k ? cache.works[k] : undefined;
    if (record) recordById.set(r.id, record);
    citedById.set(r.id, r.authors ?? []);
  }
  // The second initials the paper's citations give under the key, when every one of them
  // gives one; otherwise no filter, since a single initial rules nobody out.
  const secondInitials = (id: number, key: string): Set<string> | undefined => {
    const cited = (citedById.get(id) ?? []).filter((s) => authorKeys(s).includes(key));
    const seconds = cited.map((s) => initialsOf(s.slice(s.indexOf(',') + 1))[1]);
    return cited.length > 0 && seconds.every(Boolean) ? new Set(seconds as string[]) : undefined;
  };
  const memo = new Map<string, Authorship[]>();
  const resolve = (id: number, key: string): Authorship[] => {
    const m = `${id}|${key}`;
    if (!memo.has(m)) {
      const record = recordById.get(id);
      memo.set(m, record ? authorshipsFor(record.authors, key, secondInitials(id, key)) : []);
    }
    return memo.get(m) ?? [];
  };
  return (a, b, key) => {
    const xs = resolve(a, key);
    const ys = resolve(b, key);
    if (xs.length === 0 || ys.length === 0) return false;
    return xs.every((x) => ys.every((y) => compareAuthorships(x, y) === 'different'));
  };
}

const paperDois = (refs: readonly Pick<Reference, 'doi'>[]): string[] =>
  [...new Set(refs.map((r) => doiKey(r.doi)).filter((d): d is string => d !== null))].sort();

/**
 * DOIs of papers that have a DOI but no record in the cache: the fetch has not run for
 * them since they were added. A paper with no DOI cannot have a record at all, so it
 * always joins by name and is not listed here.
 */
export function uncachedDois(cache: AuthorCache | null, refs: readonly Pick<Reference, 'doi'>[]): string[] {
  return paperDois(refs).filter((d) => !cache?.works[d]);
}

/**
 * DOIs whose record names no one: no registry holds the DOI (source `none`, which is
 * where a mistyped DOI shows up), or its record lists only organizations. Their joins
 * use names only, and nothing a fetch can do changes that, so they are reported rather
 * than failed on.
 */
export function unnamedDois(cache: AuthorCache | null, refs: readonly Pick<Reference, 'doi'>[]): string[] {
  return paperDois(refs).filter((d) => cache?.works[d] && cache.works[d].authors.length === 0);
}
