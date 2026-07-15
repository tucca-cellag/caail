/**
 * topic-chips.ts — pure helpers for the topic chips shown on cards. The JSX lives in
 * TopicChips.tsx; the linkable/testable logic lives here (vitest runs in node, so
 * keeping the logic JSX-free makes it directly testable).
 */

export interface TopicRef { slug: string; label: string; theme: string; }
export interface Chip { slug: string; label: string; theme: string; href: string; }

/** The hub URL for a topic slug (the param-routed `/topics/` island — see TopicHub). */
export function topicHref(base: string, slug: string): string {
  return `${base.replace(/\/$/, '')}/topics/?t=${slug}`;
}

/** Chip props for an item's topic refs (empty in → empty out). */
export function chipProps(base: string, topics: TopicRef[]): Chip[] {
  return topics.map((t) => ({ slug: t.slug, label: t.label, theme: t.theme, href: topicHref(base, t.slug) }));
}
