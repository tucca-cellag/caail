/**
 * graph.ts — builds graph.json, the paper network rendered by /papers/network/.
 *
 * Nodes are references. The graph carries two edge sets the page toggles between:
 *   - shared-author (undirected): joins two references that share ≥1 author.
 *     Authors are normalized to `surname|first-initial` (lowercased) so
 *     initial-only variants ("Li, X." vs "Li, X. M.") still match without merging
 *     distinct people by surname alone. References with `authors === null` form
 *     no edges (isolated). The key still joins different people who share a
 *     surname and initial, so where the author cache (authors.ts) gives both
 *     papers' full given names under a key and they name different people, that
 *     key does not join that pair.
 *   - citation (directed): N→M when N cites M, derived from the OpenAlex cache by
 *     citations.ts. Empty when no cache is present.
 *
 * Pure transform over an already-built PapersData model (+ optional caches): no I/O.
 */

import { authorKeys, differentPeopleCheck, type AuthorCache } from './authors.js';
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

/** Ordered pair key so (a,b) and (b,a) collapse to one edge. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Build the paper-network graph model from a PapersData model, plus the optional
 * committed caches. Shared-author edges come from the in-repo author strings, less
 * any key the author cache shows naming different people on the two papers;
 * directed citation edges come from the citation cache (empty without one).
 */
export function buildGraphModel(
  model: PapersData,
  cache?: CitationCache | null,
  authors?: AuthorCache | null,
): Graph {
  const refs = model.references;
  const differentPeople = authors ? differentPeopleCheck(authors, refs) : null;

  // author key → ref id → how that ref cites the author (every citation under the key).
  const keyToRefs = new Map<string, Map<number, string[]>>();
  for (const ref of refs) {
    if (!ref.authors) continue;
    for (const a of ref.authors) {
      // Usually one key; a surname with a German umlaut also keys under its ASCII digraph.
      for (const key of authorKeys(a)) {
        if (!keyToRefs.has(key)) keyToRefs.set(key, new Map());
        const cited = keyToRefs.get(key)!;
        if (!cited.has(ref.id)) cited.set(ref.id, []);
        const names = cited.get(ref.id)!;
        if (!names.includes(a.trim())) names.push(a.trim());
      }
    }
  }
  // The name an edge shows for a key: as one of its own papers cites it, preferring a paper
  // that cites the key once, since a paper citing two people under it cannot say which one
  // the other paper shares.
  const label = (cited: Map<number, string[]>, a: number, b: number): string => {
    const [x, y] = [cited.get(a)!, cited.get(b)!];
    return x.length === 1 || y.length !== 1 ? x[0] : y[0];
  };

  // Accumulate edges: every pair of refs sharing an author key.
  const edgeShared = new Map<string, { source: number; target: number; authors: Set<string> }>();
  for (const [key, cited] of keyToRefs) {
    if (cited.size < 2) continue;
    const ids = [...cited.keys()].sort((x, y) => x - y);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (differentPeople?.(ids[i], ids[j], key)) continue;
        // Labelled as one of the edge's own papers cites the author, so one person reached
        // through two keys (an umlaut surname) is one name on the edge, not two spellings.
        const display = label(cited, ids[i], ids[j]);
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
