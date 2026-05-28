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
 * Validate that a piece looks like APA initials:
 * one or more segments of the form `X.`, optionally separated by `-` or space.
 * Examples that must match: `A.`, `F. A.`, `R.-R.`, `P. G. K.`, `R. V.`
 */
const INITIALS_RE = /^(?:[A-Z]\.[-\s]?)+$/;

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
 * Parse the author run string into individual "Surname, Initials" entries.
 *
 * APA author lists look like:
 *   "Ji, Y., Zhou, Z., Liu, H., & Davuluri, R. V."
 *   "Kuhl, E."
 *   "Datta, B., ... & Kuhl, E."  (truncated — treated gracefully)
 *
 * Algorithm:
 * 1. Normalize "& " → "" (remove the ampersand prefix from the last author).
 * 2. Split on ", " to get alternating [Surname, Initials, Surname, Initials, …].
 * 3. Pair them up and validate.
 *
 * Returns null if the run can't be cleanly parsed into at least one valid pair.
 */
function parseAuthors(authorsText: string): string[] | null {
  if (!authorsText.trim()) return null;

  // Normalize: remove the ampersand only (not surrounding whitespace) so that
  // ", & Davuluri, R. V." → ", Davuluri, R. V." and the ", " split still works.
  const normalized = authorsText.replace(/&\s*/g, '');

  // Split on ", " to get pieces
  const pieces = normalized.split(', ');

  // We need an even number of pieces to pair them (Surname, Initials, ...)
  if (pieces.length === 0 || pieces.length % 2 !== 0) {
    return null;
  }

  const authors: string[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    const surname = pieces[i].trim();
    const initials = pieces[i + 1].trim();

    if (!surname) return null;

    // Validate initials
    if (!INITIALS_RE.test(initials)) {
      return null;
    }

    authors.push(`${surname}, ${initials}`);
  }

  return authors.length > 0 ? authors : null;
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
  // ------------------------------------------------------------------
  const yearMatch = YEAR_RE.exec(stripped);

  if (!yearMatch) {
    // No year found: degrade everything except doi
    return {
      authors: null,
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
  const authors = parseAuthors(authorsText);

  // ------------------------------------------------------------------
  // Step 5: Parse title and journal from tail.
  //
  // Find the first italic run `*…*` in the tail.
  // We use a non-greedy match for content between * delimiters.
  // Must NOT cross a newline.
  // ------------------------------------------------------------------
  // Find the first `*` and the matching closing `*`
  const ITALIC_RE = /\*([^*]+)\*/;
  const italicMatch = ITALIC_RE.exec(tail);

  if (!italicMatch) {
    // No italic run — set title/journal to null (graceful)
    return {
      authors,
      authorsText,
      year,
      title: null,
      journal: null,
      doi,
    };
  }

  const italicStart = italicMatch.index;
  const italicContent = italicMatch[1].trim().replace(/[.]+$/, ''); // strip trailing dots
  const afterItalic = tail.slice(italicMatch.index + italicMatch[0].length);

  // Determine which branch we're in.
  // "Italic-title" (preprint) pattern: the tail begins with the italic run
  // (nothing or only whitespace/dot before the first `*`).
  const beforeItalic = tail.slice(0, italicStart);
  const isItalicTitle = beforeItalic.trim() === '' || beforeItalic.trim() === '.';

  let title: string | null;
  let journal: string | null;

  if (isItalicTitle) {
    // Preprint italic-title branch (ref 160 pattern):
    //   italic = title
    //   plain text after italic = venue
    title = italicContent;

    // Extract venue from text after the closing `*`
    // Strip up to the DOI (if present), then strip trailing/leading punctuation
    const venueRaw = afterItalic
      .replace(DOI_RE, '')   // remove DOI URL
      .trim()
      .replace(/^[.\s]+/, '') // strip leading dots/spaces
      .replace(/[.\s]+$/, ''); // strip trailing dots/spaces

    journal = venueRaw || null;
  } else {
    // Normal APA branch (ref 6, 1, 37, 92, 39-plain pattern):
    //   plain text before italic = title
    //   italic run = journal+volume
    title = beforeItalic
      .trim()
      .replace(/\.\s*$/, '')  // strip trailing ". "
      .trim() || null;

    // Journal = italic content with volume stripped
    journal = stripVolume(italicContent) || null;
  }

  return {
    authors,
    authorsText,
    year,
    title,
    journal,
    doi,
  };
}
