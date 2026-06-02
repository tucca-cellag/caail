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
