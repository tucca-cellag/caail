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

export default function CitationBadge({
  doi,
  citationCount,
}: {
  doi: string | null;
  citationCount: number | null;
}) {
  if (citationCount == null) return null;
  const external = doi != null;
  return (
    <a
      class="cite-badge"
      href={citationHref(doi)}
      title={`Cited by ${citationCount.toLocaleString()} (OpenAlex cited_by_count). A coarse popularity signal, not a quality measure — confirm at the source.`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <span class="cite-badge__label">cited by</span>
      <span class="cite-badge__n">{compactCount(citationCount)}</span>
    </a>
  );
}
