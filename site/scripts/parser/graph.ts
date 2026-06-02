/**
 * graph.ts — builds graph.json, a shared-author co-authorship network over the
 * Papers.md references.
 *
 * Nodes are references; an edge joins two references that share ≥1 author.
 * Authors are normalized to `surname|first-initial` (lowercased) so initial-only
 * variants ("Li, X." vs "Li, X. M.") still match without merging distinct people
 * by surname alone. References with `authors === null` form no edges (isolated).
 *
 * Pure transform over an already-built PapersData model — no I/O.
 */

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

/** Largest connected component size over an undirected edge list. */
function largestComponentSize(nodeIds: number[], edges: GraphEdge[]): number {
  const parent = new Map<number, number>(nodeIds.map((id) => [id, id]));
  const find = (x: number): number => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path-compress
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const e of edges) union(e.source, e.target);

  const sizes = new Map<number, number>();
  let max = 0;
  for (const id of nodeIds) {
    const root = find(id);
    const n = (sizes.get(root) ?? 0) + 1;
    sizes.set(root, n);
    if (n > max) max = n;
  }
  return max;
}

/**
 * Build the shared-author graph model from a PapersData model.
 */
export function buildGraphModel(model: PapersData): Graph {
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

  // Degree per node.
  const degree = new Map<number, number>(refs.map((r) => [r.id, 0]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }

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
  }));

  const isolatedNodes = nodes.filter((n) => n.degree === 0).length;
  const metadata = {
    nodes: nodes.length,
    edges: edges.length,
    connectedNodes: nodes.length - isolatedNodes,
    isolatedNodes,
    largestComponent: largestComponentSize(
      nodes.map((n) => n.id),
      edges,
    ),
  };

  return GraphSchema.parse({ metadata, nodes, edges });
}
