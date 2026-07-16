/** @jsxImportSource preact */
import './papers-explorer.css';
import './reference-shelf.css';
import { useMemo, useState } from 'preact/hooks';
import data from '../content/data/papers.json';
import TopicChips from './TopicChips';
import CitationBadge from './CitationBadge';
import type { TopicRef } from '../lib/topic-chips';

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

const cells = data.cells as Cell[];
const references = data.references as Ref[];

// A reference is "matrix-unreached" when no matrix cell cites it. Computed from
// the cells (not the section label) so this page can never contradict the
// matrix: if a paper is ever cited by a cell, it drops off this shelf.
const citedIds = new Set<number>();
for (const c of cells) for (const id of c.refIds) citedIds.add(id);
const unreached = references.filter((r) => !citedIds.has(r.id));

// Display order: reviews first, then the reference-work shelves. Any section not
// listed here sorts to the end in first-seen order (defensive against renames).
const SECTION_ORDER = [
  'Reviews & Perspectives',
  'Sensory & Flavor Reference Work',
  'Metabolic Reference Work',
  'Foundational Methods Reference Work',
  'Livestock Functional Genomics Reference Work',
];
const SECTION_BLURB: Record<string, string> = {
  'Reviews & Perspectives':
    'Review articles, position papers, and commentaries that survey or opine on the field rather than applying a specific AI method — so they sit outside the matrix.',
  'Sensory & Flavor Reference Work':
    'Foundational sensory-science, flavor-chemistry, and sensomics papers the AI × cell-ag work builds on.',
  'Metabolic Reference Work':
    'Genome-scale metabolic models (GEMs) and related metabolic infrastructure — the data resources, not the AI applied to them.',
  'Foundational Methods Reference Work':
    'Method and theory papers, from machine learning and cell biology, that underlie the matrix rows.',
  'Livestock Functional Genomics Reference Work':
    'FarmGTEx and adjacent multi-tissue atlases and annotation resources for cell-ag-relevant livestock species.',
};

type Group = { section: string; refs: Ref[] };
const groupsAll: Group[] = (() => {
  const bySection = new Map<string, Ref[]>();
  for (const r of unreached) {
    const arr = bySection.get(r.section);
    if (arr) arr.push(r);
    else bySection.set(r.section, [r]);
  }
  const ordered = [...bySection.keys()].sort((a, b) => {
    const ia = SECTION_ORDER.indexOf(a);
    const ib = SECTION_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return ordered.map((section) => ({
    section,
    // newest first within a shelf
    refs: bySection.get(section)!.slice().sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
  }));
})();

const matchesQuery = (r: Ref, ql: string): boolean =>
  `${r.authorsText} ${r.title ?? ''} ${r.journal ?? ''} ${r.doi ?? ''} ${r.year ?? ''}`
    .toLowerCase()
    .includes(ql);

const renderRef = (r: Ref) => (
  <div class="px-ref" key={r.id}>
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

export default function ReferenceShelf() {
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return groupsAll;
    return groupsAll
      .map((g) => ({ section: g.section, refs: g.refs.filter((r) => matchesQuery(r, ql)) }))
      .filter((g) => g.refs.length > 0);
  }, [q]);

  const total = groups.reduce((n, g) => n + g.refs.length, 0);

  return (
    <div class="rs">
      <div class="rs-controls">
        <input
          class="rs-search"
          placeholder="Search authors, titles, DOIs…"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
      </div>

      {total === 0 && <p class="rs-empty">No references match “{q.trim()}”.</p>}

      {groups.map((g) => (
        <section class="rs-group" key={g.section}>
          <div class="rs-ghead">
            <h2 class="rs-gtitle">{g.section}</h2>
            <span class="rs-gcount">{g.refs.length}</span>
          </div>
          {SECTION_BLURB[g.section] && <p class="rs-gblurb">{SECTION_BLURB[g.section]}</p>}
          <div class="rs-list">{g.refs.map(renderRef)}</div>
        </section>
      ))}
    </div>
  );
}
