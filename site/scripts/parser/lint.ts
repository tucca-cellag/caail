/**
 * lint.ts — matrix↔reference integrity linter for the CAAIL papers model.
 *
 * Operates on a fully-built PapersData model (no I/O, no markdown parsing).
 * Returns a LintResult with `errors` (hard failures → CLI exit 1) and
 * `warnings` (advisory → CLI exit 0).
 *
 * Rules
 * ─────
 * HARD ERRORS
 *   1. Dangling matrix citation  — a cell's refId has no matching reference.
 *   2. Unreachable primary ref   — a section="References" ref cited by no cell.
 *   3. Duplicate reference id    — the same id appears on 2+ references.
 *
 * WARNINGS
 *   4. Retired-ID gaps           — integers in [min id, max id] with no reference.
 *   5. Unparsed APA fields       — any of authors/year/title/journal/doi is null.
 *
 * All output messages are deterministic (ascending id order) and greppable
 * (every message includes the affected `#N` id).
 */

import type { PapersData, Reference } from './types.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LintResult {
  errors: string[];
  warnings: string[];
}

/**
 * Run all integrity checks on a PapersData model.
 *
 * @param model  A fully-built PapersData object (from buildPapersModel or tests).
 * @returns      A LintResult with errors and warnings arrays.
 */
export function lint(model: PapersData): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  checkDanglingCitations(model, errors);
  checkUnreachablePrimaries(model, errors);
  checkDuplicateIds(model, errors);
  checkDuplicateCitations(model, errors);
  checkRetiredIdGaps(model, warnings);
  checkUnparsedApaFields(model, warnings);
  checkDroppedAuthorTokens(model, warnings);

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Rule 1 — Dangling matrix citations
// ---------------------------------------------------------------------------

/**
 * Flag every (cell, refId) pair where refId has no matching reference entry.
 * Messages include the cell coordinates (method × area) and the missing #N.
 * Output is sorted: by cell method, then area, then ascending refId.
 */
function checkDanglingCitations(model: PapersData, errors: string[]): void {
  const refIdSet = new Set(model.references.map((r) => r.id));

  // Collect unique (method, area, missingId) tuples to avoid duplicate messages
  // when the same id is missing in multiple cells.
  const seen = new Set<string>();
  const findings: Array<{ method: string; area: string; refId: number }> = [];

  for (const cell of model.cells) {
    for (const refId of cell.refIds) {
      if (!refIdSet.has(refId)) {
        const key = `${cell.method}\0${cell.area}\0${refId}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push({ method: cell.method, area: cell.area, refId });
        }
      }
    }
  }

  // Sort for deterministic output: by method, then area, then ascending refId
  findings.sort(
    (a, b) =>
      a.method.localeCompare(b.method) ||
      a.area.localeCompare(b.area) ||
      a.refId - b.refId,
  );

  for (const { method, area, refId } of findings) {
    errors.push(
      `Dangling citation: cell "${method} × ${area}" cites #${refId} but no reference with that id exists`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 2 — Unreachable primary references
// ---------------------------------------------------------------------------

/**
 * Flag every reference whose section is exactly "References" (the canonical
 * ## heading for primary-research entries) that is not cited by any matrix cell.
 *
 * EXEMPT sections (not flagged, regardless of citation status):
 *   - "Reviews & Perspectives"
 *   - Any other section (e.g. "Human Reference Work", "CHO Reference Work", etc.)
 *
 * Output is sorted by ascending id.
 */
function checkUnreachablePrimaries(model: PapersData, errors: string[]): void {
  // Collect all refIds cited across all cells.
  const citedIds = new Set<number>();
  for (const cell of model.cells) {
    for (const id of cell.refIds) {
      citedIds.add(id);
    }
  }

  const unreachable: number[] = [];
  for (const ref of model.references) {
    if (ref.section === 'References' && !citedIds.has(ref.id)) {
      unreachable.push(ref.id);
    }
  }

  unreachable.sort((a, b) => a - b);

  for (const id of unreachable) {
    errors.push(
      `Unreachable primary reference: #${id} is listed under "## References" but is not cited in any matrix cell`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 3 — Duplicate reference ids
// ---------------------------------------------------------------------------

/**
 * Flag any id that appears on more than one reference entry.
 * Output is sorted by ascending id.
 */
function checkDuplicateIds(model: PapersData, errors: string[]): void {
  const countById = new Map<number, number>();
  for (const ref of model.references) {
    countById.set(ref.id, (countById.get(ref.id) ?? 0) + 1);
  }

  const duplicates = [...countById.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((a, b) => a - b);

  for (const id of duplicates) {
    const count = countById.get(id)!;
    errors.push(
      `Duplicate reference id: #${id} appears ${count} times — reference ids must be unique`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rule 3b — Duplicate citation within a single matrix cell
// ---------------------------------------------------------------------------

/**
 * Flag any reference cited more than once in the SAME matrix cell (same method ×
 * area). Harmless in the rendered Markdown, but the DB's matrix_cells PK is
 * (method, area_key, ref_id), so a repeat crashes `db:bootstrap` with a UNIQUE
 * violation — catch it here at lint time with a clear, actionable message instead.
 */
function checkDuplicateCitations(model: PapersData, errors: string[]): void {
  for (const cell of model.cells) {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const refId of cell.refIds) {
      if (seen.has(refId)) dupes.add(refId);
      seen.add(refId);
    }
    for (const refId of [...dupes].sort((a, b) => a - b)) {
      errors.push(
        `Duplicate citation: #${refId} appears more than once in the ${cell.method} × ${cell.area} cell`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 4 — Retired-ID gaps (warning)
// ---------------------------------------------------------------------------

/**
 * Within the inclusive range [minId, maxId] of all reference ids, emit a
 * warning for any integer that has no reference entry. Gaps are expected
 * (CAAIL retires ids rather than renumbering), so this is advisory only.
 *
 * Contiguous runs of gaps are reported as a compact range "N–M" to keep
 * output readable; single-id gaps are reported as just "#N".
 */
function checkRetiredIdGaps(model: PapersData, warnings: string[]): void {
  if (model.references.length === 0) return;

  const ids = new Set(model.references.map((r) => r.id));
  const minId = Math.min(...ids);
  const maxId = Math.max(...ids);

  // Collect all gap ids in ascending order.
  const gaps: number[] = [];
  for (let id = minId; id <= maxId; id++) {
    if (!ids.has(id)) gaps.push(id);
  }

  if (gaps.length === 0) return;

  // Compress contiguous runs into ranges for readability.
  const segments: string[] = [];
  let rangeStart = gaps[0];
  let rangeEnd = gaps[0];

  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i] === rangeEnd + 1) {
      rangeEnd = gaps[i];
    } else {
      segments.push(formatGapSegment(rangeStart, rangeEnd));
      rangeStart = gaps[i];
      rangeEnd = gaps[i];
    }
  }
  segments.push(formatGapSegment(rangeStart, rangeEnd));

  warnings.push(
    `Retired-ID gaps: the following id(s) in [#${minId}–#${maxId}] have no reference entry (expected — CAAIL retires ids rather than renumbering): ${segments.join(', ')}`,
  );
}

function formatGapSegment(start: number, end: number): string {
  return start === end ? `#${start}` : `#${start}–#${end}`;
}

// ---------------------------------------------------------------------------
// Rule 5 — Unparsed APA fields (warning)
// ---------------------------------------------------------------------------

/**
 * Known permalink hosts that stand in for a DOI on theses and workshop/poster
 * papers (eScholarship, OpenReview). Deliberately a host allowlist, not "any
 * non-doi.org URL": a mistyped landing-page URL for a resource that *does* have
 * a DOI (e.g. a `zenodo.org` page instead of its `https://doi.org/…` form)
 * should still warn. Extend this list as new legitimate permalink hosts appear.
 */
const PERMALINK_HOST_RE = /https?:\/\/(?:www\.)?(?:escholarship\.org|openreview\.net)\//i;

/**
 * Preprint-server DOI prefixes for venues that have no journal: bioRxiv/medRxiv
 * (`10.1101`, and the newer Cold Spring Harbor prefix `10.64898`) and arXiv
 * (`10.48550`). Preprint detection is DOI-based on purpose — matching the word
 * "arXiv"/"bioRxiv" anywhere in the raw text would wrongly suppress a genuine
 * parse miss on a published article that merely mentions a preprint.
 */
const PREPRINT_DOI_RE = /^10\.(?:1101|64898|48550)\//;

/**
 * Is a null field legitimately absent for this reference kind, rather than a
 * parse failure a human could fix by editing the citation text? (Issue #72.)
 *
 *   - doi:     theses and workshop/poster papers carry a known permalink
 *              (eScholarship, OpenReview) instead of a DOI. A null doi is
 *              expected only when one of those hosts is present.
 *   - journal: preprints (identified by a preprint-server DOI prefix) have no
 *              journal — a null there is correct, not a parse miss.
 *
 * Every other null field (authors, year, title, or a doi/journal null without
 * one of these signals) is still flagged.
 */
function isExpectedNull(ref: Reference, field: string): boolean {
  if (field === 'doi') return PERMALINK_HOST_RE.test(ref.raw);
  if (field === 'journal') return ref.doi !== null && PREPRINT_DOI_RE.test(ref.doi);
  return false;
}

/**
 * Emit one warning per reference that has one or more null APA fields
 * (authors, year, title, journal, doi). Names which fields are null so
 * a human can hand-fix the citation. Fields that are legitimately absent for
 * the reference kind (see isExpectedNull) are not flagged.
 *
 * Output is sorted by ascending id.
 */
function checkUnparsedApaFields(model: PapersData, warnings: string[]): void {
  const apaFields = ['authors', 'year', 'title', 'journal', 'doi'] as const;

  const affected: Array<{ id: number; nullFields: string[] }> = [];

  for (const ref of model.references) {
    const nullFields = apaFields.filter(
      (f) => ref[f] === null && !isExpectedNull(ref, f),
    );
    if (nullFields.length > 0) {
      affected.push({ id: ref.id, nullFields });
    }
  }

  affected.sort((a, b) => a.id - b.id);

  for (const { id, nullFields } of affected) {
    warnings.push(
      `Unparsed APA fields on #${id}: ${nullFields.join(', ')} ${nullFields.length === 1 ? 'is' : 'are'} null — hand-fix the citation text`,
    );
  }
}

/**
 * Emit one warning per reference whose author run had one or more unpairable
 * tokens silently dropped from `authors` (an internal-comma org suffix, a
 * mononym, or a malformed personal author such as a missing-period initial).
 *
 * `authors` can be non-null while tokens were dropped — valid neighbours are
 * recovered and the bad token skipped (#96) — so a partial-parse would slip
 * past checkUnparsedApaFields (which only fires on a literal `null`). This makes
 * that silent loss visible so a curator can hand-fix the citation text.
 *
 * Output is sorted by ascending id.
 */
function checkDroppedAuthorTokens(model: PapersData, warnings: string[]): void {
  const affected = model.references
    .filter((ref) => ref.authorsDropped > 0)
    .sort((a, b) => a.id - b.id);

  for (const ref of affected) {
    const n = ref.authorsDropped;
    warnings.push(
      `Dropped ${n} unparseable author ${n === 1 ? 'token' : 'tokens'} on #${ref.id} — the parsed author list is incomplete; hand-fix the citation text`,
    );
  }
}
