/**
 * graph.test.ts — tests for the shared-author co-authorship graph builder.
 *
 * Suites:
 *   A. authorKey normalization.
 *   B. Unit: buildGraphModel over a hand-built PapersData model (fully
 *      controlled edges, degrees, isolation, components).
 *   B2. Unit: the author cache splitting one key between different people.
 *   C. Integration: real corpus invariants (node count, resolvable edges), and the
 *      people the author cache tells apart.
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { authorKey, buildGraphModel } from './graph.js';
import { corpusPapers } from './corpus-fixture.js';
import { loadAuthorCache, loadCitationCache } from './generate-data.js';
import type { AuthorCache } from './authors.js';
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
    expect(graph.metadata.sharedAuthor.isolatedNodes).toBe(2); // #4, #5
    expect(graph.metadata.sharedAuthor.connectedNodes).toBe(3);
    expect(graph.metadata.sharedAuthor.largestComponent).toBe(3); // {1,2,3}
    expect(graph.metadata.sharedAuthor.edges).toBe(2);
  });

  it('has an empty citation graph when no cache is supplied', () => {
    expect(graph.citationEdges).toEqual([]);
    expect(graph.metadata.citation.edges).toBe(0);
    expect(graph.metadata.citation.isolatedNodes).toBe(graph.nodes.length);
    expect(graph.nodes.every((n) => n.citesCount === 0 && n.citedByCount === 0)).toBe(true);
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
// B2. Unit: the author cache tells same-key people apart
// ---------------------------------------------------------------------------

describe('buildGraphModel: different people under one key', () => {
  const p = (given: string, family: string, orcid: string | null = null) => ({ given, family, orcid });
  // mkRef gives ref N the DOI 10.1/N, so the cache is keyed by those.
  const authors: AuthorCache = {
    generatedAt: '2026-10-20T00:00:00.000Z',
    works: {
      '10.1/1': { source: 'crossref', authors: [p('Sherry', 'Liu')] },
      '10.1/2': { source: 'crossref', authors: [p('Shuli', 'Liu')] },
      '10.1/3': { source: 'crossref', authors: [p('Shuli', 'Liu')] },
      '10.1/4': { source: 'crossref', authors: [p('Xiaoming', 'Li')] },
      '10.1/5': { source: 'crossref', authors: [p('Xiao Ming', 'Li')] },
      '10.1/6': { source: 'crossref', authors: [p('Sherry', 'Liu'), p('David E.', 'Block')] },
      '10.1/7': { source: 'crossref', authors: [p('Shuli', 'Liu'), p('David', 'Block')] },
    },
  };
  const model: PapersData = {
    areas: [],
    methods: [],
    cells: [],
    references: [
      mkRef(1, ['Liu, S.']),
      mkRef(2, ['Liu, S.']),
      mkRef(3, ['Liu, S.']),
      mkRef(4, ['Li, X.']),
      mkRef(5, ['Li, X. M.']),
      mkRef(6, ['Liu, S.', 'Block, D. E.']),
      mkRef(7, ['Liu, S.', 'Block, D.']),
      mkRef(8, ['Liu, S.']), // no record in the cache
    ],
  };
  const edgesOf = (g: ReturnType<typeof buildGraphModel>) =>
    new Map(g.edges.map((e) => [`${e.source}-${e.target}`, e.sharedAuthors]));
  const withNames = edgesOf(buildGraphModel(model, null, authors));

  it('does not join two papers whose "Liu, S." are different people (Sherry and Shuli)', () => {
    expect(withNames.has('1-2')).toBe(false);
    expect(withNames.has('1-3')).toBe(false);
  });

  it('still joins the same person, including across initial-only variants', () => {
    expect(withNames.get('2-3')).toEqual(['Liu, S.']);
    expect(withNames.has('4-5')).toBe(true); // "Li, X." and "Li, X. M." are both Xiaoming Li
  });

  it('keeps an edge on its other shared author and drops only the split name from it', () => {
    expect(withNames.get('6-7')).toEqual(['Block, D. E.']);
  });

  it('joins a paper with no record by name, as before', () => {
    expect(withNames.has('1-8')).toBe(true);
    expect(withNames.has('2-8')).toBe(true);
  });

  it('joins by name alone when there is no author cache', () => {
    const nameOnly = edgesOf(buildGraphModel(model));
    expect(nameOnly.has('1-2')).toBe(true);
    expect(nameOnly.get('6-7')).toEqual(['Block, D. E.', 'Liu, S.']);
  });
});

// ---------------------------------------------------------------------------
// C. Integration — real corpus
// ---------------------------------------------------------------------------

describe('buildGraphModel — real corpus', () => {
  let graph: ReturnType<typeof buildGraphModel>;
  beforeAll(() => {
    // Build WITH both committed caches, as the parse does, so both edge modes and the
    // author split are exercised.
    graph = buildGraphModel(corpusPapers(), loadCitationCache(), loadAuthorCache());
  });

  const joined = (a: number, b: number) =>
    graph.edges.some((e) => e.source === Math.min(a, b) && e.target === Math.max(a, b));

  it.each([134, 135, 140, 192])(
    'does not join ref 49 (Sherry Liu) to FarmGTEx ref %i (Shuli Liu) on "Liu, S."',
    (farmGtex) => {
      expect(joined(49, farmGtex)).toBe(false);
    },
  );

  it.each([
    [134, 135, 'Shuli Liu and others on two FarmGTEx papers'],
    [71, 154, 'Andrew D. White on both'],
    [49, 121, 'Jure Leskovec and Yusuf Roohani, matched by ORCID'],
  ])('still joins %i and %i (%s)', (a, b) => {
    expect(joined(a, b)).toBe(true);
  });

  it('emits one node per reference (matches the model)', () => {
    const model = corpusPapers();
    expect(graph.nodes).toHaveLength(model.references.length);
    expect(graph.metadata.nodes).toBe(model.references.length);
  });

  it('has a non-trivial number of shared-author edges', () => {
    expect(graph.edges.length).toBeGreaterThan(100);
  });

  it('every shared-author edge resolves to existing nodes and is ordered source<target', () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const e of graph.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      expect(e.source).toBeLessThan(e.target);
      expect(e.sharedAuthors.length).toBeGreaterThan(0);
    }
  });

  it('derives citation edges from the committed cache', () => {
    // The cache is committed, so the corpus has a non-trivial citation graph.
    expect(graph.citationEdges.length).toBeGreaterThan(0);
    expect(graph.metadata.citation.edges).toBe(graph.citationEdges.length);
  });

  it('every citation edge is directed between distinct existing nodes', () => {
    const ids = new Set(graph.nodes.map((n) => n.id));
    const seen = new Set<string>();
    for (const e of graph.citationEdges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
      expect(e.source).not.toBe(e.target); // no self-citations
      const key = `${e.source}->${e.target}`;
      expect(seen.has(key)).toBe(false); // deduped
      seen.add(key);
    }
  });

  it('citation in/out degrees are consistent with the edge list', () => {
    const sumCites = graph.nodes.reduce((s, n) => s + n.citesCount, 0);
    const sumCitedBy = graph.nodes.reduce((s, n) => s + n.citedByCount, 0);
    expect(sumCites).toBe(graph.citationEdges.length);
    expect(sumCitedBy).toBe(graph.citationEdges.length);
  });

  it('passes GraphSchema', () => {
    expect(GraphSchema.safeParse(graph).success).toBe(true);
  });
});
