/** @jsxImportSource preact */
import './papers-explorer.css';
import { useMemo, useState } from 'preact/hooks';
import data from '../content/data/papers.sample.json';

type Area = { key: string; label: string; color: string };
type Cell = { method: string; area: string; refIds: number[] };
type Ref = { id: number; authors: string; year: number; title: string; journal: string; doi: string; codeUrl: string | null; dataUrl: string | null };

const areas = data.areas as Area[];
const methods = data.methods as string[];
const cells = data.cells as Cell[];
const refs = new Map<number, Ref>((data.references as Ref[]).map((r) => [r.id, r]));

const cellMap = new Map<string, Cell>(cells.map((c) => [`${c.method}__${c.area}`, c]));
const densityVar = (n: number) =>
  n === 0 ? 'var(--caail-density-0)' : n <= 2 ? 'var(--caail-density-1)' : n <= 4 ? 'var(--caail-density-2)' : n <= 7 ? 'var(--caail-density-3)' : 'var(--caail-density-4)';
const textColor = (n: number) => (n >= 5 ? '#fff' : n === 0 ? 'transparent' : 'var(--caail-ink)');

export default function PapersExplorer() {
  const [sel, setSel] = useState<{ method: string; area: Area } | null>(null);
  const [q, setQ] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('');

  const shownAreas = areaFilter ? areas.filter((a) => a.key === areaFilter) : areas;

  const selRefs = useMemo(() => {
    if (!sel) return [];
    const cell = cellMap.get(`${sel.method}__${sel.area.key}`);
    if (!cell) return [];
    const ql = q.toLowerCase();
    return cell.refIds
      .map((id) => refs.get(id))
      .filter((r): r is Ref => !!r)
      .filter((r) => !q || `${r.authors} ${r.title} ${r.doi}`.toLowerCase().includes(ql));
  }, [sel, q]);

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
        {areas.map((a) => <span class="px-lchip"><span class="px-sw" style={{ background: a.color }} />{a.label}</span>)}
      </div>

      <div class="px-work">
        <div class="px-mxpane">
          <div class="px-mx" style={{ gridTemplateColumns: `190px repeat(${shownAreas.length}, minmax(56px,1fr))` }}>
            <div class="px-corner">method ↓ / area →</div>
            {shownAreas.map((a) => <div class="px-hd" style={{ borderTopColor: a.color }}>{a.label}</div>)}
            {methods.map((m) => [
              <div class="px-rl">{m}</div>,
              ...shownAreas.map((a) => {
                const cell = cellMap.get(`${m}__${a.key}`);
                const n = cell ? cell.refIds.length : 0;
                const isSel = sel?.method === m && sel?.area.key === a.key;
                return (
                  <button class={`px-c${isSel ? ' sel' : ''}`} style={{ background: densityVar(n), color: textColor(n) }}
                    disabled={n === 0} aria-label={`${m} × ${a.label}: ${n} papers`}
                    onClick={() => setSel({ method: m, area: a })}>{n || ''}</button>
                );
              }),
            ])}
          </div>
        </div>

        <aside class="px-panel">
          {!sel && <p class="px-empty">Select a cell to read its references.</p>}
          {sel && (
            <>
              <p class="px-ptag">Selected cell</p>
              <h3 class="px-ph">{sel.method} × {sel.area.label}</h3>
              <p class="px-pmeta"><span class="px-sw" style={{ background: sel.area.color }} /> {cellMap.get(`${sel.method}__${sel.area.key}`)?.refIds.length ?? 0} papers</p>
              {selRefs.length === 0 && <p class="px-empty">Reference details arrive with the M1 parser.</p>}
              {selRefs.map((r) => (
                <div class="px-ref">
                  <div class="px-au">{r.authors} ({r.year})</div>
                  <div class="px-ti">{r.title}. <span class="px-jo">{r.journal}</span></div>
                  <div class="px-badges">
                    <a class="px-bdg doi" href={`https://doi.org/${r.doi}`}>{r.doi}</a>
                    {r.codeUrl && <a class="px-bdg code" href={r.codeUrl}>⟨⟩ Code</a>}
                    {r.dataUrl && <a class="px-bdg data" href={r.dataUrl}>▤ Data</a>}
                  </div>
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
