/**
 * github-slug.ts — GitHub's heading anchor for one heading, build-side only.
 *
 * It is github-slugger itself, the library GitHub's own anchors come from, not a
 * re-derivation (a hand-written copy disagreed with it on Unicode number classes).
 * It lives under scripts/ rather than beside siteSlug in src/lib because browser
 * islands import that module, and nothing in the browser needs GitHub's rule.
 *
 * One heading, no duplicate suffixes; for a whole file use a `GithubSlugger`
 * instance. "AI Agents & Foundation Models" → "ai-agents--foundation-models".
 */
import { slug } from 'github-slugger';

export function githubSlug(text: string): string {
  return slug(text);
}
