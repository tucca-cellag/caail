/**
 * taxonomy.test.ts — tests for the Taxonomy.md definition extractor.
 *
 * Two suites:
 *   (A) a synthetic fixture exercising the H3-splitting / paragraph-flattening
 *       / whitespace-collapse behavior in isolation, and
 *   (B) the real repo-root Taxonomy.md ⨯ Papers.md invariant that every matrix
 *       row and column label has a non-empty definition (the same guard the
 *       build enforces, pinned here so a drift is caught by `pnpm test` too).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';

import { buildTaxonomyModel } from './taxonomy';
import { buildPapersModel } from './papers';

const FIXTURE = fileURLToPath(new URL('./taxonomy.fixture.md', import.meta.url));

describe('buildTaxonomyModel (fixture)', () => {
  const { definitions } = buildTaxonomyModel(FIXTURE);

  it('keys on the H3 headings only — not the H1 title or H2 group headers', () => {
    expect(Object.keys(definitions).sort()).toEqual(['Alpha', 'Beta', 'Gamma / Delta']);
  });

  it('collapses source line-wrapping to single spaces', () => {
    expect(definitions['Alpha']).toBe('First paragraph of Alpha wrapped across two source lines.');
  });

  it('joins multiple paragraphs under one heading with a space', () => {
    expect(definitions['Beta']).toBe('Beta paragraph one. Beta paragraph two.');
  });

  it('flattens markdown emphasis to plain text', () => {
    expect(definitions['Gamma / Delta']).toBe(
      'Gamma definition with emphasis dropped and a cross-ref (→ Alpha).',
    );
  });

  it('every value is non-empty', () => {
    for (const [label, text] of Object.entries(definitions)) {
      expect(text.trim().length, `definition for ${label}`).toBeGreaterThan(0);
    }
  });
});

describe('Taxonomy.md ⨯ Papers.md (real files)', () => {
  const { definitions } = buildTaxonomyModel();
  const papers = buildPapersModel();

  it('defines every matrix method row', () => {
    for (const method of papers.methods) {
      expect(definitions[method]?.trim(), `definition for method "${method}"`).toBeTruthy();
    }
  });

  it('defines every matrix area column', () => {
    for (const area of papers.areas) {
      expect(definitions[area.label]?.trim(), `definition for area "${area.label}"`).toBeTruthy();
    }
  });
});
