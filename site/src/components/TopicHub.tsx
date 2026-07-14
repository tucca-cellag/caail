/** @jsxImportSource preact */
import '../styles/topic-hub.css';
import { useEffect, useState } from 'preact/hooks';
import topicsData from '../content/data/topics.json';
import catalog from '../content/data/catalog.json';
import papers from '../content/data/papers.json';
import { topicHref } from '../lib/topic-chips';

type TopicRef = { slug: string; label: string; theme: string };
type Counts = { paper: number; software: number; database: number; dataset: number; total: number };
type Node = {
  slug: string; label: string; tier: 'theme' | 'tag';
  theme: string | null; areaKey: string | null; counts: Counts; tags: string[];
};

const themes = topicsData.themes as Node[];
const tags = topicsData.tags as Node[];
const bySlug = new Map<string, Node>([...themes, ...tags].map((n) => [n.slug, n]));
const BASE = import.meta.env.BASE_URL;

// Unified, clickable content items (datasets have no site JSON → count only).
type Item = { kind: 'paper' | 'software' | 'database'; label: string; url: string; topics: TopicRef[] };
const items: Item[] = [
  ...(papers.references as any[]).filter((r) => r.topics?.length).map((r) => ({
    kind: 'paper' as const,
    label: `${r.authorsText}${r.year != null ? ` (${r.year})` : ''}${r.title ? ` — ${r.title}` : ''}`,
    url: r.doi ? `https://doi.org/${r.doi}` : `${BASE}papers/explorer/`,
    topics: r.topics as TopicRef[],
  })),
  ...(catalog.software as any[]).map((e) => ({ kind: 'software' as const, label: e.name, url: e.url, topics: e.topics as TopicRef[] })),
  ...(catalog.databases as any[]).map((e) => ({ kind: 'database' as const, label: e.name, url: e.url, topics: e.topics as TopicRef[] })),
];

const KIND_LABEL: Record<Item['kind'], string> = { paper: 'Papers', software: 'Software', database: 'Databases' };

function CountPills({ c }: { c: Counts }) {
  return (
    <span class="th-pills">
      {c.paper > 0 && <span class="th-pill">{c.paper} papers</span>}
      {c.software > 0 && <span class="th-pill">{c.software} software</span>}
      {c.database > 0 && <span class="th-pill">{c.database} databases</span>}
      {c.dataset > 0 && <span class="th-pill">{c.dataset} datasets</span>}
    </span>
  );
}

function ThemeIndex() {
  return (
    <div class="th-index not-content">
      <ul class="th-theme-grid">
        {themes.map((t) => (
          <li class="th-theme-card" data-theme-card data-theme={t.slug}>
            <a class="th-theme-link" href={topicHref(BASE, t.slug)}>{t.label}</a>
            <div class="th-total">{t.counts.total} items</div>
            <CountPills c={t.counts} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TopicView({ node }: { node: Node }) {
  // Membership: a theme collects items whose ref.theme === slug; a tag, ref.slug === slug.
  const inScope = (it: Item) =>
    node.tier === 'theme' ? it.topics.some((r) => r.theme === node.slug) : it.topics.some((r) => r.slug === node.slug);
  const scoped = items.filter(inScope);
  const kinds: Item['kind'][] = ['paper', 'software', 'database'];
  const parentTheme = node.tier === 'tag' && node.theme ? bySlug.get(node.theme) : null;

  return (
    <div class="th-view not-content" data-theme={node.tier === 'theme' ? node.slug : node.theme ?? undefined}>
      <nav class="th-crumbs">
        <a href={`${BASE.replace(/\/$/, '')}/topics/`}>All themes</a>
        {parentTheme && <>{' / '}<a href={topicHref(BASE, parentTheme.slug)}>{parentTheme.label}</a></>}
      </nav>
      <h2 class="th-title caail-display">{node.label}</h2>
      <CountPills c={node.counts} />

      {node.tier === 'theme' && node.tags.length > 0 && (
        <ul class="th-subtags">
          {node.tags.map((s) => {
            const tag = bySlug.get(s)!;
            return <li><a class="th-subtag" href={topicHref(BASE, s)}>{tag.label} <span class="th-subcount">{tag.counts.total}</span></a></li>;
          })}
        </ul>
      )}

      {kinds.map((kind) => {
        const group = scoped.filter((it) => it.kind === kind);
        if (group.length === 0) return null;
        return (
          <section class="th-group">
            <h3 class="th-group-h">{KIND_LABEL[kind]} <span class="th-group-n">{group.length}</span></h3>
            <ul class="th-items">
              {group.map((it) => (
                <li><a class="th-item" href={it.url} target={it.url.startsWith('http') ? '_blank' : undefined} rel={it.url.startsWith('http') ? 'noopener noreferrer' : undefined}>{it.label}</a></li>
              ))}
            </ul>
          </section>
        );
      })}

      {node.counts.dataset > 0 && (
        <p class="th-datasets">
          {node.counts.dataset} tagged dataset row{node.counts.dataset === 1 ? '' : 's'} — browse them under{' '}
          <a href={`${BASE.replace(/\/$/, '')}/datasets/`}>Datasets</a>.
        </p>
      )}
    </div>
  );
}

export default function TopicHub() {
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(location.search).get('t');
    if (t) setSel(t);
  }, []);
  const node = sel ? bySlug.get(sel) ?? null : null;
  return node ? <TopicView node={node} /> : <ThemeIndex />;
}
