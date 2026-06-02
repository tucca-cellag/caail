/**
 * connectivity.ts — undirected graph connectivity helpers shared by the
 * shared-author and citation graph builders (graph.ts, citations.ts).
 *
 * Pure functions over plain endpoint pairs — no I/O, no schema coupling.
 */

/** A minimal undirected edge — only the endpoints matter for connectivity. */
export type Endpoints = { source: number; target: number };

/**
 * Largest connected component size over an undirected edge list, via union-find
 * with path compression. Isolated nodes count as singleton components, so the
 * result is ≥1 whenever `nodeIds` is non-empty. Directed edges are treated as
 * undirected (their direction is irrelevant to reachability).
 */
export function largestComponentSize(
  nodeIds: number[],
  edges: ReadonlyArray<Endpoints>,
): number {
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
  for (const e of edges) {
    // Guard against edges that reference ids outside nodeIds.
    if (parent.has(e.source) && parent.has(e.target)) union(e.source, e.target);
  }

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
