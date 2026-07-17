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
import { compactCount, citationTitle, openAlexWorksUrl } from '../lib/citation-format';

export { compactCount, citationTitle } from '../lib/citation-format';

const BASE = import.meta.env.BASE_URL;

/**
 * OpenAlex works URL for the DOI(s), with the /citations/ hub as the no-DOI fallback (the
 * fallback needs the site BASE, so it wraps the pure `openAlexWorksUrl` here).
 */
export function citationHref(dois: string[]): string {
  return openAlexWorksUrl(dois) || `${BASE.replace(/\/$/, '')}/citations/`;
}

export default function CitationBadge({
  doi,
  citationCount,
  citationSources = 1,
  citationDois,
}: {
  doi: string | null;
  citationCount: number | null;
  /** how many papers the count aggregates; >1 marks a versioned-resource sum (#102) */
  citationSources?: number;
  /** the DOIs whose counts were summed; the link opens all of them (falls back to `doi`) */
  citationDois?: string[];
}) {
  if (citationCount == null) return null;
  const dois = citationDois && citationDois.length ? citationDois : doi ? [doi] : [];
  const external = dois.length > 0;
  const aggregated = citationSources > 1;
  return (
    <a
      class={`cite-badge${aggregated ? ' cite-badge--aggregated' : ''}`}
      href={citationHref(dois)}
      title={citationTitle(citationCount, citationSources)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <span class="cite-badge__label">cited by</span>
      <span class="cite-badge__n">{compactCount(citationCount)}</span>
      {aggregated ? <span class="cite-badge__agg" aria-hidden="true">∑</span> : null}
    </a>
  );
}
