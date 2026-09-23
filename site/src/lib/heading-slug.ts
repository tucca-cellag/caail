/**
 * heading-slug.ts — the site's heading-to-anchor rule.
 *
 * No imports at all, so the parser can use it before any generated JSON exists
 * and browser islands can import it for free. `talk-sections.ts` re-exports
 * `siteSlug` as its `slug`, which keeps the Talks page ids and the link rewriters
 * on one rule. GitHub's rule, which links in the canonical Markdown are written
 * in, is the github-slugger library, used build-side in scripts/dedicated-links.ts.
 */

/** The site's section-id rule: lowercase, every non-alphanumeric run → "-". */
export function siteSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

