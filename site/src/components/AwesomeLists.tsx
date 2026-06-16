/** @jsxImportSource preact */
import './catalog-browser.css';
import './awesome-lists.css';
import { useMemo, useState } from 'preact/hooks';
import awesome from '../content/data/awesome-lists.json';
import { groupSlug } from '../lib/awesome-groups';

type Item = {
  name: string;
  url: string;
  repo: string | null;
  summary: string;
  summaryHtml: string;
  stars: number | null;
  pushedAt: string | null;
  archived: boolean | null;
};
type Group = { label: string; items: Item[] };

/** Format an ISO timestamp as "Mon YYYY" (e.g. "Jun 2026"); '' if unparseable. */
function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Compact star count: 1234 → "1.2k". */
function formatStars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}

/**
 * AwesomeLists — the curated-bibliography card browser (AwesomeLists.md).
 *
 * Mirrors CatalogBrowser: grouped cards with a search box and a group <select>,
 * full-catalog SSR so the page works with JavaScript disabled. Each card adds a
 * metrics row (★ stars · updated Mon YYYY) folded in from the committed GitHub
 * cache at build time; a caption notes the as-of date. Cards render without
 * metrics when the cache is absent.
 */
export default function AwesomeLists() {
  const groups = (awesome.groups ?? []) as Group[];
  const generatedAt = (awesome.generatedAt ?? null) as string | null;
  const total = useMemo(
    () => groups.reduce((n, g) => n + g.items.length, 0),
    [groups],
  );

  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return groups
      .filter((g) => !group || g.label === group)
      .map((g) => ({
        ...g,
        items: g.items.filter((e) =>
          !ql ? true : `${e.name} ${e.summary} ${g.label}`.toLowerCase().includes(ql),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [q, group, groups]);

  const shown = filtered.reduce((n, g) => n + g.items.length, 0);
  const asOf = generatedAt ? monthYear(generatedAt) : '';

  return (
    <div class="cb">
      <div class="cb-controls">
        <input
          class="cb-search"
          type="search"
          placeholder="Search lists by name or description…"
          aria-label="Search awesome lists"
          value={q}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        />
        <select
          class="cb-select"
          aria-label="Filter by topic"
          value={group}
          onChange={(e) => setGroup((e.target as HTMLSelectElement).value)}
        >
          <option value="">All topics ({groups.length})</option>
          {groups.map((g) => (
            <option value={g.label}>{g.label}</option>
          ))}
        </select>
      </div>

      <p class="cb-count" role="status">
        {shown} list{shown === 1 ? '' : 's'}
        {q || group ? ` of ${total}` : ` across ${groups.length} topics`}
        {asOf ? ` · metrics as of ${asOf}` : ''}
      </p>

      {shown === 0 ? (
        <p class="cb-empty">No lists match your search.</p>
      ) : (
        filtered.map((g) => (
          <section class="cb-grp">
            <h2 class="cb-grp-h caail-display" id={groupSlug(g.label)}>{g.label}</h2>
            <div class="cb-grid">
              {g.items.map((e) => (
                <article class="cb-card" id={e.repo ?? undefined}>
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
                  {(e.stars !== null || e.archived) && (
                    <p class="al-meta">
                      {e.stars !== null && (
                        <span class="al-stat" title={`${e.stars} GitHub stars`}>
                          <span aria-hidden="true">★</span> {formatStars(e.stars)}
                        </span>
                      )}
                      {e.pushedAt && monthYear(e.pushedAt) && (
                        <span class="al-stat">updated {monthYear(e.pushedAt)}</span>
                      )}
                      {e.archived && <span class="al-archived">archived</span>}
                    </p>
                  )}
                  <div
                    class="cb-sum"
                    // First-party content from our own canonical Markdown,
                    // rendered to HTML at build time (mdast→hast→html escapes any
                    // raw HTML), so this is not a user-input injection sink.
                    dangerouslySetInnerHTML={{ __html: e.summaryHtml }}
                  />
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
