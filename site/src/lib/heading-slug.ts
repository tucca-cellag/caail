/**
 * heading-slug.ts — the two heading-to-anchor rules a CAAIL link can carry.
 *
 * Pure (no data imports), so the parser can use it before any generated JSON
 * exists. `talk-sections.ts` re-exports `siteSlug` as its `slug`, which keeps
 * the Talks page ids and the link rewriters on one rule.
 */

/** The site's section-id rule: lowercase, every non-alphanumeric run → "-". */
export function siteSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * GitHub's heading-anchor rule (github-slugger, minus duplicate suffixes):
 * lowercase, drop punctuation, one "-" per space. So "AI Agents & Foundation
 * Models" → "ai-agents--foundation-models": the dropped "&" leaves two spaces.
 */
export function githubSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .replace(/ /g, '-');
}
