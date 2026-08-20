/**
 * taxonomy.test.ts — tests for the Taxonomy.md definition extractor.
 *
 * Three suites:
 *   (A) a synthetic fixture exercising the H3-splitting / paragraph-flattening
 *       / whitespace-collapse behavior, and the axis separation that keeps a
 *       subject theme from answering for a matrix column;
 *   (B) the failure modes — a label defined twice within one axis, and
 *       definitions under an H2 nobody has assigned an axis to;
 *   (C) the real repo-root Taxonomy.md ⨯ Papers.md invariant that every matrix
 *       row and column label has a non-empty definition *under its own axis*
 *       (the same guard the build enforces, pinned here so a drift is caught by
 *       `pnpm test` too).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';

import { buildTaxonomyModel } from './taxonomy';
import { buildPapersModel } from './papers';

const FIXTURE = fileURLToPath(new URL('./taxonomy.fixture.md', import.meta.url));
const COLLISION_FIXTURE = fileURLToPath(
  new URL('./taxonomy.collision.fixture.md', import.meta.url),
);
const UNKNOWN_AXIS_FIXTURE = fileURLToPath(
  new URL('./taxonomy.unknown-axis.fixture.md', import.meta.url),
);

describe('buildTaxonomyModel (fixture)', () => {
  const { definitions, axes } = buildTaxonomyModel(FIXTURE);

  it('files each H3 under the axis of its enclosing H2', () => {
    expect(Object.keys(axes.area).sort()).toEqual(['Alpha', 'Beta']);
    expect(Object.keys(axes.method).sort()).toEqual(['Gamma / Delta']);
    expect(Object.keys(axes.theme).sort()).toEqual(['Alpha', 'Epsilon']);
  });

  it('collapses source line-wrapping to single spaces', () => {
    expect(axes.area['Alpha']).toBe('First paragraph of Alpha wrapped across two source lines.');
  });

  it('joins multiple paragraphs under one heading with a space', () => {
    expect(axes.area['Beta']).toBe('Beta paragraph one. Beta paragraph two.');
  });

  it('flattens markdown emphasis to plain text', () => {
    expect(axes.method['Gamma / Delta']).toBe(
      'Gamma definition with emphasis dropped and a cross-ref (→ Alpha).',
    );
  });

  it('ignores an unmapped H2 that carries no definitions', () => {
    expect(Object.keys(axes.area)).not.toContain('Notes (an H2 carrying no definitions)');
  });

  // The regression guard for GH #133 / CAAIL-240. `Alpha` is both a research
  // area and a subject theme in the fixture, mirroring `Bioprocess & Scale-Up`
  // in the real file. Under the previous whole-file flatten the theme (parsed
  // later) overwrote the column, and the only surviving check — "the label has
  // a non-empty definition" — still passed.
  describe('a label shared across axes (GH #133)', () => {
    it('keeps both definitions rather than letting the later one win', () => {
      expect(axes.area['Alpha']).not.toBe(axes.theme['Alpha']);
      expect(axes.theme['Alpha']).toContain('deliberately shares its label');
    });

    it('resolves the flat matrix lookup to the column, never the theme', () => {
      expect(definitions['Alpha']).toBe(axes.area['Alpha']);
    });

    it('keeps themes out of the flat matrix lookup entirely', () => {
      expect(definitions['Epsilon']).toBeUndefined();
      expect(Object.keys(definitions).sort()).toEqual(['Alpha', 'Beta', 'Gamma / Delta']);
    });
  });

  it('every value is non-empty', () => {
    for (const [axis, map] of Object.entries(axes)) {
      for (const [label, text] of Object.entries(map)) {
        expect(text.trim().length, `definition for ${axis}/${label}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildTaxonomyModel (failure modes)', () => {
  it('throws when one label is defined twice within a single axis', () => {
    expect(() => buildTaxonomyModel(COLLISION_FIXTURE)).toThrow(
      /"### Alpha" is defined twice under "## Research areas \(columns\)"/,
    );
  });

  it('throws when definitions sit under an H2 that maps to no axis', () => {
    expect(() => buildTaxonomyModel(UNKNOWN_AXIS_FIXTURE)).toThrow(
      /"## Organism axis \(rows\)" carries 1 "###" definition\(s\) but is not a known axis/,
    );
  });
});

describe('Taxonomy.md ⨯ Papers.md (real files)', () => {
  const { definitions, axes } = buildTaxonomyModel();
  const papers = buildPapersModel();

  it('defines every matrix method row under the methods axis', () => {
    for (const method of papers.methods) {
      expect(axes.method[method]?.trim(), `definition for method "${method}"`).toBeTruthy();
    }
  });

  it('defines every matrix area column under the areas axis', () => {
    for (const area of papers.areas) {
      expect(axes.area[area.label]?.trim(), `definition for area "${area.label}"`).toBeTruthy();
    }
  });

  it('exposes every matrix label through the flat lookup too', () => {
    for (const label of [...papers.methods, ...papers.areas.map((a) => a.label)]) {
      expect(definitions[label]?.trim(), `flat definition for "${label}"`).toBeTruthy();
    }
  });

  // `Bioprocess & Scale-Up` was once BOTH a column and a theme, and the flatten bug
  // let the theme's blurb overwrite the column's scope. ADR-0001 removed the clash at
  // the source by renaming the theme to `Bioprocess & Manufacturing`, so this now
  // asserts the convention rather than the collision: the column resolves to a real
  // scope definition, and the theme axis no longer claims that label.
  //
  // The axis-keying that fixed the original bug is still exercised — by the fixture
  // test above ("keeps both definitions rather than letting the later one win"), which
  // constructs a shared label deliberately. That is where it belongs: this file should
  // not depend on the real corpus continuing to contain a collision it just removed.
  it('resolves Bioprocess & Scale-Up to the column scope, and no theme claims that label', () => {
    const label = 'Bioprocess & Scale-Up';
    expect(axes.area[label]).toBeTruthy();
    expect(axes.theme[label]).toBeUndefined();
    expect(definitions[label]).toBe(axes.area[label]);
    // The column definition is the one that states what is out of scope.
    expect(definitions[label]).toMatch(/out of scope/i);
  });

  // The naming convention Taxonomy.md now states, made checkable: a column reads as a
  // problem, a theme as an &-joined subject, and no label appears on both axes. This is
  // what lets `db:check`'s bijection guard join on `area_key` and forbid label equality
  // — a label comparison would fail on every correct repo once this holds.
  it('shares no label between the research-area and subject-theme axes', () => {
    const shared = Object.keys(axes.area).filter((l) => axes.theme[l] !== undefined);
    expect(shared, `labels on both axes: ${shared.join(', ')}`).toEqual([]);
  });
});
