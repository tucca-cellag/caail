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
 * Crossref does not hold (DataCite registers arXiv's, for example).
 *
 * Two papers' authorships under one key compare as:
 *   - same person: the ORCIDs match, or the given names agree: equal once initials and
 *     separators are dropped, one a prefix of the other ("Chris" and "Christopher"), or
 *     every part of one among the other's parts ("Maria" and "Ana Maria");
 *   - unknown: a given name that is initials only or starts with one ("J. Craig", "JP"), or
 *     first names of five or more letters one letter apart ("Mohamed" and "Mohammed", also
 *     with a second name on one side only), which is as likely a spelling variant as a
 *     different person;
 *   - different people: both given names known in full and none of the above.
 * Only "different people" removes a join. To find the authorship a citation names, the
 * check uses position first: when a paper's citation and its record list the same number
 * of people, the cited author at position i is the record's author at position i, as long
 * as that authorship carries the same key. Otherwise it matches by name, through every key
 * the citation's author has (so "Müller" finds a record spelled "Mueller"); when the
 * citation gives a second initial ("Kim, J. W."), an authorship with a different second
 * initial is ruled out, while one with none is kept, since a record may write "Jong Woo"
 * as "Jongwoo" and dropping the cited person would leave co-authors to decide. A record
 * listing fewer people than the citation is not used at all, since the cited person may
 * be the one it lacks.
 * Where a key resolves to several authorships, the join is removed only when every one of
 * them is a different person from every one on the other paper. An authorship that cannot
 * be found keeps its join, so the rule never removes an edge without evidence.
 *
 * Known gaps, both deferred to tucca-cellag/caail-planning#573: a nickname that is not a
 * prefix of the full name ("Mike" and "Michael"), and a romanization two or more letters
 * from another ("Muhammed" and "Mohammad", "Donghyun" and "Donghyeon"), read as different
 * people unless both authorships carry the same ORCID.
 *
 * Different ORCIDs alone are not evidence, because one person can hold two ORCID
 * records: Kexin Huang carries one ORCID on ref 49 and another on ref 123.
 *
 * OpenAlex author ids were tried first and rejected. OpenAlex's record of ref 49 lists
 * no Liu at all, and it splits one person across ids; the evidence is on
 * tucca-cellag/caail-planning#552.
 *
 * Pure apart from loadAuthorCache, which reads the committed file.
 */

import { existsSync, readFileSync } from 'node:fs';
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

/**
 * Read and validate the committed author cache, or null when there is none, in which case
 * every shared-author join uses names only.
 */
export function loadAuthorCache(path: string = AUTHOR_CACHE_PATH): AuthorCache | null {
  if (!existsSync(path)) return null;
  return AuthorCacheSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

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
  return nameTokens(name)
    .flatMap((t) => {
      const letters = t.replace(/[^\p{L}]/gu, '');
      return isInitialsToken(t) ? [...letters] : [letters[0]];
    })
    .map((c) => foldName(c).charAt(0))
    .filter(Boolean);
}

/** A name's tokens, split at spaces, hyphens and periods, keeping only those with a letter. */
function nameTokens(name: string): string[] {
  return name
    .normalize('NFC')
    .replace(/\./g, ' ')
    .split(/[\s\-‐‑–]+/)
    .filter((t) => /\p{L}/u.test(t));
}

/** A token that stands for initials: one letter, or two or three capitals and no lowercase ("JP", "DE"). */
function isInitialsToken(token: string): boolean {
  const letters = token.replace(/[^\p{L}]/gu, '');
  if (letters.length <= 1) return true;
  return letters.length <= 3 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * A given name split into the parts that can tell two people apart: folded, initials
 * dropped, split at spaces and hyphens. "Yusuf H." → ["yusuf"], "Ji-Hoe" → ["ji", "hoe"].
 * Empty when there is nothing to compare: no name, a name of initials only ("JP"), or a
 * name that starts with an initial ("J. Craig"), since someone who goes by a middle name
 * may appear elsewhere under the first.
 */
export function givenParts(given: string | null): string[] {
  if (!given) return [];
  const tokens = nameTokens(given);
  if (tokens.length === 0 || isInitialsToken(tokens[0])) return [];
  return tokens
    .filter((t) => !isInitialsToken(t))
    .map((t) => foldName(t).replace(/[^a-z]/g, ''))
    .filter((t) => t.length > 1);
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
  const nearMiss = (x: string, y: string) => Math.min(x.length, y.length) >= 5 && withinOneEdit(x, y);
  if (nearMiss(ja, jb) || nearMiss(pa[0], pb[0])) return 'unknown';
  return 'different';
}

/** A registry authorship with the keys it matches under, computed once per record. */
export type KeyedAuthorship = { authorship: Authorship; keys: string[] };

/** A record's authorships with their keys, in record order, skipping any with no family name. */
export const keyAuthorships = (authors: readonly Authorship[]): KeyedAuthorship[] =>
  authors
    .filter((a) => a.family !== null)
    .map((a) => ({ authorship: a, keys: authorKeys(`${a.family}, ${a.given ?? ''}`) }));

/**
 * Every authorship in a keyed record that a citation's keys name (`authorKeys` of the
 * citation): usually one, none when the record spells the name differently from the
 * citation, and several when two authors on the paper share a key. Each authorship is
 * keyed with `authorKeys` itself, from its family name and full given name, so the cache
 * and the citation strings can only disagree where their spellings do, never where two
 * copies of the keying rule would. With `secondInitials`, an authorship whose second
 * initial is not among them is ruled out; one with no second initial cannot be checked and
 * is kept. This is the name match differentPeopleCheck falls back to.
 */
export function authorshipsFor(
  keyed: readonly KeyedAuthorship[],
  keys: readonly string[],
  secondInitials?: ReadonlySet<string>,
): Authorship[] {
  const exact = new Set(keys.filter((k) => k.includes('|')));
  // A key with no initial (the citation gave none) matches on the surname alone.
  const bare = new Set(keys.filter((k) => !k.includes('|')));
  return keyed
    .filter(({ authorship, keys: own }) => {
      if (!own.some((k) => exact.has(k) || bare.has(k.split('|')[0]))) return false;
      const second = initialsOf(authorship.given)[1];
      return !secondInitials?.size || second === undefined || secondInitials.has(second);
    })
    .map((k) => k.authorship);
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
  type Cited = { keys: string[]; second: string | undefined; position: number };
  type Paper = { keyed: KeyedAuthorship[] | null; aligned: boolean; cited: Cited[] };
  const papers = new Map<number, Paper>();
  for (const r of refs) {
    const k = doiKey(r.doi);
    const record = k ? cache.works[k] : undefined;
    // A person in a citation is "Surname, Initials"; a string with no comma (an
    // organization) has no counterpart in the record, which drops organizations.
    let person = 0;
    const cited = (r.authors ?? []).map((s) => ({
      keys: authorKeys(s),
      second: initialsOf(s.slice(s.indexOf(',') + 1))[1],
      position: s.includes(',') ? person++ : -1,
    }));
    const keyed = record ? keyAuthorships(record.authors) : null;
    // A record listing fewer people than the citation may lack the cited person, so a
    // same-key co-author could stand in for them: such a record is not used at all.
    const usable = keyed !== null && keyed.length >= person;
    papers.set(r.id, { keyed: usable ? keyed : null, aligned: usable && keyed!.length === person, cited });
  }
  // The authorships behind a key on a paper: by position when the paper's lists align and
  // the authorship there carries the key, else by name (see authorshipsFor), per citation.
  const memo = new Map<string, Authorship[]>();
  const resolve = (id: number, key: string): Authorship[] => {
    const m = `${id}|${key}`;
    if (!memo.has(m)) {
      const paper = papers.get(id);
      const found = new Set<Authorship>();
      if (paper?.keyed) {
        for (const c of paper.cited.filter((x) => x.keys.includes(key))) {
          const at = paper.aligned && c.position >= 0 ? paper.keyed[c.position] : undefined;
          if (at && at.keys.some((k) => c.keys.includes(k))) {
            found.add(at.authorship);
            continue;
          }
          for (const a of authorshipsFor(paper.keyed, c.keys, c.second ? new Set([c.second]) : undefined)) found.add(a);
        }
      }
      memo.set(m, [...found]);
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

/**
 * DOIs as the cache keys them: bare, lowercase, deduplicated and sorted, with absent ones
 * dropped. The fetch asks for exactly these and the coverage check expects exactly these,
 * so both go through this one function.
 */
export function normalizeDois(dois: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(dois.map(doiKey).filter((d): d is string => d !== null))].sort();
}

const paperDois = (refs: readonly Pick<Reference, 'doi'>[]): string[] => normalizeDois(refs.map((r) => r.doi));

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
