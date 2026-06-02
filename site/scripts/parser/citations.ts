/**
 * citations.ts — derives directed citation edges between in-corpus papers from
 * a committed OpenAlex cache.
 *
 * The cache (citation-cache.json, produced by fetch-citations.ts) maps each
 * paper's DOI → its OpenAlex work id + that work's `referenced_works` list.
 * Citation edges are the *intersection* of those reference lists with the
 * corpus: an edge N→M ("N cites M") exists when M's OpenAlex id appears in N's
 * referenced_works AND M is also a CAAIL reference.
 *
 * This keeps the parse step deterministic and network-free — the only network
 * access lives in fetch-citations.ts. With no cache (or an empty one), the
 * citation graph is simply empty (every node isolated) and the page's citation
 * toggle still works.
 *
 * Pure transform over a PapersData model + parsed cache — no I/O.
 */

import { z } from 'zod';

import { largestComponentSize } from './connectivity.js';
import type { CitationEdge, GraphModeStats, PapersData } from './types.js';

// ---------------------------------------------------------------------------
// Cache schema (input — committed citation-cache.json)
// ---------------------------------------------------------------------------

export const CitationCacheWorkSchema = z.object({
  /** OpenAlex work id, e.g. "https://openalex.org/W4385245360" */
  openalexId: z.string().min(1),
  /** OpenAlex `referenced_works` — ids of works this paper cites */
  referencedWorks: z.array(z.string()),
});

export const CitationCacheSchema = z.object({
  /** ISO timestamp of the fetch run that produced this cache */
  generatedAt: z.string(),
  /** keyed by bare lowercase DOI (see doiKey) */
  works: z.record(z.string(), CitationCacheWorkSchema),
});

export type CitationCacheWork = z.infer<typeof CitationCacheWorkSchema>;
export type CitationCache = z.infer<typeof CitationCacheSchema>;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a DOI to a bare lowercase key: strip the scheme/host
 * (`https://doi.org/`, `https://dx.doi.org/`) and any `doi:` prefix, lowercase.
 * Returns null for empty/absent input. DOIs are case-insensitive, so lowercasing
 * is safe and makes our refs (mixed-case bare DOIs) and OpenAlex's `doi`
 * (lowercase URL) key to the same value.
 */
export function doiKey(doi: string | null | undefined): string | null {
  if (!doi) return null;
  let d = doi.trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  d = d.replace(/^doi:/, '');
  return d || null;
}

/**
 * Normalize an OpenAlex work id to its bare lowercase identifier (last path
 * segment), so `https://openalex.org/W123` and a bare `W123` compare equal.
 */
function openalexKey(id: string): string {
  const trimmed = id.trim();
  const seg = trimmed.split('/').pop() ?? trimmed;
  return seg.toLowerCase();
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export type CitationData = {
  /** directed edges: source cites target */
  edges: CitationEdge[];
  /** refId → out-degree (in-corpus papers it cites) */
  citesCount: Map<number, number>;
  /** refId → in-degree (in-corpus papers that cite it) */
  citedByCount: Map<number, number>;
  /** connectivity stats over the undirected projection */
  stats: GraphModeStats;
};

/**
 * Build the directed citation graph from a PapersData model and an optional
 * OpenAlex cache. With no cache, returns empty edges and zeroed counts.
 */
export function buildCitationData(
  model: PapersData,
  cache?: CitationCache | null,
): CitationData {
  const refs = model.references;
  const nodeIds = refs.map((r) => r.id);
  const citesCount = new Map<number, number>(nodeIds.map((id) => [id, 0]));
  const citedByCount = new Map<number, number>(nodeIds.map((id) => [id, 0]));
  const edges: CitationEdge[] = [];

  if (cache && Object.keys(cache.works).length > 0) {
    // Map OpenAlex work id → in-corpus refId, plus refId → its cache entry,
    // restricted to refs whose DOI is present in the cache.
    const oaKeyToRef = new Map<string, number>();
    const refToEntry = new Map<number, CitationCacheWork>();
    for (const ref of refs) {
      const key = doiKey(ref.doi);
      if (!key) continue;
      const entry = cache.works[key];
      if (!entry) continue;
      refToEntry.set(ref.id, entry);
      oaKeyToRef.set(openalexKey(entry.openalexId), ref.id);
    }

    // Directed edge N→M when M's OpenAlex id is among N's referenced_works.
    const seen = new Set<string>();
    for (const ref of refs) {
      const entry = refToEntry.get(ref.id);
      if (!entry) continue;
      for (const rw of entry.referencedWorks) {
        const target = oaKeyToRef.get(openalexKey(rw));
        if (target === undefined || target === ref.id) continue;
        const k = `${ref.id}->${target}`;
        if (seen.has(k)) continue; // dedup repeated references
        seen.add(k);
        edges.push({ source: ref.id, target });
        citesCount.set(ref.id, (citesCount.get(ref.id) ?? 0) + 1);
        citedByCount.set(target, (citedByCount.get(target) ?? 0) + 1);
      }
    }
  }

  const connected = new Set<number>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  const stats: GraphModeStats = {
    edges: edges.length,
    connectedNodes: connected.size,
    isolatedNodes: nodeIds.length - connected.size,
    largestComponent: edges.length === 0 ? 0 : largestComponentSize(nodeIds, edges),
  };

  return { edges, citesCount, citedByCount, stats };
}
