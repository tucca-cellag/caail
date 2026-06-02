/**
 * graph.ts — builds graph.json, the paper network rendered by /papers/network/.
 *
 * Nodes are references. The graph carries two edge sets the page toggles between:
 *   - shared-author (undirected): joins two references that share ≥1 author.
 *     Authors are normalized to `surname|first-initial` (lowercased) so
 *     initial-only variants ("Li, X." vs "Li, X. M.") still match without merging
 *     distinct people by surname alone. References with `authors === null` form
 *     no edges (isolated).
 *   - citation (directed): N→M when N cites M, derived from the OpenAlex cache by
 *     citations.ts. Empty when no cache is present.
 *
 * Pure transform over an already-built PapersData model (+ optional cache) — no I/O.
 */

import { buildCitationData, type CitationCache } from './citations.js';
import { largestComponentSize } from './connectivity.js';
import {
  GraphSchema,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type PapersData,
  type Reference,
} from './types.js';

/**
 * Normalize an APA author string ("Surname, F. M.") to a match key
 * `surname|f` (lowercased). Falls back to the whole token when there is no
 * comma. Returns null for empty input.
 */
export function authorKey(author: string): string | null {
  const trimmed = author.trim();
  if (!trimmed) return null;
  const [surnameRaw, initialsRaw = ''] = trimmed.split(',');
  const surname = surnameRaw.trim().toLowerCase();
  if (!surname) return null;
  const firstInitial = initialsRaw.trim().replace(/[^A-Za-z]/g, '').charAt(0).toLowerCase();
  return firstInitial ? `${surname}|${firstInitial}` : surname;
}

/** Ordered pair key so (a,b) and (b,a) collapse to one edge. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Build the paper-network graph model from a PapersData model, plus an optional
 * OpenAlex citation cache. Shared-author edges come from the in-repo author
 * strings; directed citation edges come from the cache (empty without one).
 */
export function buildGraphModel(model: PapersData, cache?: CitationCache | null): Graph {
  const refs = model.references;

  // author key → set of ref ids, and a display name per key (first seen).
  const keyToRefs = new Map<string, Set<number>>();
  const keyToDisplay = new Map<string, string>();
  for (const ref of refs) {
    if (!ref.authors) continue;
    for (const a of ref.authors) {
      const key = authorKey(a);
      if (!key) continue;
      if (!keyToRefs.has(key)) {
        keyToRefs.set(key, new Set());
        keyToDisplay.set(key, a.trim());
      }
      keyToRefs.get(key)!.add(ref.id);
    }
  }

  // Accumulate edges: every pair of refs sharing an author key.
  const edgeShared = new Map<string, { source: number; target: number; authors: Set<string> }>();
  for (const [key, refSet] of keyToRefs) {
    if (refSet.size < 2) continue;
    const ids = [...refSet].sort((x, y) => x - y);
    const display = keyToDisplay.get(key)!;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pk = pairKey(ids[i], ids[j]);
        const existing = edgeShared.get(pk);
        if (existing) {
          existing.authors.add(display);
        } else {
          edgeShared.set(pk, {
            source: Math.min(ids[i], ids[j]),
            target: Math.max(ids[i], ids[j]),
            authors: new Set([display]),
          });
        }
      }
    }
  }

  const edges: GraphEdge[] = [...edgeShared.values()].map((e) => ({
    source: e.source,
    target: e.target,
    sharedAuthors: [...e.authors].sort(),
  }));

  // Shared-author degree per node.
  const degree = new Map<number, number>(refs.map((r) => [r.id, 0]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

  // Directed citation edges + per-node cites/cited-by counts (empty w/o cache).
  const citation = buildCitationData(model, cache);

  const nodes: GraphNode[] = refs.map((ref: Reference) => ({
    id: ref.id,
    label: ref.slug,
    title: ref.title,
    authorsText: ref.authorsText,
    year: ref.year,
    isPrimary: ref.isPrimary,
    methods: ref.methods,
    areas: ref.areas,
    doi: ref.doi,
    journal: ref.journal,
    hasCode: ref.hasCode,
    hasData: ref.hasData,
    degree: degree.get(ref.id) ?? 0,
    citesCount: citation.citesCount.get(ref.id) ?? 0,
    citedByCount: citation.citedByCount.get(ref.id) ?? 0,
  }));

  const nodeIds = nodes.map((n) => n.id);
  const sharedAuthorIsolated = nodes.filter((n) => n.degree === 0).length;
  const metadata = {
    nodes: nodes.length,
    sharedAuthor: {
      edges: edges.length,
      connectedNodes: nodes.length - sharedAuthorIsolated,
      isolatedNodes: sharedAuthorIsolated,
      largestComponent: largestComponentSize(nodeIds, edges),
    },
    citation: citation.stats,
  };

  return GraphSchema.parse({ metadata, nodes, edges, citationEdges: citation.edges });
}
