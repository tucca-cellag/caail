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

import type { PapersData } from './types.js';

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
  checkRetiredIdGaps(model, warnings);
  checkUnparsedApaFields(model, warnings);

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
 * Emit one warning per reference that has one or more null APA fields
 * (authors, year, title, journal, doi). Names which fields are null so
 * a human can hand-fix the citation.
 *
 * Output is sorted by ascending id.
 */
function checkUnparsedApaFields(model: PapersData, warnings: string[]): void {
  const apaFields = ['authors', 'year', 'title', 'journal', 'doi'] as const;

  const affected: Array<{ id: number; nullFields: string[] }> = [];

  for (const ref of model.references) {
    const nullFields = apaFields.filter((f) => ref[f] === null);
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
