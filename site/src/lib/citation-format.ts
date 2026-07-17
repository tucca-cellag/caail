/**
 * citation-format.ts — pure "cited by N" badge formatting, shared by CitationBadge.tsx
 * and the dataset-cards remark (scripts/remark/dataset-cards.ts) so the label, tooltip,
 * and OpenAlex link can't drift between the Preact card badges and the raw-HTML dataset
 * badges. No `import.meta.env` / JSX, so it's importable from the build-time remark.
 */

/** Compact count for the badge label (4626 -> "4.6k"); the exact value goes in the tooltip. */
export function compactCount(n: number): string {
  return n < 1000
    ? String(n)
    : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/**
 * Tooltip text. Aggregated across N release papers when a versioned resource (#102),
 * else the single-paper form.
 */
export function citationTitle(citationCount: number, citationSources: number): string {
  return citationSources > 1
    ? `Cited by ${citationCount.toLocaleString()} — summed across ${citationSources} release papers of this resource (OpenAlex cited_by_count). A coarse popularity signal, not a quality measure; the link opens the current paper.`
    : `Cited by ${citationCount.toLocaleString()} (OpenAlex cited_by_count). A coarse popularity signal, not a quality measure — confirm at the source.`;
}

/**
 * OpenAlex works URL for the DOI(s) whose counts the badge shows — a single work, or an
 * OR-DOI filter (`doi:A|B|C`) over all the summed release papers so the destination matches
 * the badge number. Returns '' when there are no DOIs (the caller supplies its own fallback,
 * which needs the site BASE and so stays out of this pure module).
 */
export function openAlexWorksUrl(dois: string[]): string {
  return dois.length
    ? `https://openalex.org/works?filter=doi:${dois.map(encodeURIComponent).join('|')}`
    : '';
}
