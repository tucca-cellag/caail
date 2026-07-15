/** @jsxImportSource preact */
/**
 * CitationHub — the /citations/ cross-content hub (mirrors LicenseHub). A banded index by
 * OpenAlex `cited_by_count` (1,000+ / 100–999 / 10–99 / under 10) → a per-band list of
 * every Paper, Software, Database, and Dataset entry with a citation count, param-routed
 * via `?band=`. Unlike the license hub, papers ARE included (they're the richest source).
 * Reads papers.json + catalog.json + datasets.json directly (client-side grouping), so no
 * extra build artifact. Items with no count (no DOI, or a DOI OpenAlex doesn't index) are
 * omitted — a missing count is "not indexed", not a citation level.
 *
 * A coarse popularity signal, NOT a quality measure — verify significance at the source.
 */
import '../styles/citation-hub.css';
import { useEffect, useState } from 'preact/hooks';
import papers from '../content/data/papers.json';
import catalog from '../content/data/catalog.json';
import datasets from '../content/data/datasets.json';

const BASE = import.meta.env.BASE_URL;
const hub = (band: Band) => `${BASE.replace(/\/$/, '')}/citations/?band=${band}`;

const BANDS = ['1000plus', '100to999', '10to99', 'under10'] as const;
type Band = (typeof BANDS)[number];

const BAND_META: Record<Band, { label: string; blurb: string; test: (n: number) => boolean }> = {
  '1000plus': { label: '1,000+ citations', blurb: "The field's most-cited works.", test: (n) => n >= 1000 },
  '100to999': { label: '100–999 citations', blurb: 'Widely cited across the literature.', test: (n) => n >= 100 && n < 1000 },
  '10to99': { label: '10–99 citations', blurb: 'Established, regularly cited work.', test: (n) => n >= 10 && n < 100 },
  under10: { label: 'Under 10 citations', blurb: 'Emerging, recent, or niche work.', test: (n) => n >= 0 && n < 10 },
};

type Kind = 'paper' | 'software' | 'database' | 'dataset';
type Item = { kind: Kind; label: string; url: string; count: number };

const KIND_LABEL: Record<Kind, string> = { paper: 'Papers', software: 'Software', database: 'Databases', dataset: 'Datasets' };
const openalex = (doi: string) => `https://openalex.org/works?filter=doi:${encodeURIComponent(doi)}`;

const items: Item[] = [
  ...(papers.references as any[])
    .filter((r) => r.citedByOpenAlex != null)
    .map((r) => ({
      kind: 'paper' as const,
      label: (r.title as string | null) ?? (r.authorsText as string),
      url: r.doi ? `https://doi.org/${r.doi}` : `${BASE.replace(/\/$/, '')}/papers/explorer/`,
      count: r.citedByOpenAlex as number,
    })),
  ...(catalog.software as any[])
    .filter((e) => e.citationCount != null)
    .map((e) => ({ kind: 'software' as const, label: e.name, url: e.doi ? openalex(e.doi) : e.url, count: e.citationCount as number })),
  ...(catalog.databases as any[])
    .filter((e) => e.citationCount != null)
    .map((e) => ({ kind: 'database' as const, label: e.name, url: e.doi ? openalex(e.doi) : e.url, count: e.citationCount as number })),
  ...(datasets.entries as any[])
    .filter((e) => e.citationCount != null)
    .map((e) => ({
      kind: 'dataset' as const,
      label: e.name,
      url: e.doi ? openalex(e.doi) : e.url ?? `${BASE}datasets/${String(e.page).toLowerCase()}/#${e.anchor}`,
      count: e.citationCount as number,
    })),
];

const bandOf = (n: number): Band => BANDS.find((b) => BAND_META[b].test(n))!;
const countAt = (band: Band) => items.filter((it) => bandOf(it.count) === band).length;

function BandIndex() {
  const total = items.length;
  return (
    <div class="ch-index not-content">
      <p class="ch-disclaimer">
        Citation counts are OpenAlex <code>cited_by_count</code> values — a coarse <strong>popularity</strong>
        {' '}signal, <strong>not</strong> a measure of quality or significance. Counts move over time; confirm at the source.
      </p>
      <ul class="ch-band-grid">
        {BANDS.map((b) => (
          <li class="ch-band-card" data-band={b}>
            <a class="ch-band-link" href={hub(b)}>{BAND_META[b].label}</a>
            <div class="ch-total">{countAt(b)} of {total} resources</div>
            <p class="ch-blurb">{BAND_META[b].blurb}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BandView({ band }: { band: Band }) {
  const scoped = items.filter((it) => bandOf(it.count) === band).sort((a, b) => b.count - a.count);
  const kinds: Kind[] = ['paper', 'software', 'database', 'dataset'];
  return (
    <div class="ch-view not-content" data-band={band}>
      <nav class="ch-crumbs"><a href={`${BASE.replace(/\/$/, '')}/citations/`}>All bands</a></nav>
      <h2 class="ch-title caail-display">{BAND_META[band].label}</h2>
      <p class="ch-blurb">{BAND_META[band].blurb}</p>
      {scoped.length === 0 ? (
        <p class="ch-empty">No resources in this band yet.</p>
      ) : (
        kinds.map((kind) => {
          const group = scoped.filter((it) => it.kind === kind);
          if (group.length === 0) return null;
          return (
            <section class="ch-group">
              <h3 class="ch-group-h">{KIND_LABEL[kind]} <span class="ch-group-n">{group.length}</span></h3>
              <ul class="ch-items">
                {group.map((it) => (
                  <li>
                    <a class="ch-item" href={it.url} target={it.url.startsWith('http') ? '_blank' : undefined} rel={it.url.startsWith('http') ? 'noopener noreferrer' : undefined}>
                      <span class="ch-label">{it.label}</span>
                      <span class="ch-count" title={`${it.count.toLocaleString()} citations (OpenAlex)`}>{it.count.toLocaleString()}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

export default function CitationHub() {
  const [sel, setSel] = useState<Band | null>(null);
  useEffect(() => {
    const b = new URLSearchParams(location.search).get('band');
    if (b && (BANDS as readonly string[]).includes(b)) setSel(b as Band);
  }, []);
  return sel ? <BandView band={sel} /> : <BandIndex />;
}
