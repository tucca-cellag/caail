/**
 * heading-slug.ts — the two heading-to-anchor rules a CAAIL link can carry.
 *
 * No data imports, so the parser can use it before any generated JSON exists.
 * `talk-sections.ts` re-exports `siteSlug` as its `slug`, which keeps the Talks
 * page ids and the link rewriters on one rule. GitHub's rule is not re-derived
 * here: it is github-slugger, the library GitHub's own anchors come from, since a
 * hand-written copy already disagreed with it on Unicode number classes.
 */
import { slug as githubSlugger } from 'github-slugger';

/** The site's section-id rule: lowercase, every non-alphanumeric run → "-". */
export function siteSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * GitHub's heading anchor for one heading, without the duplicate suffixes a
 * repeated heading gets (use a `GithubSlugger` instance for a whole file). So
 * "AI Agents & Foundation Models" → "ai-agents--foundation-models".
 */
export function githubSlug(s: string): string {
  return githubSlugger(s);
}
