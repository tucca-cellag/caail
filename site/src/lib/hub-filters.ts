/**
 * hub-filters.ts — the shared secondary-filter axis for the three cross-content hubs.
 *
 * Each hub owns one PRIMARY axis and routes on it (`/topics/?t=`, `/licenses/?tier=`,
 * `/citations/?band=`). This module lets any hub additionally narrow by the OTHER two,
 * so an intersection like "permissive resources tagged Metabolism & Modeling" is a URL:
 *
 *   /licenses/?tier=permissive&t=metabolism-modeling
 *   /citations/?band=1000plus&t=sensory-flavor
 *   /topics/?t=media-growth-factors&tier=permissive
 *
 * Param names are the hubs' existing ones, so a link written for one hub reads the same
 * on another. Keeping the predicates here (rather than three times) is what stops the
 * hubs disagreeing about what "in this band" means.
 *
 * Caveat worth remembering when reading a filtered count: the license axis excludes
 * papers (they carry no license), and the citation axis excludes anything OpenAlex
 * doesn't index. Both narrow the population before any intersection is taken.
 */

import topicsData from '../content/data/topics.json';
import { LICENSE_TIERS, TIER_META, type LicenseTier } from './licenses';
import { CITATION_BANDS, BAND_META, citationBand, type CitationBand } from './citation-bands';

export type TopicRef = { slug: string; label: string; theme: string };

export interface Secondary {
  t: string | null;
  tier: LicenseTier | null;
  band: CitationBand | null;
}

const topicLabels: Map<string, string> = new Map(
  [...(topicsData.themes as any[]), ...(topicsData.tags as any[])].map((n) => [n.slug, n.label]),
);

/** Parse the three axis params, ignoring any value that isn't a known member. */
export function readSecondary(search: string): Secondary {
  const p = new URLSearchParams(search);
  const t = p.get('t');
  const tier = p.get('tier');
  const band = p.get('band');
  return {
    t: t && topicLabels.has(t) ? t : null,
    tier: tier && (LICENSE_TIERS as readonly string[]).includes(tier) ? (tier as LicenseTier) : null,
    band: band && (CITATION_BANDS as readonly string[]).includes(band) ? (band as CitationBand) : null,
  };
}

/** A topic slug matches an item if it is one of its tags OR the parent theme of one. */
export const matchesTopic = (topics: TopicRef[] | undefined, slug: string | null): boolean =>
  slug === null || !!topics?.some((r) => r.slug === slug || r.theme === slug);

/** Papers have no tier, so a tier filter excludes them (tier `null` never matches). */
export const matchesTier = (tier: string | null | undefined, want: LicenseTier | null): boolean =>
  want === null || tier === want;

/** An unindexed item (count `null`) is unbanded, so a band filter excludes it. */
export const matchesBand = (count: number | null | undefined, want: CitationBand | null): boolean =>
  want === null || (count != null && citationBand(count) === want);

export const topicLabel = (slug: string): string => topicLabels.get(slug) ?? slug;
export const tierLabel = (tier: LicenseTier): string => TIER_META[tier].label;
export const bandLabel = (band: CitationBand): string => BAND_META[band].label;

/**
 * Rewrite the current query string with one param set or cleared, preserving the rest.
 * `base` is BASE_URL; `path` is the hub route ("licenses", "citations", "topics").
 */
export function hubUrl(
  base: string,
  path: string,
  params: Partial<Record<'t' | 'tier' | 'band', string | null>>,
  search = typeof location === 'undefined' ? '' : location.search,
): string {
  const p = new URLSearchParams(search);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  return `${base.replace(/\/$/, '')}/${path}/${qs ? `?${qs}` : ''}`;
}
