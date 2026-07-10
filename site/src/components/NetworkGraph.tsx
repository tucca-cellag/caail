/** @jsxImportSource preact */
import './network-graph.css';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import graph from '../content/data/graph.json';

type GNode = {
  id: number; label: string; title: string | null; authorsText: string;
  year: number | null; isPrimary: boolean; methods: string[]; areas: string[];
  doi: string | null; journal: string | null; hasCode: boolean; hasData: boolean;
  degree: number; citesCount: number; citedByCount: number;
};
type GEdge = { source: number; target: number; sharedAuthors: string[] };
type CEdge = { source: number; target: number };
type ModeStats = { edges: number; connectedNodes: number; isolatedNodes: number; largestComponent: number };
type EdgeMode = 'author' | 'citation';

const nodes = graph.nodes as GNode[];
const edges = graph.edges as GEdge[];
const citationEdges = graph.citationEdges as CEdge[];
const meta = graph.metadata as { nodes: number; sharedAuthor: ModeStats; citation: ModeStats };
const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

const AREA_KEYS = ['media', 'cell', 'bioprocess', 'scaffolding', 'sensory', 'tooling', 'eval'] as const;
const AREA_LABELS: Record<string, string> = {
  media: 'Media Optimization', cell: 'Cellular Engineering', bioprocess: 'Bioprocess Control',
  scaffolding: 'Scaffolding', sensory: 'Sensory Prediction', tooling: 'AI Tooling / Methodology',
  eval: 'AI Evaluation & Benchmarking',
};

/** Connectivity in the active edge mode (drives sizing + isolation). */
function nodeDegree(n: GNode, mode: EdgeMode): number {
  return mode === 'citation' ? n.citesCount + n.citedByCount : n.degree;
}

/**
 * Resolve a CSS value (incl. `var(--token)`) to a concrete sRGB `rgb(r,g,b)`
 * string. Cytoscape's color parser doesn't understand OKLch (several CAAIL
 * tokens are authored that way), and modern browsers *preserve* the OKLch color
 * space in `getComputedStyle(...).color` — so we resolve the var, then paint it
 * onto a 1×1 canvas and read back the rasterized sRGB bytes, which is always
 * a plain rgb() value regardless of the source color space.
 */
function resolveColor(expr: string): string {
  const probe = document.createElement('span');
  probe.style.color = expr;
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return resolved || 'rgb(136,136,136)';
  ctx.fillStyle = '#888';
  ctx.fillStyle = resolved; // modern canvas parses oklch(); falls back to #888 if not
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** Token-driven node colors, resolved to cytoscape-safe rgb. */
function areaColors(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const k of AREA_KEYS) map[k] = resolveColor(`var(--caail-area-${k})`);
  map.none = resolveColor('var(--caail-muted)');
  return map;
}

export default function NetworkGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>('author');
  const [areaFilter, setAreaFilter] = useState('');
  const [hideIsolated, setHideIsolated] = useState(true);
  const [sel, setSel] = useState<GNode | null>(null);

  const maxDegree = useMemo(
    () => nodes.reduce((m, n) => Math.max(m, nodeDegree(n, edgeMode)), 1),
    [edgeMode],
  );

  // Active-mode stats + wording, used by the controls, canvas label, and panel.
  const stats = edgeMode === 'citation' ? meta.citation : meta.sharedAuthor;
  const linkWord = edgeMode === 'citation' ? 'citation' : 'shared-author';

  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let syncRect: (() => void) | null = null;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    (async () => {
      const cytoscape = (await import('cytoscape')).default;
      if (cancelled || !containerRef.current) return;

      const colors = areaColors();
      const ink = resolveColor('var(--caail-ink)');
      const citeColor = resolveColor('var(--caail-link)');
      const nodeArea = (n: GNode) => (n.areas[0] && AREA_KEYS.includes(n.areas[0] as any) ? n.areas[0] : 'none');

      const visible = nodes.filter((n) => {
        if (hideIsolated && nodeDegree(n, edgeMode) === 0) return false;
        if (areaFilter && !n.areas.includes(areaFilter)) return false;
        return true;
      });
      const visibleIds = new Set(visible.map((n) => n.id));

      const modeEdges =
        edgeMode === 'citation'
          ? citationEdges
              .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
              .map((e) => ({ data: { id: `c${e.source}-${e.target}`, source: String(e.source), target: String(e.target) } }))
          : edges
              .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
              .map((e) => ({ data: { id: `e${e.source}-${e.target}`, source: String(e.source), target: String(e.target) } }));

      const els = [
        ...visible.map((n) => ({
          data: { id: String(n.id), label: n.label, color: colors[nodeArea(n)], deg: nodeDegree(n, edgeMode), primary: n.isPrimary ? 1 : 0 },
        })),
        ...modeEdges,
      ];

      // Citation edges are directed (arrowhead at the cited paper); shared-author
      // edges are undirected and use the cheaper haystack curve.
      const edgeStyle =
        edgeMode === 'citation'
          ? {
              'width': 0.9, 'line-color': citeColor, 'opacity': 0.45,
              'curve-style': 'bezier', 'target-arrow-shape': 'triangle',
              'target-arrow-color': citeColor, 'arrow-scale': 0.6,
            }
          : { 'width': 0.8, 'line-color': '#9fb2cc', 'opacity': 0.5, 'curve-style': 'haystack' };

      cyRef.current?.destroy();
      const cy = cytoscape({
        container: containerRef.current,
        elements: els,
        style: [
          { selector: 'node', style: {
            'background-color': 'data(color)',
            'width': `mapData(deg, 0, ${maxDegree}, 24, 54)`,
            'height': `mapData(deg, 0, ${maxDegree}, 24, 54)`,
            'label': 'data(label)', 'font-size': 6, 'color': ink,
            'text-valign': 'bottom', 'text-margin-y': 2, 'min-zoomed-font-size': 7,
            'border-width': 1.5, 'border-color': 'data(color)',
          } },
          { selector: 'node[primary = 0]', style: { 'background-opacity': 0.25, 'border-style': 'dashed' } },
          { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#002E6D' } },
          { selector: 'edge', style: edgeStyle as any },
        ],
        layout: { name: 'cose', animate: reduced ? false : 'end', randomize: false, padding: 20 } as any,
        minZoom: 0.45,
        maxZoom: 3,
      });
      cy.on('tap', 'node', (evt: any) => {
        const id = Number(evt.target.id());
        setSel(nodes.find((n) => n.id === id) ?? null);
      });
      cy.on('tap', (evt: any) => { if (evt.target === cy) setSel(null); });
      cyRef.current = cy;
      // Exposed so e2e can click a node at its exact rendered position. Sweeping
      // the canvas until something is hit passes even when taps are offset.
      (containerRef.current as any).__cy = cy;
      setReady(true);

      // Cytoscape maps a click to model coords by subtracting the container's
      // viewport position, which it caches (`containerBB`) on first read with no
      // expiry. The cache is cleared only by cy.resize(), a pixel-ratio change, or
      // scroll/transitionend/animationend on the container or an ancestor. So a
      // *pure positional* shift — the container moves while its width and height
      // stay the same — leaves the cache stale and offsets every tap by that delta.
      // Here that shift comes from the async webfont swap reflowing the prose above
      // the graph, after `client:idle` has already mounted cytoscape.
      //
      // No observer catches it: a ResizeObserver only sees the container's own box
      // (unchanged), and cytoscape already installs one of those itself. Instead,
      // re-read the rect on pointerdown — capture phase on `window`, so it runs
      // before cytoscape's own mousedown/touchstart handlers project the event —
      // and resize only when the container has actually moved. That costs one
      // getBoundingClientRect per press and fixes the whole class of layout shift
      // rather than the one instance we can name.
      const container = containerRef.current!; // guarded at the top of this IIFE
      let rect = container.getBoundingClientRect();
      syncRect = () => {
        const next = container.getBoundingClientRect();
        if (Math.abs(next.left - rect.left) > 0.5 || Math.abs(next.top - rect.top) > 0.5) {
          rect = next;
          cyRef.current?.resize(); // clears cytoscape's stale containerBB
        }
      };
      window.addEventListener('pointerdown', syncRect, true);

      // Remeasure once the container has settled after mount. (The cose layout fits
      // the viewport itself on `layoutstop`, so we don't fit here — doing so would
      // fit pre-animation positions and double-fit on load.)
      requestAnimationFrame(() => {
        if (cancelled) return;
        cy.resize();
        rect = container.getBoundingClientRect();
      });
      // Size changes still want an immediate resize — cytoscape's own observer is
      // debounced by 100ms, which lags the nav/TOC collapse animation.
      ro = new ResizeObserver(() => {
        cyRef.current?.resize();
        rect = container.getBoundingClientRect();
      });
      ro.observe(container);
    })();

    return () => {
      cancelled = true;
      if (syncRect) window.removeEventListener('pointerdown', syncRect, true);
      ro?.disconnect();
      cyRef.current?.destroy();
      cyRef.current = null;
      // `destroy()` only flags the instance; it stays reachable. Drop the handle
      // so nothing can read a destroyed graph while the effect re-runs.
      if (containerRef.current) delete (containerRef.current as any).__cy;
    };
  }, [edgeMode, areaFilter, hideIsolated, maxDegree]);

  return (
    <div class="ng">
      <div class="ng-controls">
        <div class="ng-seg" role="group" aria-label="Edge type">
          <button type="button" class="ng-seg-btn" aria-pressed={edgeMode === 'author'}
            onClick={() => setEdgeMode('author')}>Shared author</button>
          <button type="button" class="ng-seg-btn" aria-pressed={edgeMode === 'citation'}
            onClick={() => setEdgeMode('citation')}>Citation</button>
        </div>
        <select class="ng-select" aria-label="Filter by research area"
          value={areaFilter} onChange={(e) => setAreaFilter((e.target as HTMLSelectElement).value)}>
          <option value="">All research areas</option>
          {AREA_KEYS.map((k) => <option value={k}>{AREA_LABELS[k]}</option>)}
        </select>
        <label class="ng-check">
          <input type="checkbox" checked={hideIsolated}
            onChange={(e) => setHideIsolated((e.target as HTMLInputElement).checked)} />
          Hide unconnected ({stats.isolatedNodes})
        </label>
        <span class="ng-meta">{meta.nodes} papers · {stats.edges} {linkWord} links · largest cluster {stats.largestComponent}</span>
      </div>

      <div class="ng-stage">
        <div ref={containerRef} class="ng-canvas" role="img"
          aria-label={`${edgeMode === 'citation' ? 'Citation' : 'Co-authorship'} network of ${meta.nodes} papers connected by ${stats.edges} ${linkWord} links`} />
        {!ready && (
          <p class="ng-fallback">
            Interactive paper network — requires JavaScript. Browse the full reference
            list in the <a href={`${base}/papers/explorer/`}>Papers Explorer</a>.
          </p>
        )}
        {sel && (
          <aside class="ng-panel">
            <button class="ng-close" aria-label="Close" onClick={() => setSel(null)}>×</button>
            <p class="ng-slug">{sel.label}</p>
            <p class="ng-au">{sel.authorsText}{sel.year ? ` (${sel.year})` : ''}</p>
            {sel.title && <p class="ng-ti">{sel.title}{sel.journal ? <> — <span class="ng-jo">{sel.journal}</span></> : null}</p>}
            <div class="ng-badges">
              {sel.doi && <a class="ng-bdg doi" href={`https://doi.org/${sel.doi}`} target="_blank" rel="noopener noreferrer">DOI</a>}
              {sel.hasCode && <a class="ng-bdg code" href={`${base}/papers/explorer/`}>Code</a>}
              {sel.hasData && <span class="ng-bdg data">Data</span>}
            </div>
            <p class="ng-degree">
              {edgeMode === 'citation'
                ? `cites ${sel.citesCount} · cited by ${sel.citedByCount}`
                : `${sel.degree} shared-author link${sel.degree === 1 ? '' : 's'}`}
              {sel.areas.length ? ` · ${sel.areas.map((a) => AREA_LABELS[a] ?? a).join(', ')}` : ''}
            </p>
          </aside>
        )}
      </div>

      <div class="ng-legend" aria-hidden="true">
        {AREA_KEYS.map((k) => (
          <span class="ng-lchip"><span class="ng-sw" style={{ background: `var(--caail-area-${k})` }} />{AREA_LABELS[k]}</span>
        ))}
        <span class="ng-lchip"><span class="ng-sw dashed" />Review / perspective</span>
        {edgeMode === 'citation' && (
          <span class="ng-lchip"><span class="ng-arrow" />arrow points to the cited paper</span>
        )}
      </div>
    </div>
  );
}
