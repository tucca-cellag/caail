/** @jsxImportSource preact */
/**
 * CitationBadge — a small "cited by N" pill (OpenAlex `cited_by_count`) shown on paper,
 * software, database, and curated-dataset cards. It renders inline (normal flow),
 * distinct from the corner license badge, and links to the work on OpenAlex so the count
 * can be confirmed at the source. A card with no count renders nothing.
 *
 * A coarse popularity signal, NOT a quality measure — the tooltip says so. Presentational;
 * styling is in ../styles/citation-badge.css (global, so the raw-HTML dataset-card badges
 * emitted by the dataset-cards remark share it).
 */
const BASE = import.meta.env.BASE_URL;

/** Compact count for the badge label (4626 -> "4.6k"); the exact value goes in the tooltip. */
export function compactCount(n: number): string {
  return n < 1000
    ? String(n)
    : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** OpenAlex work URL for a DOI (shows the work + who cites it); the /citations/ hub as fallback. */
export function citationHref(doi: string | null): string {
  return doi
    ? `https://openalex.org/works?filter=doi:${encodeURIComponent(doi)}`
    : `${BASE.replace(/\/$/, '')}/citations/`;
}

/** Tooltip text, aggregated across N release papers when a versioned resource (#102). */
export function citationTitle(citationCount: number, citationSources: number): string {
  return citationSources > 1
    ? `Cited by ${citationCount.toLocaleString()} — summed across ${citationSources} release papers of this resource (OpenAlex cited_by_count). A coarse popularity signal, not a quality measure; the link opens the current paper.`
    : `Cited by ${citationCount.toLocaleString()} (OpenAlex cited_by_count). A coarse popularity signal, not a quality measure — confirm at the source.`;
}

export default function CitationBadge({
  doi,
  citationCount,
  citationSources = 1,
}: {
  doi: string | null;
  citationCount: number | null;
  /** how many papers the count aggregates; >1 marks a versioned-resource sum (#102) */
  citationSources?: number;
}) {
  if (citationCount == null) return null;
  const external = doi != null;
  const aggregated = citationSources > 1;
  return (
    <a
      class={`cite-badge${aggregated ? ' cite-badge--aggregated' : ''}`}
      href={citationHref(doi)}
      title={citationTitle(citationCount, citationSources)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <span class="cite-badge__label">cited by</span>
      <span class="cite-badge__n">{compactCount(citationCount)}</span>
      {aggregated ? <span class="cite-badge__agg" aria-hidden="true">∑</span> : null}
    </a>
  );
}
