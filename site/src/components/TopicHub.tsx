/** @jsxImportSource preact */
import '../styles/topic-hub.css';
import { useEffect, useState } from 'preact/hooks';
import topicsData from '../content/data/topics.json';
import catalog from '../content/data/catalog.json';
import papers from '../content/data/papers.json';
import datasets from '../content/data/datasets.json';
import { topicHref } from '../lib/topic-chips';
import HubFilterBar from './HubFilterBar';
import { readSecondary, matchesTier, matchesBand, type Secondary } from '../lib/hub-filters';
import { chipStyle } from '../lib/theme-colors';
import { curatorFor, curatorCoverage } from '../lib/topic-curators';

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

// Unified, clickable content items. Curated dataset ENTRIES (atlases/GEMs/reference)
// are linkable — an external home if it has one, else its in-page card anchor on the
// species page. Dataset INVENTORY rows have no site JSON and stay count-only (below).
type Item = {
  kind: 'paper' | 'software' | 'database' | 'dataset';
  label: string;
  url: string;
  topics: TopicRef[];
  /** null for papers, which carry no license by design */
  tier: string | null;
  citationCount: number | null;
};
const items: Item[] = [
  ...(papers.references as any[]).filter((r) => r.topics?.length).map((r) => ({
    kind: 'paper' as const,
    label: `${r.authorsText}${r.year != null ? ` (${r.year})` : ''}${r.title ? `. ${r.title}` : ''}`,
    url: r.doi ? `https://doi.org/${r.doi}` : `${BASE}papers/explorer/`,
    topics: r.topics as TopicRef[],
    tier: null,
    citationCount: (r.citedByOpenAlex as number | null) ?? null,
  })),
  ...(catalog.software as any[]).map((e) => ({ kind: 'software' as const, label: e.name, url: e.url, topics: e.topics as TopicRef[], tier: (e.tier as string) ?? null, citationCount: e.citationCount ?? null })),
  ...(catalog.databases as any[]).map((e) => ({ kind: 'database' as const, label: e.name, url: e.url, topics: e.topics as TopicRef[], tier: (e.tier as string) ?? null, citationCount: e.citationCount ?? null })),
  ...(datasets.entries as any[]).map((e) => ({
    kind: 'dataset' as const,
    label: e.name,
    url: e.url ?? `${BASE}datasets/${String(e.page).toLowerCase()}/#${e.anchor}`,
    topics: e.topics as TopicRef[],
    tier: (e.tier as string) ?? null,
    citationCount: e.citationCount ?? null,
  })),
];

const KIND_LABEL: Record<Item['kind'], string> = { paper: 'Papers', software: 'Software', database: 'Databases', dataset: 'Datasets' };

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

/**
 * Full attribution for a theme's lead: name, affiliation, and the ORCID where there is
 * one. This is the surface the index card's short form defers to, and it is the only place
 * a reader can see who holds an area in enough detail to contact or credit them.
 *
 * The ORCID is the point rather than decoration. A lead is being offered academic credit
 * for an area, and a name with no persistent identifier is credit that does not survive
 * the person changing institution.
 *
 * Renders nothing when nobody holds the theme. That is the one place an omission is right:
 * the index and the recruitment ask already carry the vacancy, and repeating "open" under
 * the title of the page you just opened adds nothing.
 */
function LeadFull({ slug }: { slug: string }) {
  const c = curatorFor(slug);
  if (!c) return null;
  return (
    <p class="th-lead-full">
      <span class="th-lead-role">Lead</span>
      {c.url ? <a href={c.url} rel="noopener noreferrer" target="_blank">{c.name}</a> : c.name}
      <span class="th-lead-affil">{c.affiliation}</span>
    </p>
  );
}

/**
 * The lead for a theme, or the open state.
 *
 * Rendered on every card rather than only where someone holds it: an omitted line would
 * hide the ask on exactly the themes that need one. Kept to a name here (no affiliation,
 * no link) because this is a dense index card; the theme's own view carries the full
 * attribution, via LeadFull above.
 */
function LeadLine({ slug }: { slug: string }) {
  const c = curatorFor(slug);
  return (
    <p class="th-lead" data-open={c ? undefined : 'true'}>
      <span class="th-lead-role">Lead</span> {c ? c.name : 'open'}
    </p>
  );
}

function ThemeIndex() {
  // Derived, never typed: the sentence has to move the moment a theme is taken.
  const coverage = curatorCoverage();
  return (
    <div class="th-index not-content">
      <ul class="th-theme-grid">
        {themes.map((t) => (
          <li class="th-theme-card" data-theme-card data-theme={t.slug} style={chipStyle(t.slug)}>
            <a class="th-theme-link" href={topicHref(BASE, t.slug)}>{t.label}</a>
            <div class="th-total">{t.counts.total} items</div>
            <CountPills c={t.counts} />
            <LeadLine slug={t.slug} />
          </li>
        ))}
      </ul>
      {/* Same ask as the homepage band, same constraint on it: CAAIL-15 has not settled
          what a lead commits to, so the copy says so instead of inventing it, and names
          the one limit that must not be left ambiguous while placements are under
          re-verification. Wording kept in step with TopicsBand.astro deliberately. */}
      <aside class="th-recruit" aria-label="Topic leads">
        <p class="th-recruit-lede">
          {coverage.open} of the {coverage.total} themes have no lead.
        </p>
        <p class="th-recruit-body">
          A lead is a point of contact for one area, not a guarantee that every entry in it
          is right. What the role commits to is still being worked out, and we would rather
          settle that with the people who might take it than hand them a finished job
          description. If you work in one of these areas,{' '}
          <a href={`${BASE.replace(/\/$/, '')}/community/`}>get in touch</a>.
        </p>
      </aside>
    </div>
  );
}

function TopicView({ node, sec }: { node: Node; sec: Secondary }) {
  // Membership: a theme collects items whose ref.theme === slug; a tag, ref.slug === slug.
  const inScope = (it: Item) =>
    node.tier === 'theme' ? it.topics.some((r) => r.theme === node.slug) : it.topics.some((r) => r.slug === node.slug);
  const narrowed = sec.tier !== null || sec.band !== null;
  const scoped = items.filter(
    (it) => inScope(it) && matchesTier(it.tier, sec.tier) && matchesBand(it.citationCount, sec.band),
  );
  const kinds: Item['kind'][] = ['paper', 'software', 'database', 'dataset'];
  const parentTheme = node.tier === 'tag' && node.theme ? bySlug.get(node.theme) : null;
  // Inventory rows = the tagged datasets NOT shown as linkable curated entries. This
  // subtraction is only valid against the UNFILTERED scope: with a secondary filter on,
  // `scoped` is smaller for reasons unrelated to linkability, which would overstate the
  // remainder. Inventory rows carry no tier or citation count of their own, so there is
  // no honest filtered figure — suppress the line instead of showing a wrong one.
  const inventoryRows = narrowed
    ? 0
    : node.counts.dataset - scoped.filter((it) => it.kind === 'dataset').length;

  return (
    <div class="th-view not-content" data-theme={node.tier === 'theme' ? node.slug : node.theme ?? undefined} style={chipStyle(node.slug)}>
      <nav class="th-crumbs">
        <a href={`${BASE.replace(/\/$/, '')}/topics/`}>All themes</a>
        {parentTheme && <>{' / '}<a href={topicHref(BASE, parentTheme.slug)}>{parentTheme.label}</a></>}
      </nav>
      <h2 class="th-title caail-display">{node.label}</h2>
      {node.tier === 'theme' && <LeadFull slug={node.slug} />}
      {!narrowed && <CountPills c={node.counts} />}
      <HubFilterBar
        base={BASE}
        path="topics"
        active={{ tier: sec.tier, band: sec.band }}
        count={scoped.length}
        noun="items in this topic"
      />

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

      {inventoryRows > 0 && (
        <p class="th-datasets">
          {inventoryRows} more tagged dataset row{inventoryRows === 1 ? '' : 's'} in the species inventories. Browse them under{' '}
          <a href={`${BASE.replace(/\/$/, '')}/datasets/`}>Datasets</a>.
        </p>
      )}
    </div>
  );
}

export default function TopicHub() {
  const [sel, setSel] = useState<string | null>(null);
  const [sec, setSec] = useState<Secondary>({ t: null, tier: null, band: null });
  useEffect(() => {
    const parsed = readSecondary(location.search);
    if (parsed.t) setSel(parsed.t);
    setSec(parsed);
  }, []);
  const node = sel ? bySlug.get(sel) ?? null : null;
  return node ? <TopicView node={node} sec={sec} /> : <ThemeIndex />;
}
