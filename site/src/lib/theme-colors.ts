/**
 * theme-colors.ts — one place that answers "what colour is this subject theme?".
 *
 * Previously the answer was hardcoded per-slug in three CSS files (topic-chips.css,
 * topic-hub.css, and the dashboard), which drifted: `metabolism-modeling` was painted
 * with `--caail-area-eval` despite having no matrix area, and `food-safety` had no
 * mapping at all and fell back to grey.
 *
 * The mapping is now DERIVED from `areaKey` in topics.json, which comes from the DB's
 * `topics.area_key`. A theme that maps to a matrix research area takes that area's
 * colour, so an area and its theme always agree. The two themes with no area
 * (Food Safety, Metabolism & Modeling) get their own tokens.
 *
 * Returns a `var(--…)` string rather than a literal so light/dark mode still resolve
 * through tokens.css. Callers set it as an inline custom property (`--chip`), which is
 * what lets the server-rendered remark card transform use the same source as the
 * Preact islands.
 */

import topicsData from '../content/data/topics.json';

type Node = { slug: string; areaKey: string | null };

const areaKeyBySlug = new Map<string, string | null>(
  [...(topicsData.themes as Node[]), ...(topicsData.tags as any[])].map((n) => [
    n.slug,
    (n as Node).areaKey ?? null,
  ]),
);

/** Parent theme of a fine tag, so a tag chip inherits its theme's colour. */
const themeOfTag = new Map<string, string>(
  (topicsData.tags as any[]).map((t) => [t.slug, t.theme as string]),
);

/** Themes with no matrix area. Kept explicit and tiny — if it grows, that is a signal
 *  the taxonomy has drifted from the matrix and wants a curator, not another entry. */
const AREALESS: Record<string, string> = {
  'metabolism-modeling': 'var(--caail-theme-metabolism)',
  'food-safety': 'var(--caail-theme-food-safety)',
};

/**
 * CSS colour for a theme OR fine-tag slug. Unknown slugs degrade to muted rather than
 * throwing, so a stale link can't break a render.
 */
export function themeColor(slug: string | null | undefined): string {
  if (!slug) return 'var(--caail-muted)';
  const resolved = areaKeyBySlug.has(slug) ? slug : '';
  if (!resolved) return 'var(--caail-muted)';

  // A fine tag has no area of its own; it inherits its parent theme.
  const themeSlug = themeOfTag.get(slug) ?? slug;
  const areaKey = areaKeyBySlug.get(themeSlug) ?? null;
  if (areaKey) return `var(--caail-area-${areaKey})`;
  return AREALESS[themeSlug] ?? 'var(--caail-muted)';
}

/** Inline style string setting the `--chip` custom property consumers already read. */
export const chipStyle = (slug: string | null | undefined): string =>
  `--chip:${themeColor(slug)}`;
