/** @jsxImportSource preact */
import './catalog-browser.css';
import { useMemo, useState } from 'preact/hooks';
import catalog from '../content/data/catalog.json';
import { groupSlug } from '../lib/catalog-groups';
import TopicChips from './TopicChips';
import LicenseBadge from './LicenseBadge';
import CitationBadge from './CitationBadge';
import type { TopicRef } from '../lib/topic-chips';
import { LICENSE_TIERS, TIER_META, type LicenseTier } from '../lib/licenses';

type Entry = {
  slug: string;
  name: string;
  url: string;
  group: string;
  summary: string;
  summaryHtml: string;
  topics: TopicRef[];
  license: string | null;
  licenseSource: 'auto' | 'manual' | null;
  tier: LicenseTier;
  doi: string | null;
  doiSource: 'auto' | 'manual' | null;
  citationCount: number | null;
};
type Kind = 'software' | 'databases';

interface Props {
  /** Which catalog slice to render. */
  kind: Kind;
}

/**
 * CatalogBrowser — one island for both Software.md and Databases.md.
 *
 * Data is the build-time catalog.json (entries in document order). Entries are
 * shown grouped by their H2 section; a search box (name + summary + group) and
 * a group <select> narrow the view. The initial render (empty query, all
 * groups) lists every entry, so the SSR output is the full catalog and the
 * page is usable with JavaScript disabled — JS only adds filtering.
 */
export default function CatalogBrowser({ kind }: Props) {
  const entries = (catalog[kind] ?? []) as Entry[];
  // Distinct group labels in first-appearance (document) order.
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const e of entries) if (!seen.includes(e.group)) seen.push(e.group);
    return seen;
  }, [entries]);

  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  // License-tier facet: empty set = all tiers (no filter).
  const [tiers, setTiers] = useState<Set<LicenseTier>>(new Set());
  const toggleTier = (t: LicenseTier) =>
    setTiers((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  // "Most cited" facet: filter to entries with an OpenAlex count, ordered by count desc
  // (within each group, since the display stays grouped by area).
  const [citedOnly, setCitedOnly] = useState(false);
  const anyCited = useMemo(() => entries.some((e) => e.citationCount != null), [entries]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = entries.filter((e) => {
      if (group && e.group !== group) return false;
      if (tiers.size && !tiers.has(e.tier)) return false;
      if (citedOnly && e.citationCount == null) return false;
      if (!ql) return true;
      return `${e.name} ${e.summary} ${e.group} ${e.license ?? ''}`.toLowerCase().includes(ql);
    });
    if (citedOnly) list.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0));
    return list;
  }, [q, group, tiers, citedOnly, entries]);

  const noun = kind === 'software' ? 'tool' : 'database';

  return (
    <div class="cb">
      <div class="cb-controls">
        <input
          class="cb-search"
          type="search"
          placeholder={`Search ${noun}s by name or description…`}
          aria-label={`Search ${noun}s`}
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        <select
          class="cb-select"
          aria-label="Filter by area"
          value={group}
          onChange={(e) => setGroup((e.target as HTMLSelectElement).value)}
        >
          <option value="">All areas ({groups.length})</option>
          {groups.map((g) => (
            <option value={g}>{g}</option>
          ))}
        </select>
      </div>

      <div class="cb-facet not-content" role="group" aria-label="Filter by license tier">
        <span class="cb-facet-label">License:</span>
        {LICENSE_TIERS.map((t) => (
          <button
            type="button"
            class={`cb-tier lic-badge lic-badge--${t}${tiers.has(t) ? ' cb-tier--on' : ''}`}
            aria-pressed={tiers.has(t)}
            title={TIER_META[t].blurb}
            onClick={() => toggleTier(t)}
          >
            {TIER_META[t].label}
          </button>
        ))}
        {anyCited && (
          <button
            type="button"
            class={`cb-cited${citedOnly ? ' cb-cited--on' : ''}`}
            aria-pressed={citedOnly}
            title="Show only resources with an associated publication, most-cited first (OpenAlex)"
            onClick={() => setCitedOnly((v) => !v)}
          >
            Most cited
          </button>
        )}
      </div>

      <p class="cb-count" role="status">
        {filtered.length} {noun}
        {filtered.length === 1 ? '' : 's'}
        {q || group ? ` of ${entries.length}` : ` across ${groups.length} areas`}
      </p>

      {filtered.length === 0 ? (
        <p class="cb-empty">No {noun}s match your search.</p>
      ) : (
        groups
          .map((g) => ({ g, items: filtered.filter((e) => e.group === g) }))
          .filter(({ items }) => items.length > 0)
          .map(({ g, items }) => (
            <section class="cb-grp">
              <h2 class="cb-grp-h caail-display" id={groupSlug(g)}>{g}</h2>
              <div class="cb-grid">
                {items.map((e) => (
                  // Container, NOT a wrapping anchor: the summary now carries
                  // its own hyperlinks (nesting <a> in <a> is invalid). The
                  // title is the link to the canonical home; `id` lets the
                  // canonical markdown's intra-page "see X below" anchors land.
                  <article class="cb-card" id={e.slug}>
                    <LicenseBadge license={e.license} licenseSource={e.licenseSource} tier={e.tier} />
                    <h3 class="cb-name">
                      <a
                        class="cb-name-link"
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {e.name}
                        <span class="cb-ext" aria-hidden="true">↗</span>
                      </a>
                    </h3>
                    <div
                      class="cb-sum"
                      // First-party content from our own canonical Markdown,
                      // rendered to HTML at build time (mdast→hast→html escapes
                      // any raw HTML), so this is not a user-input injection sink.
                      dangerouslySetInnerHTML={{ __html: e.summaryHtml }}
                    />
                    <TopicChips topics={e.topics} />
                    {e.citationCount != null && (
                      <p class="cb-meta">
                        <CitationBadge doi={e.doi} citationCount={e.citationCount} />
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
