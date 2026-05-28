/**
 * lint-papers.test.ts — tests for the runLint() core function.
 *
 * Imports only the pure core export; never triggers CLI side effects.
 */

import { describe, it, expect } from 'vitest';

import { runLint } from './lint-papers.js';
import { buildPapersModel } from './papers.js';
import type { PapersData } from './types.js';

// ---------------------------------------------------------------------------
// Real corpus tests
// ---------------------------------------------------------------------------

describe('runLint() on the real corpus', () => {
  const model = buildPapersModel();
  const result = runLint(model);

  it('returns exitCode === 0 (no hard errors)', () => {
    expect(result.exitCode).toBe(0);
  });

  it('errors array is empty', () => {
    expect(result.errors).toHaveLength(0);
  });

  it('report contains a clean-state indicator', () => {
    expect(result.report).toMatch(/✓|OK|clean|no errors/i);
  });

  it('report contains the warning count when warnings > 0', () => {
    if (result.warnings.length > 0) {
      // The summary line must mention warnings
      expect(result.report).toMatch(/warning/i);
    }
  });

  it('report contains the error summary line', () => {
    // Summary line always appears regardless of counts
    expect(result.report).toMatch(/error/i);
  });
});

// ---------------------------------------------------------------------------
// Synthetic model — dangling citation → hard error
// ---------------------------------------------------------------------------

describe('runLint() on a model with a dangling citation', () => {
  // Build a minimal model where cell cites refId 9999, which has no reference.
  const syntheticModel: PapersData = {
    areas: [{ key: 'media', label: 'Media Optimization' }],
    methods: ['Bayesian Optimization'],
    cells: [
      {
        method: 'Bayesian Optimization',
        area: 'media',
        refIds: [9999],
        labels: ['Fake et al. 2099'],
      },
    ],
    references: [
      {
        id: 1,
        section: 'References',
        raw: 'Real, A. (2024). A real paper. *Journal*, 1(1), 1. https://doi.org/10.1/real',
        authors: ['Real, A.'],
        authorsText: 'Real, A.',
        year: 2024,
        title: 'A real paper',
        journal: 'Journal',
        doi: '10.1/real',
        codeUrl: null,
        dataUrl: null,
        isPrimary: false, // not cited by any cell
        methods: [],
        areas: [],
        hasCode: false,
        hasData: false,
        slug: 'real-2024',
      },
    ],
  };

  const result = runLint(syntheticModel);

  it('exitCode === 1', () => {
    expect(result.exitCode).toBe(1);
  });

  it('errors array has at least one entry', () => {
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('report contains "ERROR"', () => {
    expect(result.report).toContain('ERROR');
  });

  it('error message mentions the dangling refId', () => {
    const hasRefId = result.errors.some((e) => e.includes('9999'));
    expect(hasRefId).toBe(true);
  });
});
