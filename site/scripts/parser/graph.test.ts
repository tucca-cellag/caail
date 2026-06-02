/**
 * graph.test.ts — tests for the shared-author co-authorship graph builder.
 *
 * Suites:
 *   A. authorKey normalization.
 *   B. Unit: buildGraphModel over a hand-built PapersData model (fully
 *      controlled edges, degrees, isolation, components).
 *   C. Integration: real corpus invariants (node count, resolvable edges).
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { authorKey, buildGraphModel } from './graph.js';
import { buildPapersModel } from './papers.js';
import { GraphSchema, type PapersData, type Reference } from './types.js';

/** Build a full Reference with sensible defaults, overriding id + authors. */
function mkRef(id: number, authors: string[] | null): Reference {
  return {
    id,
    section: 'References',
    raw: `ref ${id}`,
    authors,
    authorsText: authors ? authors.join(', ') : `Author ${id}`,
    year: 2020 + id,
    title: `Title ${id}`,
    journal: 'Journal',
    doi: `10.1/${id}`,
    codeUrl: null,
    dataUrl: null,
    isPrimary: true,
    methods: [],
    areas: [],
    hasCode: false,
    hasData: false,
    slug: `ref-${id}`,
  };
}

// ---------------------------------------------------------------------------
// A. authorKey
// ---------------------------------------------------------------------------

describe('authorKey', () => {
  it('normalizes "Surname, F. M." to surname|first-initial', () => {
    expect(authorKey('Li, X. M.')).toBe('li|x');
    expect(authorKey('Cosenza, Z.')).toBe('cosenza|z');
  });
  it('matches initial-only variants of the same person', () => {
    expect(authorKey('Block, D. E.')).toBe(authorKey('Block, D.'));
  });
  it('distinguishes same surname / different first initial', () => {
    expect(authorKey('Block, D. E.')).not.toBe(authorKey('Block, B.'));
  });
  it('falls back to the surname when there is no initial', () => {
    expect(authorKey('Madonna')).toBe('madonna');
  });
});

// ---------------------------------------------------------------------------
// B. Unit — hand-built model
// ---------------------------------------------------------------------------

describe('buildGraphModel — controlled model', () => {
  const model: PapersData = {
    areas: [],
    methods: [],
    cells: [],
    references: [
      mkRef(1, ['Cosenza, Z.', 'Block, D. E.']),
      mkRef(2, ['Cosenza, Z.', 'Doe, C.']), // shares Cosenza, Z. with #1
      mkRef(3, ['Block, D. E.']), // shares Block, D. E. with #1
      mkRef(4, ['Solo, A.']), // isolated
      mkRef(5, null), // null authors → isolated
    ],
  };
  const graph = buildGraphModel(model);

  it('emits one node per reference and validates', () => {
    expect(graph.nodes).toHaveLength(5);
    expect(GraphSchema.safeParse(graph).success).toBe(true);
  });

  it('creates exactly the shared-author edges (1-2 via Cosenza, 1-3 via Block)', () => {
    const pairs = graph.edges.map((e) => `${e.source}-${e.target}`).sort();
    expect(pairs).toEqual(['1-2', '1-3']);
    const e12 = graph.edges.find((e) => e.source === 1 && e.target === 2)!;
    const e13 = graph.edges.find((e) => e.source === 1 && e.target === 3)!;
    expect(e12.sharedAuthors).toContain('Cosenza, Z.');
    expect(e13.sharedAuthors).toContain('Block, D. E.');
  });

  it('computes degree, isolation, and largest component', () => {
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    expect(byId.get(1)!.degree).toBe(2);
    expect(byId.get(2)!.degree).toBe(1);
    expect(byId.get(4)!.degree).toBe(0);
    expect(byId.get(5)!.degree).toBe(0);
    expect(graph.metadata.isolatedNodes).toBe(2); // #4, #5
    expect(graph.metadata.connectedNodes).toBe(3);
    expect(graph.metadata.largestComponent).toBe(3); // {1,2,3}
    expect(graph.metadata.edges).toBe(2);
  });

  it('does not join same-surname different-initial authors (Block D vs Block B)', () => {
    const m2: PapersData = {
      areas: [],
      methods: [],
      cells: [],
      references: [mkRef(1, ['Block, D. E.']), mkRef(2, ['Block, B.'])],
    };
    expect(buildGraphModel(m2).edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// C. Integration — real corpus
// ---------------------------------------------------------------------------

describe('buildGraphModel — real corpus', () => {
  let graph: ReturnType<typeof buildGraphModel>;
  beforeAll(() => {
    graph = buildGraphModel(buildPapersModel());
  });

  it('emits one node per reference (matches the model)', () => {
    const model = buildPapersModel();
    expect(graph.nodes).toHaveLength(model.references.length);
    expect(graph.metadata.nodes).toBe(model.references.length);
  });

  it('has a non-trivial number of shared-author edges', () => {
    expect(graph.edges.length).toBeGreaterThan(100);
  });

  it('every edge resolves to existing nodes and is ordered source<target', () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      expect(e.source).toBeLessThan(e.target);
      expect(e.sharedAuthors.length).toBeGreaterThan(0);
    }
  });

  it('passes GraphSchema', () => {
    expect(GraphSchema.safeParse(graph).success).toBe(true);
  });
});
