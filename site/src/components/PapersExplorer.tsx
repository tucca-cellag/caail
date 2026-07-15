/** @jsxImportSource preact */
import './papers-explorer.css';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import data from '../content/data/papers.json';
import taxonomy from '../content/data/taxonomy.json';
import TopicChips from './TopicChips';
import CitationBadge from './CitationBadge';
import type { TopicRef } from '../lib/topic-chips';

type Area = { key: string; label: string };
type Cell = { method: string; area: string; refIds: number[]; labels: string[] };
type Ref = {
  id: number; section: string; raw: string;
  authors: string[] | null; authorsText: string;
  year: number | null; title: string | null; journal: string | null;
  doi: string | null; codeUrl: string | null; dataUrl: string | null;
  isPrimary: boolean; hasCode: boolean; hasData: boolean;
  slug: string; methods: string[]; areas: string[]; topics: TopicRef[];
  citedByOpenAlex: number | null;
};

const areas = data.areas as Area[];
const methods = data.methods as string[];
const cells = data.cells as Cell[];
const refs = new Map<number, Ref>((data.references as Ref[]).map((r) => [r.id, r]));
const defs = taxonomy.definitions as Record<string, string>;

const cellMap = new Map<string, Cell>(cells.map((c) => [`${c.method}__${c.area}`, c]));
const densityVar = (n: number) =>
  n === 0 ? 'var(--caail-density-0)' : n <= 2 ? 'var(--caail-density-1)' : n <= 4 ? 'var(--caail-density-2)' : n <= 7 ? 'var(--caail-density-3)' : 'var(--caail-density-4)';
const textColor = (n: number) => (n >= 5 ? '#fff' : n === 0 ? 'transparent' : 'var(--caail-ink)');

// A reference matches the search query if the query appears anywhere in its
// author/title/journal/doi/year text. Shared by the matrix filter (matchIds),
// the per-cell list, and the global results panel so all three agree.
const matchesQuery = (r: Ref, ql: string): boolean =>
  `${r.authorsText} ${r.title ?? ''} ${r.journal ?? ''} ${r.doi ?? ''} ${r.year ?? ''}`
    .toLowerCase()
    .includes(ql);

// Link an axis label to its canonical definition in Taxonomy.md (rendered at
// /taxonomy/). The heading anchor is the GitHub slug of the label, matching the
// matrix-header links in Papers.md (e.g. "AI Tooling / Methodology" -> #ai-tooling--methodology).
// BASE_URL is "/caail" (no trailing slash) in islands, so normalise like the
// other components (NetworkGraph.tsx) before joining — a bare template join
// would yield "/caailtaxonomy/".
const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
const TAXONOMY = `${BASE}/taxonomy/`;
const ghSlug = (s: string) => s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/ /g, '-');
const taxHref = (label: string) => `${TAXONOMY}#${ghSlug(label)}`;
// Spell out the acronym method rows for readers who don't know them (others are already full names).
const FULL_NAME: Record<string, string> = {
  SVM: 'Support Vector Machine',
  CNN: 'Convolutional Neural Network',
  GNN: 'Graph Neural Network',
  'GAN / VAE': 'Generative Adversarial Network / Variational Autoencoder',
};
const fullName = (m: string) => FULL_NAME[m] ?? m;

// Definition popup state. Anchored to the trigger via fixed-position coords so
// it escapes the matrix pane's `overflow:auto` clipping. `place` flips the
// popup above the trigger when the trigger sits low in the viewport.
type Pop = { label: string; x: number; place: 'below'; top: number } | { label: string; x: number; place: 'above'; bottom: number };
const POP_MAX = 340; // px — keep in sync with .px-pop max-width + padding

export default function PapersExplorer() {
  const [sel, setSel] = useState<{ method: string; area: Area } | null>(null);
  const [q, setQ] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [pop, setPop] = useState<Pop | null>(null);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shownAreas = areaFilter ? areas.filter((a) => a.key === areaFilter) : areas;

  // Search → the set of matching ref ids (null when the box is empty, i.e. no
  // filter). Drives the matrix cell counts so typing dims non-matching cells.
  const matchIds = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return null;
    const s = new Set<number>();
    for (const r of refs.values()) if (matchesQuery(r, ql)) s.add(r.id);
    return s;
  }, [q]);

  // Count for a cell, honouring the active search filter.
  const cellCount = (cell: Cell | undefined): number => {
    if (!cell) return 0;
    if (!matchIds) return cell.refIds.length;
    let n = 0;
    for (const id of cell.refIds) if (matchIds.has(id)) n++;
    return n;
  };

  // When an area is selected, rank the method rows by how many (matching)
  // papers they have in that area, most first. Stable sort keeps canonical
  // order among ties and for the unfiltered "All areas" view.
  const shownMethods = useMemo(() => {
    if (!areaFilter) return methods;
    const countOf = (m: string) => cellCount(cellMap.get(`${m}__${areaFilter}`));
    return [...methods].sort((a, b) => countOf(b) - countOf(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaFilter, matchIds]);

  const selRefs = useMemo(() => {
    if (!sel) return [];
    const cell = cellMap.get(`${sel.method}__${sel.area.key}`);
    if (!cell) return [];
    const ql = q.trim().toLowerCase();
    return cell.refIds
      .map((id) => refs.get(id))
      .filter((r): r is Ref => !!r)
      .filter((r) => !ql || matchesQuery(r, ql));
  }, [sel, q]);

  // Global results shown in the side panel when a query is active but no cell
  // is selected — so search gives immediate feedback without a click.
  const globalResults = useMemo(() => {
    if (!matchIds) return [];
    return [...matchIds]
      .map((id) => refs.get(id))
      .filter((r): r is Ref => !!r)
      .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  }, [matchIds]);

  // --- Definition popup handlers ------------------------------------------
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const closePop = () => {
    cancelClose();
    setPop(null);
    setPinned(false);
  };
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setPop(null), 120);
  };
  const openPopAt = (el: HTMLElement, label: string) => {
    cancelClose();
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - POP_MAX - 8));
    // Flip above the trigger when it sits in the lower part of the viewport.
    const next: Pop =
      r.top > window.innerHeight * 0.6
        ? { label, x, place: 'above', bottom: window.innerHeight - r.top + 6 }
        : { label, x, place: 'below', top: r.bottom + 6 };
    setPop(next);
  };
  const togglePin = (el: HTMLElement, label: string) => {
    if (pinned && pop?.label === label) {
      closePop();
    } else {
      openPopAt(el, label);
      setPinned(true);
    }
  };
  const axisProps = (label: string) => ({
    type: 'button' as const,
    class: 'px-axl',
    'aria-expanded': pop?.label === label,
    onMouseEnter: (e: MouseEvent) => openPopAt(e.currentTarget as HTMLElement, label),
    onMouseLeave: scheduleClose,
    onFocus: (e: FocusEvent) => openPopAt(e.currentTarget as HTMLElement, label),
    onBlur: scheduleClose,
    onClick: (e: MouseEvent) => togglePin(e.currentTarget as HTMLElement, label),
  });

  // Dismiss on Escape, any scroll (fixed coords would otherwise go stale), or a
  // mousedown outside the popup and its triggers.
  useEffect(() => {
    if (!pop) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePop(); };
    const onScroll = () => closePop();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.px-pop') && !t.closest('.px-axl')) closePop();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [pop]);

  const renderRef = (r: Ref) => (
    <div class="px-ref">
      <div class="px-au">{r.authorsText}{r.year != null ? ` (${r.year})` : ''}</div>
      <div class="px-ti">{r.title ?? ''}{r.journal ? <>. <span class="px-jo">{r.journal}</span></> : ''}</div>
      <div class="px-badges">
        {r.doi && <a class="px-bdg doi" href={`https://doi.org/${r.doi}`}>{r.doi}</a>}
        {r.codeUrl && <a class="px-bdg code" href={r.codeUrl}>⟨⟩ Code</a>}
        {r.dataUrl && <a class="px-bdg data" href={r.dataUrl}>▤ Data</a>}
        <CitationBadge doi={r.doi} citationCount={r.citedByOpenAlex} />
      </div>
      <TopicChips topics={r.topics} />
    </div>
  );

  return (
    <div class="px">
      <div class="px-controls">
        <input class="px-search" placeholder="Search authors, titles, DOIs…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <select class="px-select" value={areaFilter} onChange={(e) => setAreaFilter((e.target as HTMLSelectElement).value)}>
          <option value="">All areas</option>
          {areas.map((a) => <option value={a.key}>{a.label}</option>)}
        </select>
      </div>

      <div class="px-legend">
        {areas.map((a) => <span class="px-lchip"><span class="px-sw" style={{ background: `var(--caail-area-${a.key})` }} />{a.label}</span>)}
      </div>

      <div class="px-work">
        <div class="px-mxpane">
          <div class="px-mx" style={{ gridTemplateColumns: `190px repeat(${shownAreas.length}, minmax(56px,1fr))` }}>
            <div class="px-corner">method ↓ / area →</div>
            {shownAreas.map((a) => <div class="px-hd" style={{ borderTopColor: `var(--caail-area-${a.key})` }}><button {...axisProps(a.label)}>{a.label}</button></div>)}
            {shownMethods.map((m) => [
              <div class="px-rl"><button {...axisProps(m)}>{m}</button></div>,
              ...shownAreas.map((a) => {
                const cell = cellMap.get(`${m}__${a.key}`);
                const n = cellCount(cell);
                const isSel = sel?.method === m && sel?.area.key === a.key;
                return (
                  <button class={`px-c${isSel ? ' sel' : ''}`} style={{ background: densityVar(n), color: textColor(n) }}
                    disabled={n === 0} aria-label={`${m} × ${a.label}: ${n} ${n === 1 ? 'paper' : 'papers'}`}
                    onClick={() => setSel({ method: m, area: a })}>{n || ''}</button>
                );
              }),
            ])}
          </div>
        </div>

        <aside class="px-panel">
          {!sel && !matchIds && <p class="px-empty">Select a cell to read its references.</p>}

          {!sel && matchIds && (
            <>
              <p class="px-ptag">Search results</p>
              <h3 class="px-ph">{globalResults.length} matching {globalResults.length === 1 ? 'paper' : 'papers'}</h3>
              {globalResults.length === 0 && <p class="px-empty">No papers match “{q.trim()}”.</p>}
              {globalResults.map(renderRef)}
            </>
          )}

          {sel && (
            <>
              <p class="px-ptag">Selected cell</p>
              <h3 class="px-ph">{sel.method} × {sel.area.label}</h3>
              <p class="px-pmeta"><span class="px-sw" style={{ background: `var(--caail-area-${sel.area.key})` }} /> {cellCount(cellMap.get(`${sel.method}__${sel.area.key}`))} papers</p>
              {selRefs.length === 0 && <p class="px-empty">No references match.</p>}
              {selRefs.map(renderRef)}
            </>
          )}
        </aside>
      </div>

      {pop && (
        <div
          class="px-pop"
          style={pop.place === 'below'
            ? { left: `${pop.x}px`, top: `${pop.top}px` }
            : { left: `${pop.x}px`, bottom: `${pop.bottom}px` }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <p class="px-pop-h">{fullName(pop.label)}</p>
          <p class="px-pop-b">{defs[pop.label] ?? 'No definition available.'}</p>
          <a class="px-pop-link" href={taxHref(pop.label)}>View full definition →</a>
        </div>
      )}
    </div>
  );
}
