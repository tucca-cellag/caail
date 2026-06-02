/**
 * citations.test.ts — tests for the OpenAlex-derived citation graph builder.
 *
 * Suites:
 *   A. doiKey normalization.
 *   B. buildCitationData over a hand-built model + fake cache (direction, dedup,
 *      counts, out-of-corpus / self / missing-DOI handling, empty cache).
 *   C. Integration: the committed cache yields a consistent real-corpus graph.
 */

import { describe, it, expect } from 'vitest';

import { buildCitationData, doiKey, type CitationCache } from './citations.js';
import { buildPapersModel } from './papers.js';
import { loadCitationCache } from './generate-data.js';
import type { PapersData, Reference } from './types.js';

/** Reference with sensible defaults, overriding id + doi. */
function mkRef(id: number, doi: string | null): Reference {
  return {
    id,
    section: 'References',
    raw: `ref ${id}`,
    authors: [`Author ${id}`],
    authorsText: `Author ${id}`,
    year: 2020,
    title: `Title ${id}`,
    journal: 'Journal',
    doi,
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

function mkModel(refs: Reference[]): PapersData {
  return { areas: [], methods: [], cells: [], references: refs };
}

// ---------------------------------------------------------------------------
// A. doiKey
// ---------------------------------------------------------------------------

describe('doiKey', () => {
  it('strips the doi.org URL prefix and lowercases', () => {
    expect(doiKey('https://doi.org/10.1002/ELSC.123')).toBe('10.1002/elsc.123');
    expect(doiKey('https://dx.doi.org/10.1/AbC')).toBe('10.1/abc');
  });
  it('strips a bare doi: prefix', () => {
    expect(doiKey('doi:10.5/xyz')).toBe('10.5/xyz');
  });
  it('passes through an already-bare DOI (lowercased)', () => {
    expect(doiKey('10.1/Foo')).toBe('10.1/foo');
  });
  it('returns null for empty / absent input', () => {
    expect(doiKey(null)).toBeNull();
    expect(doiKey(undefined)).toBeNull();
    expect(doiKey('   ')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. buildCitationData — controlled model + fake cache
// ---------------------------------------------------------------------------

describe('buildCitationData — controlled', () => {
  // ref5 has no DOI → never in the cache → forms no edges.
  const model = mkModel([
    mkRef(1, '10.1/1'),
    mkRef(2, '10.1/2'),
    mkRef(3, '10.1/3'),
    mkRef(4, '10.1/4'),
    mkRef(5, null),
  ]);

  const cache: CitationCache = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    works: {
      // ref1 cites 2 & 3; W9 is out-of-corpus; W1 is a self-reference (ignored)
      '10.1/1': {
        openalexId: 'W1',
        referencedWorks: ['https://openalex.org/W2', 'W3', 'https://openalex.org/W9', 'W1'],
      },
      // openalexId given in URL form to exercise normalization
      '10.1/2': { openalexId: 'https://openalex.org/W2', referencedWorks: ['W3'] },
      '10.1/3': { openalexId: 'W3', referencedWorks: [] },
      // lowercase + duplicate reference → a single deduped edge 4→2
      '10.1/4': { openalexId: 'W4', referencedWorks: ['w2', 'W2'] },
    },
  };

  const data = buildCitationData(model, cache);

  it('derives directed edges N→M (source cites target), skipping self & out-of-corpus', () => {
    const pairs = data.edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(pairs).toEqual(['1->2', '1->3', '2->3', '4->2']);
  });

  it('deduplicates repeated references to the same target', () => {
    expect(data.edges.filter((e) => e.source === 4 && e.target === 2)).toHaveLength(1);
  });

  it('counts out-degree (cites) and in-degree (cited-by) per node', () => {
    expect(data.citesCount.get(1)).toBe(2); // cites 2, 3
    expect(data.citesCount.get(2)).toBe(1); // cites 3
    expect(data.citesCount.get(4)).toBe(1); // cites 2
    expect(data.citesCount.get(5)).toBe(0);
    expect(data.citedByCount.get(2)).toBe(2); // cited by 1, 4
    expect(data.citedByCount.get(3)).toBe(2); // cited by 1, 2
    expect(data.citedByCount.get(1)).toBe(0);
  });

  it('computes connectivity stats over the undirected projection', () => {
    expect(data.stats.edges).toBe(4);
    expect(data.stats.connectedNodes).toBe(4); // 1,2,3,4
    expect(data.stats.isolatedNodes).toBe(1); // ref5
    expect(data.stats.largestComponent).toBe(4); // {1,2,3,4}
  });

  it('matches DOI key forms between the model and the cache', () => {
    // Model DOI in URL form still keys to the bare cache entry.
    const urlModel = mkModel([mkRef(1, 'https://doi.org/10.1/1'), mkRef(2, '10.1/2')]);
    const d = buildCitationData(urlModel, cache);
    expect(d.edges).toEqual([{ source: 1, target: 2 }]);
  });
});

describe('buildCitationData — empty / missing cache', () => {
  const model = mkModel([mkRef(1, '10.1/1'), mkRef(2, '10.1/2')]);

  it('returns no edges and zeroed counts when no cache is supplied', () => {
    const d = buildCitationData(model);
    expect(d.edges).toEqual([]);
    expect(d.stats.edges).toBe(0);
    expect(d.stats.isolatedNodes).toBe(2);
    expect(d.stats.largestComponent).toBe(0);
    expect(d.citesCount.get(1)).toBe(0);
    expect(d.citedByCount.get(2)).toBe(0);
  });

  it('treats an empty works map like no cache', () => {
    const d = buildCitationData(model, { generatedAt: 'x', works: {} });
    expect(d.edges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// C. Integration — committed cache + real corpus
// ---------------------------------------------------------------------------

describe('buildCitationData — committed cache', () => {
  it('yields a non-trivial, internally consistent citation graph', () => {
    const model = buildPapersModel();
    const data = buildCitationData(model, loadCitationCache());
    expect(data.edges.length).toBeGreaterThan(0);
    const sumCites = [...data.citesCount.values()].reduce((s, n) => s + n, 0);
    const sumCitedBy = [...data.citedByCount.values()].reduce((s, n) => s + n, 0);
    expect(sumCites).toBe(data.edges.length);
    expect(sumCitedBy).toBe(data.edges.length);
    expect(data.stats.connectedNodes + data.stats.isolatedNodes).toBe(model.references.length);
  });
});
