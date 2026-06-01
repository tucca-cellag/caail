/** @jsxImportSource preact */
import './catalog-browser.css';
import { useMemo, useState } from 'preact/hooks';
import catalog from '../content/data/catalog.json';

type Entry = { slug: string; name: string; url: string; group: string; summary: string };
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

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (group && e.group !== group) return false;
      if (!ql) return true;
      return `${e.name} ${e.summary} ${e.group}`.toLowerCase().includes(ql);
    });
  }, [q, group, entries]);

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
              <h2 class="cb-grp-h caail-display">{g}</h2>
              <div class="cb-grid">
                {items.map((e) => (
                  <a
                    class="cb-card"
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <h3 class="cb-name">
                      {e.name}
                      <span class="cb-ext" aria-hidden="true">↗</span>
                    </h3>
                    <p class="cb-sum">{e.summary}</p>
                  </a>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
