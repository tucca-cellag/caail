/**
 * citation-bands.ts — shared OpenAlex citation-count → band classifier and band metadata.
 *
 * A single source of truth consumed by two surfaces so their groupings can't drift:
 *   - CitationHub.tsx — the /citations/ hub index + per-band lists
 *   - metrics.ts — the "By the Numbers" dashboard panel counts
 *
 * Mirrors `licenses.ts` deliberately: an ordered tier list, a metadata record, and a
 * total classifier function. Adding a band means editing this file alone.
 *
 * A citation count is a coarse POPULARITY signal, NOT a measure of quality or
 * significance — counts move over time, so confirm at the source. Items with no count
 * (no DOI, or a DOI OpenAlex doesn't index) are not "under 10": they are unbanded and
 * excluded from every tally here.
 */

export type CitationBand = '1000plus' | '100to999' | '10to99' | 'under10';

/** Bands in display order (most-cited → least-cited). */
export const CITATION_BANDS: readonly CitationBand[] = [
  '1000plus',
  '100to999',
  '10to99',
  'under10',
];

export interface BandMeta {
  /** Short human label, e.g. "1,000+ citations". */
  label: string;
  /** One-line explanation for the hub card / dashboard legend. */
  blurb: string;
  /** Membership test for a non-negative count. */
  test: (n: number) => boolean;
}

export const BAND_META: Record<CitationBand, BandMeta> = {
  '1000plus': {
    label: '1,000+ citations',
    blurb: "The field's most-cited works.",
    test: (n) => n >= 1000,
  },
  '100to999': {
    label: '100–999 citations',
    blurb: 'Widely cited across the literature.',
    test: (n) => n >= 100 && n < 1000,
  },
  '10to99': {
    label: '10–99 citations',
    blurb: 'Established, regularly cited work.',
    test: (n) => n >= 10 && n < 100,
  },
  under10: {
    label: 'Under 10 citations',
    blurb: 'Emerging, recent, or niche work.',
    test: (n) => n >= 0 && n < 10,
  },
};

/**
 * Classify a citation count into a band. Total by construction: a nonsensical
 * negative count degrades to `under10` rather than throwing, so one bad cache row
 * can't take down a build or a page render.
 */
export function citationBand(n: number): CitationBand {
  return CITATION_BANDS.find((b) => BAND_META[b].test(n)) ?? 'under10';
}
