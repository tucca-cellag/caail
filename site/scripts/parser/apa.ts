/**
 * apa.ts — pure, dependency-free APA citation field parser.
 *
 * Extracts structured fields from one raw APA reference paragraph string.
 * The input typically begins with an explicit HTML anchor (`<a id="N">N</a>`)
 * that is stripped before parsing.
 *
 * All fields degrade gracefully to `null` on parse failure; `authorsText` is
 * ALWAYS a string (never null). The function never throws.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApaFields {
  /** Parsed "Surname, Initials" entries; null if parsing failed. */
  authors: string[] | null;
  /**
   * Count of author-run tokens that could not be parsed and were dropped from
   * `authors` (an unpairable bare word — an internal-comma org suffix, a
   * mononym, or a malformed personal author such as a missing-period initial).
   * 0 when the run parsed cleanly. `authors` can be non-null while this is > 0
   * (valid neighbours recovered, some tokens skipped); consumers use this to
   * flag silent information loss the way they flag a fully-null `authors`.
   */
  authorsDropped: number;
  /** ALWAYS present: the author-run text, or the whole input if no year found. */
  authorsText: string;
  /** Publication year (4-digit integer); null if not found. */
  year: number | null;
  /** Paper title; null if not parsed. */
  title: string | null;
  /** Clean journal/venue NAME (volume, issue, pages stripped); null if not parsed. */
  journal: string | null;
  /** Bare DOI, e.g. "10.1016/j.scitotenv.2023.164988" (no URL prefix); null if absent. */
  doi: string | null;
}

// ---------------------------------------------------------------------------
// Regexes (compiled once)
// ---------------------------------------------------------------------------

/** Strip a leading `<a id="…">…</a>` anchor. */
const ANCHOR_RE = /^\s*<a\s+id="[^"]*">[^<]*<\/a>\s*/i;

/** Match doi.org URL; capture group 1 is the bare DOI. */
const DOI_RE = /https?:\/\/(?:dx\.)?doi\.org\/(\S+)/i;

/** Match `(YYYY)` or `(YYYYa)` etc.; capture group 1 is the 4 digits. */
const YEAR_RE = /\((\d{4})[a-z]?\)/;

/**
 * A single initial token: an uppercase letter followed by a dot, optionally
 * hyphen-compounded (`R.-R.`). The letter class is Unicode uppercase (`\p{Lu}`,
 * hence the `u` flag) so non-ASCII initials count — e.g. `Ł.` (ref 42), `Ø.`
 * (ref 180). Examples that must match a run of these: `A.`, `F. A.`, `R.-R.`.
 */
const INITIAL_TOKEN_RE = /^\p{Lu}\.(?:-\p{Lu}\.)*$/u;

/**
 * Surname particles that can trail (or interleave) the initials in an APA
 * author entry — e.g. `Magalhães, C. G. De` (ref 54), `Teba, P. R. de C.`
 * (ref 122). Matched case-insensitively; kept to genuine name particles so an
 * organisation word like "for" (in "Center for AI Safety") is NOT swallowed.
 */
const PARTICLE_RE =
  /^(?:de|del|della|der|den|da|das|dos|van|von|di|du|la|le|el|bin|ibn|ten|ter|af|av|zu)$/i;

/** A `*…*` italic run; capture group 1 is the content. One source for both regexes below. */
const ITALIC_SRC = String.raw`\*([^*]+)\*`;

/** Match the first italic run. */
const ITALIC_RE = new RegExp(ITALIC_SRC);

/** Every italic run, for choosing which one holds the venue. */
const ITALIC_ALL_RE = new RegExp(ITALIC_SRC, 'g');

/** A sentence end at the close of the text before an italic run. */
const SENTENCE_END_RE = /[.?!]$/;

/**
 * What must follow a mid-sentence italic run for it to be part of the title: a space
 * and a letter, so the sentence carries on ("of *Sus scrofa* muscle stem cells"). A
 * run followed straight by punctuation could as well be a journal after a missing full
 * stop ("A title *Journal*."), so it is not read as part of the title.
 */
const SENTENCE_GOES_ON_RE = /^\s+\p{L}/u;

/**
 * Where an APA "In" clause can start: just after the title's own sentence end. Global,
 * because a title may itself hold a sentence that starts with "In" ("What is meat? In
 * search of an answer."), and an editor may be surnamed In ("In J. In (Ed.),"). The
 * clause is the last start whose rest is a valid editors clause (see findVenueRun).
 */
const IN_START_RE = /[.?!]\*?\s+In\b/g;

/**
 * An editors' role, from a fixed list: Ed., Eds., Trans., and the French, German,
 * Spanish and Portuguese forms CAAIL's sources use, each with or without its full stop
 * and optionally after "Series". A fixed list, not "any bracketed words": that version
 * also took a title's own "(review)" for a role, and its nested quantifier backtracked
 * exponentially, so a title such as "In vitro culture (ab ab ... ab) of cells" could
 * stall the build.
 */
const ROLE = String.raw`(?:Series\s+)?(?:Eds?|Éds?|Hrsg|Coords?|Comps?|Dirs?|Orgs?|Trans)\.?`;

/** Editors' roles in brackets, "(Ed.)" to "(Ed. & Trans.)", in any case ("(eds.)"). */
const ROLES = String.raw`\(${ROLE}(?:\s*(?:&|and)\s*${ROLE})*\)`;

/**
 * Editors' roles in brackets anywhere in a string. Exported so a check on parsed
 * titles uses the parser's own list rather than a copy of it.
 */
export const EDITOR_ROLES_RE = new RegExp(ROLES, 'iu');

/**
 * What may follow the word "In" for it to be the clause rather than the start of a
 * title sentence: nothing, a colon, or editors with their roles in brackets ("(Ed.)",
 * "(Eds.)", "(Ed. & Trans.)", "(Hrsg.)"), then an optional comma, full stop or colon.
 * "In vitro growth of" has none of these, so it stays in the title. Named editors must
 * also start with a capital (see EDITORS_NAMED_RE), so "In cells (Ed.)." does not
 * qualify.
 */
const IN_REST_RE = new RegExp(String.raw`^:?(?:\s+[^*]*${ROLES}[.,:]?)?\s*$`, 'iu');

/**
 * The editors named after "In" or "In:": none, or names that start with a capital,
 * whether a person's ("A. Editor") or an organisation's ("World Health Organization").
 * A surname In's own "In" is followed by its role, "(Ed.)", so it never qualifies.
 */
const EDITORS_NAMED_RE = /^:?\s*$|^:?\s+\p{Lu}/u;

/** A string with its italic markers removed and their words kept. */
export function stripItalics(text: string): string {
  return text.replace(ITALIC_ALL_RE, '$1');
}

/** Title text as plain words: italic spans keep their words, not their markers. */
function titleFrom(text: string): string | null {
  return stripItalics(text)
    .trim()
    .replace(/\.\s*$/, '')  // strip trailing ". "
    .trim() || null;
}

/** Plain text after a title as its venue: no DOI, no surrounding full stops or spaces. */
function plainVenue(text: string): string | null {
  return text
    .replace(DOI_RE, '')   // remove DOI URL
    .trim()
    .replace(/^[.\s]+/, '') // strip leading dots/spaces
    .replace(/[.\s]+$/, '') || null; // strip trailing dots/spaces
}

/** An italic run's content as a venue: trimmed, without trailing full stops. */
function runContent(run: RegExpMatchArray): string {
  return run[1].trim().replace(/[.]+$/, '');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip volume/issue/page info from a journal+volume italic run.
 *
 * APA italic runs look like:
 *   "Bioinformatics, 37"        → "Bioinformatics"
 *   "Science of The Total Environment, 894,"  → "Science of The Total Environment"
 *   "npj Science of Food, 9"    → "npj Science of Food"
 *   "Science"                   → "Science"
 *   "arXiv."                    → "arXiv"
 *   "Bioinformatics, 37*(15)"   — the *(15) is OUTSIDE the italic but can leak in
 *
 * Strategy: strip trailing whitespace/punctuation, then remove a trailing
 * `, <digits>` (the volume), then strip any remaining trailing comma/period/space.
 */
function stripVolume(raw: string): string {
  // Remove trailing whitespace and trailing punctuation that is not part of the name
  let s = raw.trim().replace(/[.,\s]+$/, '');
  // Remove a trailing `, <digits>` (volume number), e.g. ", 37" or ", 894"
  s = s.replace(/,\s*\d+$/, '');
  // Strip any remaining trailing comma, period, or whitespace
  s = s.replace(/[.,\s]+$/, '');
  return s;
}

/**
 * Is `piece` an APA "given names" run — one or more initials, possibly
 * interleaved with surname particles?
 *
 * Accepts: `Y.`, `R. V.`, `R.-R.`, `Ł.`, `B. Ø.`, `C. G. De`, `P. R. de C.`
 * Rejects: `Stolovitzky` (plain word), `Consortium` (no initial), `` (empty).
 *
 * Requires ≥1 real initial so a bare particle or a plain surname word isn't
 * mistaken for initials. Used both to validate a paired initials piece and, on
 * look-ahead, to decide whether a token is a surname (paired with the next
 * piece) or a standalone consortium/organisation author (no initials follow).
 */
function isGivenNames(piece: string): boolean {
  const tokens = piece.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let sawInitial = false;
  for (const t of tokens) {
    if (INITIAL_TOKEN_RE.test(t)) sawInitial = true;
    else if (!PARTICLE_RE.test(t)) return false;
  }
  return sawInitial;
}

/**
 * Parse the author run string into individual author entries.
 *
 * APA author lists mostly alternate "Surname, Initials" pairs:
 *   "Ji, Y., Zhou, Z., Liu, H., & Davuluri, R. V."
 *   "Kuhl, E."
 * but real citations also contain:
 *   - surname particles trailing the initials — "Magalhães, C. G. De" (ref 54)
 *   - non-ASCII initials — "Smoliński, Ł." (ref 42), "Palsson, B. Ø." (ref 180)
 *   - non-personal (consortium/org) authors with no initials —
 *     "DREAM Olfaction Prediction Consortium" (ref 80), "Scale AI" (ref 158)
 *   - an APA "…" ellipsis marking omitted authors — "… Scaramuzza, D." (ref 158)
 *
 * So rather than assuming strict even pairs, we walk the comma-separated pieces
 * and decide each one's role by looking ahead: a piece followed by an
 * initials/given-names piece is a personal author (paired); a multi-word piece
 * with no initials following is a standalone organisation author.
 *
 * A bare single word with no following initials is skipped rather than aborting
 * the whole run (#96), so an internal-comma organisation suffix ("University of
 * California, Davis" → the orphaned "Davis") or a stray mononym no longer
 * discards the valid authors around it. Each skipped token is *counted* and
 * returned as `dropped`: recovery is not free — a dropped token is silent
 * information loss (a truncated org name, a lost mononym, or a malformed
 * personal author such as a missing-period initial in "…, Davis, M, …"), so the
 * caller surfaces `dropped > 0` exactly as it surfaces a fully-null `authors`.
 * A run where NOTHING parses (a lone "Smith") still returns `authors: null`.
 *
 * Accepted limitation (#96 §2): an organisation name followed by a spaced
 * multi-letter acronym ("World Health Organization, U. N.") is glued into a
 * fake "Surname, Initials" pair, because "U. N." is byte-identical to real
 * initials — the surname/org distinction here is semantic, not structural, and
 * any "multi-word surname" heuristic would misparse genuine multi-word surnames
 * ("Lloyd Webber, A. J."). Does not occur in the corpus.
 *
 * @returns `authors` (null only when nothing parsed) and `dropped`, the count
 *          of unpairable tokens skipped.
 */
function parseAuthors(authorsText: string): { authors: string[] | null; dropped: number } {
  if (!authorsText.trim()) return { authors: null, dropped: 0 };

  // Remove the ampersand prefix from the final author ("& Jones" → "Jones")
  // without disturbing the ", " separators the split relies on.
  const normalized = authorsText.replace(/&\s*/g, '');
  const pieces = normalized.split(', ');

  const authors: string[] = [];
  let dropped = 0;
  let i = 0;
  while (i < pieces.length) {
    // Strip a leading APA ellipsis ("… Scaramuzza" → "Scaramuzza"; the ellipsis
    // may be the literal "..." or the "…" character) before reading the surname.
    const surname = pieces[i].replace(/^[.…\s]+/, '').trim();
    i += 1;
    if (!surname) continue; // a lone ellipsis piece — not a dropped author, skip it

    const next = i < pieces.length ? pieces[i].trim() : null;
    if (next && isGivenNames(next)) {
      // Personal author: "Surname, Initials" (initials may carry a particle).
      authors.push(`${surname}, ${next}`);
      i += 1;
    } else if (/\s/.test(surname)) {
      // No initials follow and the piece is multi-word → a standalone
      // consortium/organisation author (kept verbatim).
      authors.push(surname);
    } else {
      // A bare single word with no following initials. Skip just this token and
      // keep walking rather than nulling the ENTIRE run (#96) — the old abort
      // also discarded any authors already parsed and any that follow. Skipping
      // recovers the valid neighbours around an internal-comma organisation
      // suffix ("University of California, Davis" → the orphaned "Davis") or a
      // stray mononym. Count it so the caller can flag the silent loss.
      dropped += 1;
      continue;
    }
  }

  // Null only when NOTHING parsed: a fully-unparseable run (a lone "Smith", or
  // "Plato, Aristotle") returns null. A run with at least one good author
  // survives with its bad tokens skipped — those are reported via `dropped`.
  return { authors: authors.length > 0 ? authors : null, dropped };
}

/**
 * Find the italic run that holds the venue, and where the title ends.
 *
 * The venue is the first italic run that follows an APA "In" clause or a sentence end.
 * A run that starts mid-sentence belongs to the title, such as the species name in
 * ref 83's "modeling of *Sus scrofa* muscle stem cells". Taking the first run of any
 * kind is what cut that title short and left the "In ..." clause on refs 33, 186 and
 * 203 (tucca-cellag/caail-planning#445). The first qualifying run, so an italic run
 * after the venue (an italicised publisher, a note) never takes its place.
 *
 * The rule aims never to read a citation worse than taking the first run did. Where
 * the text cannot tell two shapes apart it keeps the first-run reading: an
 * abbreviation's full stop ("Cells vs. *E. coli* growth.") reads as a sentence end, as
 * "Role of vitamin D. *Nutrients*" needs it to; a mid-sentence run followed straight by
 * punctuation stops the search (SENTENCE_GOES_ON_RE); and a title sentence that starts
 * "In *Bos taurus* ..." reads as a chapter's "In *Book*". Storing titles and venues in
 * the DB would end the guessing (tucca-cellag/caail-planning#705).
 *
 * Returns null when no run qualifies; the caller then takes the first run.
 */
function findVenueRun(tail: string): { run: RegExpMatchArray; titleEnd: number } | null {
  // Every place an "In" clause could start, found once rather than per run.
  const inStarts = [...tail.matchAll(IN_START_RE)];
  for (const run of tail.matchAll(ITALIC_ALL_RE)) {
    const before = tail.slice(0, run.index).replace(/\s+$/, '');
    // The "In" clause first: an editors clause can itself end in a full stop. The
    // clause is the last start before this run whose rest is a valid editors clause,
    // never an earlier "In" title sentence nor an editor surnamed In.
    const restOf = (s: RegExpMatchArray) => before.slice(s.index! + s[0].length);
    const start = inStarts
      .filter((s) => s.index! + s[0].length <= before.length)
      .findLast((s) => EDITORS_NAMED_RE.test(restOf(s)) && IN_REST_RE.test(restOf(s)));
    if (start) {
      return { run, titleEnd: start.index! + /^[.?!]\*?/.exec(start[0])![0].length };
    }
    if (SENTENCE_END_RE.test(before)) return { run, titleEnd: before.length };
    // A mid-sentence run is part of the title only if the sentence goes on after it.
    if (!SENTENCE_GOES_ON_RE.test(tail.slice(run.index! + run[0].length))) return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Parse one APA reference paragraph string into structured fields.
 *
 * @param raw  The raw reference text, optionally starting with `<a id="N">N</a>`.
 * @returns    Parsed fields; any field that can't be determined is null (except authorsText).
 */
export function parseApa(raw: string): ApaFields {
  // ------------------------------------------------------------------
  // Step 1: Strip anchor and trim.
  // ------------------------------------------------------------------
  const stripped = raw.replace(ANCHOR_RE, '').trim();

  // ------------------------------------------------------------------
  // Step 2: Extract DOI (independent of structure).
  // ------------------------------------------------------------------
  const doiMatch = DOI_RE.exec(stripped);
  // Strip any trailing punctuation that may have been captured
  const doi = doiMatch ? doiMatch[1].replace(/[.,)]+$/, '') : null;

  // ------------------------------------------------------------------
  // Step 3: Split on year to get authorsText and tail.
  //
  // Restrict the year search to the portion of the string BEFORE the DOI.
  // In an APA reference the year always precedes the DOI, so searching the
  // full string risks matching a parenthesised 4-digit token inside a DOI
  // path (e.g. "…/(2021)v2") as the publication year.
  // ------------------------------------------------------------------
  const yearSearchTarget = doiMatch ? stripped.slice(0, doiMatch.index) : stripped;
  const yearMatch = YEAR_RE.exec(yearSearchTarget);

  if (!yearMatch) {
    // No year found: degrade everything except doi. No author run was parsed,
    // so nothing was dropped.
    return {
      authors: null,
      authorsDropped: 0,
      authorsText: stripped,
      year: null,
      title: null,
      journal: null,
      doi,
    };
  }

  const year = parseInt(yearMatch[1], 10);
  const yearStart = yearMatch.index; // index of '(' in "(YYYY)"
  const yearEnd = yearMatch.index + yearMatch[0].length; // index after ')'

  // authorsText = text before the '(' of the year, trimmed of trailing whitespace/comma
  const authorsText = stripped.slice(0, yearStart).replace(/[\s,]+$/, '');

  // tail = text after the ')' of the year.
  // APA format is "(YEAR). Title…" — strip the leading '. ' separator.
  const tail = stripped.slice(yearEnd).trim().replace(/^[.\s]+/, '');

  // ------------------------------------------------------------------
  // Step 4: Parse authors from authorsText.
  // ------------------------------------------------------------------
  const { authors, dropped: authorsDropped } = parseAuthors(authorsText);

  // ------------------------------------------------------------------
  // Step 5: Parse title and journal from tail.
  //
  // The first italic run decides the branch: a tail that opens with an italic run
  // that ends the title is an italic-title citation (a preprint, a thesis, a
  // report). Otherwise the venue is chosen by findVenueRun, which is often not the
  // first run, and the first run is only its fallback.
  // ------------------------------------------------------------------
  const italicMatch = ITALIC_RE.exec(tail);

  if (!italicMatch) {
    // No italic run — set title/journal to null (graceful)
    return {
      authors,
      authorsDropped,
      authorsText,
      year,
      title: null,
      journal: null,
      doi,
    };
  }

  const italicStart = italicMatch.index;
  const italicContent = runContent(italicMatch);
  const afterItalic = tail.slice(italicMatch.index + italicMatch[0].length);

  // Determine which branch we're in.
  // "Italic-title" (preprint) pattern: the tail begins with the italic run
  // (nothing or only whitespace/dot before the first `*`), and that run ends the
  // title: a full stop inside it, or straight after it one of . ? ! , ( [ or the end,
  // as in "*Title* [Report]", "*Title* (2nd ed.)" or "*Title*, arXiv". A run that
  // opens the title and is followed by more of it, as in "*Sus scrofa* muscle stem
  // cells. *Journal*", is part of a normal title, read through findVenueRun.
  const beforeItalic = tail.slice(0, italicStart);
  const opensTail = beforeItalic.trim() === '' || beforeItalic.trim() === '.';
  const endsTitle = /[.?!]$/.test(italicMatch[1].trim()) || /^\s*(?:[.?!,([]|$)/.test(afterItalic);
  const venue = opensTail && endsTitle ? null : findVenueRun(tail);
  // With no venue run, a tail that opens with an italic run keeps the italic-title
  // reading, as it always had: nothing in the text gives a better one, and the title
  // is then at least never null.
  const isItalicTitle = opensTail && (endsTitle || !venue);

  let title: string | null;
  let journal: string | null;

  if (isItalicTitle) {
    // Preprint italic-title branch (ref 160 pattern):
    //   italic = title
    //   plain text after italic = venue
    title = italicContent;
    journal = plainVenue(afterItalic);
  } else if (venue) {
    // Normal APA branch (ref 6, 1, 37, 92, 39-plain pattern):
    //   text before the venue run = title
    //   venue run = journal+volume, or a chapter's book or proceedings title
    // The venue is not always the first run: see findVenueRun.
    title = titleFrom(tail.slice(0, venue.titleEnd));
    journal = stripVolume(runContent(venue.run)) || null;
  } else {
    // No run qualifies: the first run is the venue, as before, which is right for a
    // citation missing the full stop before its journal.
    title = titleFrom(beforeItalic);
    journal = stripVolume(italicContent) || null;
  }

  return {
    authors,
    authorsDropped,
    authorsText,
    year,
    title,
    journal,
    doi,
  };
}
