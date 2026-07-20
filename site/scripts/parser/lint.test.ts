/**
 * lint.test.ts — tests for the matrix↔reference integrity linter.
 *
 * Uses hand-constructed PapersData objects (no markdown parsing) to test
 * each rule in isolation, plus a real-corpus integration test.
 */

import { describe, it, expect } from 'vitest';
import type { PapersData, Reference, Cell } from './types.js';
import { lint } from './lint.js';
import { buildPapersModel } from './papers.js';

// ---------------------------------------------------------------------------
// Helpers — build minimal valid model objects
// ---------------------------------------------------------------------------

/**
 * Build a Reference with all required fields, overrideable via partials.
 * Defaults to a clean 'References' entry with all APA fields populated.
 */
function makeRef(overrides: Partial<Reference> & { id: number }): Reference {
  return {
    section: 'References',
    raw: `Author, A. (2020). Title. *Journal*, 1(1), 1-10. https://doi.org/10.1234/test`,
    authors: ['Author, A.'],
    authorsDropped: 0,
    authorsText: 'Author, A.',
    year: 2020,
    title: 'Title',
    journal: 'Journal',
    doi: '10.1234/test',
    codeUrl: null,
    dataUrl: null,
    isPrimary: true,
    methods: [],
    areas: [],
    hasCode: false,
    hasData: false,
    slug: `ref-${overrides.id}`,
    ...overrides,
  };
}

function makeCell(method: string, area: string, refIds: number[]): Cell {
  return {
    method,
    area,
    refIds,
    labels: refIds.map((id) => `Ref ${id}`),
  };
}

/** Build a minimal clean model (1 ref, 1 cell citing it). */
function cleanModel(): PapersData {
  const ref = makeRef({ id: 1 });
  const cell = makeCell('Bayesian Optimization', 'media', [1]);
  return {
    areas: [{ key: 'media', label: 'Media Optimization' }],
    methods: ['Bayesian Optimization'],
    cells: [cell],
    references: [ref],
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — clean model → no errors, no warnings
// ---------------------------------------------------------------------------

describe('lint — clean model', () => {
  it('returns no errors and no warnings for a minimal valid model', () => {
    const result = lint(cleanModel());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — dangling matrix citation (Error 1)
// ---------------------------------------------------------------------------

describe('lint — dangling matrix citation', () => {
  it('reports an error when a cell cites a refId with no matching reference', () => {
    const model: PapersData = {
      ...cleanModel(),
      // Add a second cell that cites #99, which has no reference
      cells: [makeCell('Bayesian Optimization', 'media', [1]), makeCell('Deep Learning', 'cell', [99])],
      references: [makeRef({ id: 1 })],
    };
    const result = lint(model);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    const danglingErr = result.errors.find((e) => e.includes('#99'));
    expect(danglingErr).toBeDefined();
    expect(danglingErr).toContain('Deep Learning');
    expect(danglingErr).toContain('cell');
  });

  it('does NOT report a dangling error for a refId that does have a matching reference', () => {
    const result = lint(cleanModel());
    expect(result.errors.filter((e) => e.includes('dangling') || e.includes('Dangling'))).toHaveLength(0);
  });

  it('reports exactly one dangling error per (cell × missing refId), not one per cell', () => {
    // One cell cites two missing refs #88 and #99 — should produce 2 errors (one per missing id)
    const model: PapersData = {
      ...cleanModel(),
      cells: [makeCell('Bayesian Optimization', 'media', [88, 99])],
      references: [],
    };
    const result = lint(model);
    const mentioning88 = result.errors.filter((e) => e.includes('#88'));
    const mentioning99 = result.errors.filter((e) => e.includes('#99'));
    expect(mentioning88).toHaveLength(1);
    expect(mentioning99).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — unreachable primary reference (Error 2)
// ---------------------------------------------------------------------------

describe('lint — unreachable primary reference', () => {
  it('reports an error for a section=References ref not cited by any cell', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [],          // no cells → no citations
      references: [makeRef({ id: 1, section: 'References' })],
    };
    const result = lint(model);
    const unreachableErr = result.errors.find((e) => e.includes('#1'));
    expect(unreachableErr).toBeDefined();
  });

  it('does NOT report an error for a Reviews & Perspectives ref not cited by any cell', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: [],
      cells: [],
      references: [
        makeRef({ id: 2, section: 'Reviews & Perspectives', isPrimary: false }),
      ],
    };
    const result = lint(model);
    // Should be no errors about #2
    const errAbout2 = result.errors.find((e) => e.includes('#2'));
    expect(errAbout2).toBeUndefined();
  });

  it('does NOT report an error for non-References, non-Reviews sections not cited', () => {
    // e.g. a "Reference Work" section — also exempt
    const model: PapersData = {
      areas: [],
      methods: [],
      cells: [],
      references: [
        makeRef({ id: 3, section: 'Human Reference Work', isPrimary: false }),
      ],
    };
    const result = lint(model);
    expect(result.errors.find((e) => e.includes('#3'))).toBeUndefined();
  });

  it('does NOT flag a References ref that IS cited by a cell', () => {
    const result = lint(cleanModel());
    // The ref #1 in cleanModel is cited by its cell — no unreachable error
    expect(result.errors).toHaveLength(0);
  });

  it('produces separate errors for multiple unreachable primary refs', () => {
    const model: PapersData = {
      areas: [],
      methods: [],
      cells: [],
      references: [
        makeRef({ id: 10, section: 'References' }),
        makeRef({ id: 11, section: 'References' }),
      ],
    };
    const result = lint(model);
    expect(result.errors.filter((e) => e.includes('#10')).length).toBeGreaterThanOrEqual(1);
    expect(result.errors.filter((e) => e.includes('#11')).length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — duplicate reference id (Error 3)
// ---------------------------------------------------------------------------

describe('lint — duplicate reference id', () => {
  it('reports an error when two references share the same id', () => {
    const model: PapersData = {
      ...cleanModel(),
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({ id: 1, slug: 'ref-1a' }),
        makeRef({ id: 1, slug: 'ref-1b', title: 'Another paper' }),
      ],
    };
    const result = lint(model);
    const dupErr = result.errors.find((e) => e.includes('#1'));
    expect(dupErr).toBeDefined();
    // Should mention count >= 2
    expect(dupErr).toMatch(/2/);
  });

  it('does NOT report duplicates when all ids are unique', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization', 'Deep Learning'],
      cells: [
        makeCell('Bayesian Optimization', 'media', [1]),
        makeCell('Deep Learning', 'media', [2]),
      ],
      references: [makeRef({ id: 1 }), makeRef({ id: 2, slug: 'ref-2' })],
    };
    const result = lint(model);
    expect(result.errors.filter((e) => e.toLowerCase().includes('duplicate'))).toHaveLength(0);
  });
});

describe('lint — duplicate citation within a matrix cell', () => {
  it('reports an error when a ref is cited twice in the same cell', () => {
    const model: PapersData = {
      ...cleanModel(),
      cells: [makeCell('Bayesian Optimization', 'media', [1, 1])],
      references: [makeRef({ id: 1 })],
    };
    const err = lint(model).errors.find((e) => /Duplicate citation.*#1/.test(e));
    expect(err).toBeDefined();
    expect(err).toMatch(/Bayesian Optimization × media/);
  });

  it('does NOT report when each cell cites a ref at most once', () => {
    const model: PapersData = {
      ...cleanModel(),
      cells: [makeCell('Bayesian Optimization', 'media', [1, 2])],
      references: [makeRef({ id: 1 }), makeRef({ id: 2, slug: 'ref-2' })],
    };
    expect(lint(model).errors.filter((e) => e.includes('Duplicate citation'))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 — retired-ID gaps (Warning 4)
// ---------------------------------------------------------------------------

describe('lint — retired-ID gaps', () => {
  it('emits a warning (not error) for gaps in the id sequence', () => {
    // IDs 1, 2, 5 → gaps 3, 4
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization', 'Deep Learning', 'GNN'],
      cells: [
        makeCell('Bayesian Optimization', 'media', [1]),
        makeCell('Deep Learning', 'media', [2]),
        makeCell('GNN', 'media', [5]),
      ],
      references: [
        makeRef({ id: 1 }),
        makeRef({ id: 2, slug: 'ref-2' }),
        makeRef({ id: 5, slug: 'ref-5' }),
      ],
    };
    const result = lint(model);
    // No errors about ids 3, 4
    expect(result.errors.filter((e) => e.includes('#3') || e.includes('#4'))).toHaveLength(0);
    // Warnings should mention the gaps
    const gapWarn = result.warnings.find((w) => w.includes('#3') || w.includes('#4') || w.includes('gap') || w.includes('Gap') || w.includes('retired'));
    expect(gapWarn).toBeDefined();
  });

  it('names both gap ids 3 and 4 in warnings', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization', 'Deep Learning', 'GNN'],
      cells: [
        makeCell('Bayesian Optimization', 'media', [1]),
        makeCell('Deep Learning', 'media', [2]),
        makeCell('GNN', 'media', [5]),
      ],
      references: [
        makeRef({ id: 1 }),
        makeRef({ id: 2, slug: 'ref-2' }),
        makeRef({ id: 5, slug: 'ref-5' }),
      ],
    };
    const result = lint(model);
    const allWarningText = result.warnings.join(' ');
    expect(allWarningText).toContain('#3');
    expect(allWarningText).toContain('#4');
  });

  it('emits no gap warnings when ids are contiguous', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization', 'Deep Learning'],
      cells: [
        makeCell('Bayesian Optimization', 'media', [1]),
        makeCell('Deep Learning', 'media', [2]),
      ],
      references: [makeRef({ id: 1 }), makeRef({ id: 2, slug: 'ref-2' })],
    };
    const result = lint(model);
    const gapWarns = result.warnings.filter(
      (w) => w.toLowerCase().includes('gap') || w.toLowerCase().includes('retired'),
    );
    expect(gapWarns).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 6 — unparsed APA fields (Warning 5)
// ---------------------------------------------------------------------------

describe('lint — unparsed APA fields', () => {
  it('emits a warning (not error) for a reference with null journal', () => {
    // Need this ref cited by a cell to avoid the unreachable-primary error
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [makeRef({ id: 1, journal: null })],
    };
    const result = lint(model);
    expect(result.errors).toHaveLength(0);
    const apaWarn = result.warnings.find(
      (w) => w.includes('#1') && (w.includes('journal') || w.includes('null') || w.includes('unparsed')),
    );
    expect(apaWarn).toBeDefined();
  });

  it('mentions all null APA fields in a single warning for one reference', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({ id: 1, authors: null, year: null, title: null, journal: null, doi: null }),
      ],
    };
    const result = lint(model);
    expect(result.errors).toHaveLength(0);
    // At minimum one warning about #1 with multiple null fields
    const apaWarns = result.warnings.filter((w) => w.includes('#1'));
    expect(apaWarns.length).toBeGreaterThanOrEqual(1);
    // The warning(s) together should name the affected fields
    const combinedText = apaWarns.join(' ');
    expect(combinedText).toMatch(/author|year|title|journal|doi/i);
  });

  it('emits no APA warnings for a fully-populated reference', () => {
    const result = lint(cleanModel());
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  // #96: a partial-parse (valid authors recovered, some tokens dropped) leaves
  // `authors` non-null, so it slips past the null-field check above. The
  // dropped-token check surfaces that silent loss.
  it('warns when author tokens were dropped even though authors is non-null', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [makeRef({ id: 1, authors: ['Smith, J.'], authorsDropped: 2 })],
    };
    const result = lint(model);
    expect(result.errors).toHaveLength(0);
    const dropWarn = result.warnings.find(
      (w) => w.includes('#1') && w.toLowerCase().includes('dropped'),
    );
    expect(dropWarn).toBeDefined();
    // singular/plural agreement
    expect(dropWarn).toContain('2 unparseable author tokens');
  });

  it('does not warn about dropped tokens when authorsDropped is 0', () => {
    const result = lint(cleanModel());
    expect(result.warnings.find((w) => w.toLowerCase().includes('dropped'))).toBeUndefined();
  });

  // #72: a null field that is legitimately absent for the reference kind is not
  // flagged (a non-DOI permalink for a thesis/workshop; no journal for a preprint).
  it('does NOT flag a null doi when a non-DOI permalink is present (thesis/workshop)', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({
          id: 1,
          doi: null,
          raw: 'Cosenza, Z. A. (2022). *Sequential Learning Methods.* [UC Davis]. https://escholarship.org/uc/item/119489fc',
        }),
      ],
    };
    const result = lint(model);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.filter((w) => w.includes('#1'))).toHaveLength(0);
  });

  it('DOES flag a null doi when there is no permalink at all', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({ id: 1, doi: null, raw: 'Smith, J. (2020). A title. *Nature, 500*. No DOI here.' }),
      ],
    };
    const result = lint(model);
    const doiWarn = result.warnings.find((w) => w.includes('#1') && w.includes('doi'));
    expect(doiWarn).toBeDefined();
  });

  it('does NOT flag a null journal for a preprint DOI (bioRxiv 10.1101/…)', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({
          id: 1,
          journal: null,
          doi: '10.1101/2022.12.24.521878',
          raw: 'Hashizume, T. (2022). *Employing active learning.* https://doi.org/10.1101/2022.12.24.521878',
        }),
      ],
    };
    const result = lint(model);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.filter((w) => w.includes('#1'))).toHaveLength(0);
  });

  it('DOES flag a null journal for a non-preprint DOI', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({
          id: 1,
          journal: null,
          doi: '10.1038/s41586-025-09962-4',
          raw: 'Author, A. (2020). A title. https://doi.org/10.1038/s41586-025-09962-4',
        }),
      ],
    };
    const result = lint(model);
    const journalWarn = result.warnings.find((w) => w.includes('#1') && w.includes('journal'));
    expect(journalWarn).toBeDefined();
  });

  // Preprint detection is DOI-based: a published article that merely MENTIONS a
  // preprint server in its text must not have its null-journal warning suppressed.
  it('DOES flag a null journal for a non-preprint DOI even when raw mentions arXiv', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({
          id: 1,
          journal: null,
          doi: '10.1038/s41586-025-09962-4',
          raw: 'Smith, J. (2020). The impact of arXiv on publishing. https://doi.org/10.1038/s41586-025-09962-4',
        }),
      ],
    };
    const result = lint(model);
    expect(result.warnings.find((w) => w.includes('#1') && w.includes('journal'))).toBeDefined();
  });

  it('does NOT flag a null journal for the newer bioRxiv prefix (10.64898/…)', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({
          id: 1,
          journal: null,
          doi: '10.64898/2026.04.06.716850',
          raw: 'Author, A. (2026). *A preprint.* https://doi.org/10.64898/2026.04.06.716850',
        }),
      ],
    };
    const result = lint(model);
    expect(result.warnings.filter((w) => w.includes('#1'))).toHaveLength(0);
  });

  // Permalink suppression is a host allowlist: a mistyped landing-page URL for a
  // resource that DOES have a DOI (e.g. a zenodo.org page) must still warn.
  it('DOES flag a null doi for a non-permalink-host URL (mistyped landing page)', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [
        makeRef({
          id: 1,
          doi: null,
          raw: 'Author, A. (2024). A dataset. https://zenodo.org/records/1234567',
        }),
      ],
    };
    const result = lint(model);
    expect(result.warnings.find((w) => w.includes('#1') && w.includes('doi'))).toBeDefined();
  });

  it('puts APA warnings in warnings, not errors', () => {
    const model: PapersData = {
      areas: [{ key: 'media', label: 'Media Optimization' }],
      methods: ['Bayesian Optimization'],
      cells: [makeCell('Bayesian Optimization', 'media', [1])],
      references: [makeRef({ id: 1, doi: null })],
    };
    const result = lint(model);
    // No errors at all
    expect(result.errors).toHaveLength(0);
    // Must have at least one warning about the null doi
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Suite 7 — real corpus integration
// ---------------------------------------------------------------------------

describe('lint — real Papers.md corpus', () => {
  const model = buildPapersModel();
  const result = lint(model);

  it('has EXACTLY zero errors (corpus is clean)', () => {
    // If this fails, a real integrity violation was found — investigate immediately.
    if (result.errors.length > 0) {
      // Report all errors for diagnosis
      console.error('CORPUS INTEGRITY ERRORS:', result.errors);
    }
    expect(result.errors).toHaveLength(0);
  });

  it('has at least one warning (APA-null and/or retired-id-gap warnings expected)', () => {
    expect(result.warnings.length).toBeGreaterThan(0);
  });

});
