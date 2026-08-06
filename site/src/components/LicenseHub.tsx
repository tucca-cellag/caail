/** @jsxImportSource preact */
/**
 * LicenseHub — the /licenses/ cross-content hub (mirrors TopicHub). A 4-tier index
 * (permissive / copyleft / restricted / unknown) → a per-tier list of every Software,
 * Databases, and Dataset entry at that tier, param-routed via `?tier=`. The card corner
 * badges link here. Reads catalog.json + datasets.json directly (client-side grouping),
 * so no extra build artifact. Papers carry no license and are excluded.
 *
 * License tiers are a coarse TRIAGE signal, not verified terms — verify at the source.
 */
import '../styles/license-hub.css';
import { useEffect, useState } from 'preact/hooks';
import catalog from '../content/data/catalog.json';
import datasets from '../content/data/datasets.json';
import { LICENSE_TIERS, TIER_META, type LicenseTier } from '../lib/licenses';
import HubFilterBar from './HubFilterBar';
import {
  readSecondary,
  matchesTopic,
  matchesBand,
  type Secondary,
  type TopicRef,
} from '../lib/hub-filters';

const BASE = import.meta.env.BASE_URL;
const hub = (tier: LicenseTier) => `${BASE.replace(/\/$/, '')}/licenses/?tier=${tier}`;

type Item = {
  kind: 'software' | 'database' | 'dataset';
  label: string;
  url: string;
  tier: LicenseTier;
  license: string | null;
  topics: TopicRef[];
  citationCount: number | null;
};

const items: Item[] = [
  ...(catalog.software as any[]).map((e) => ({ kind: 'software' as const, label: e.name, url: e.url, tier: e.tier as LicenseTier, license: e.license, topics: (e.topics ?? []) as TopicRef[], citationCount: e.citationCount ?? null })),
  ...(catalog.databases as any[]).map((e) => ({ kind: 'database' as const, label: e.name, url: e.url, tier: e.tier as LicenseTier, license: e.license, topics: (e.topics ?? []) as TopicRef[], citationCount: e.citationCount ?? null })),
  ...(datasets.entries as any[]).map((e) => ({
    kind: 'dataset' as const,
    label: e.name,
    url: e.url ?? `${BASE}datasets/${String(e.page).toLowerCase()}/#${e.anchor}`,
    tier: e.tier as LicenseTier,
    license: e.license,
    topics: (e.topics ?? []) as TopicRef[],
    citationCount: e.citationCount ?? null,
  })),
];

const KIND_LABEL: Record<Item['kind'], string> = { software: 'Software', database: 'Databases', dataset: 'Datasets' };
const countAt = (tier: LicenseTier) => items.filter((it) => it.tier === tier).length;

function TierIndex() {
  return (
    <div class="lh-index not-content">
      <p class="lh-disclaimer">
        A coarse triage signal (auto-detected or curator-supplied), <strong>not</strong> verified terms. Always
        confirm the license at the source before relying on it, especially for commercial use.
      </p>
      <ul class="lh-tier-grid">
        {LICENSE_TIERS.map((t) => (
          <li class="lh-tier-card" data-tier={t}>
            <a class="lh-tier-link" href={hub(t)}>{TIER_META[t].label}</a>
            <div class="lh-total">{countAt(t)} resources</div>
            <p class="lh-blurb">{TIER_META[t].blurb}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TierView({ tier, sec }: { tier: LicenseTier; sec: Secondary }) {
  const scoped = items.filter(
    (it) =>
      it.tier === tier && matchesTopic(it.topics, sec.t) && matchesBand(it.citationCount, sec.band),
  );
  const kinds: Item['kind'][] = ['software', 'database', 'dataset'];
  return (
    <div class="lh-view not-content" data-tier={tier}>
      <nav class="lh-crumbs"><a href={`${BASE.replace(/\/$/, '')}/licenses/`}>All tiers</a></nav>
      <h2 class="lh-title caail-display">{TIER_META[tier].label}</h2>
      <p class="lh-blurb">{TIER_META[tier].blurb}</p>
      <HubFilterBar
        base={BASE}
        path="licenses"
        active={{ t: sec.t, band: sec.band }}
        count={scoped.length}
        noun="resources at this tier"
      />
      {scoped.length === 0 ? (
        <p class="lh-empty">No resources at this tier.</p>
      ) : (
        kinds.map((kind) => {
          const group = scoped.filter((it) => it.kind === kind);
          if (group.length === 0) return null;
          return (
            <section class="lh-group">
              <h3 class="lh-group-h">{KIND_LABEL[kind]} <span class="lh-group-n">{group.length}</span></h3>
              <ul class="lh-items">
                {group.map((it) => (
                  <li>
                    <a class="lh-item" href={it.url} target={it.url.startsWith('http') ? '_blank' : undefined} rel={it.url.startsWith('http') ? 'noopener noreferrer' : undefined}>
                      {it.label}
                      {it.license && <span class="lh-lic">{it.license}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

export default function LicenseHub() {
  const [sel, setSel] = useState<LicenseTier | null>(null);
  const [sec, setSec] = useState<Secondary>({ t: null, tier: null, band: null });
  useEffect(() => {
    const parsed = readSecondary(location.search);
    if (parsed.tier) setSel(parsed.tier);
    setSec(parsed);
  }, []);
  return sel ? <TierView tier={sel} sec={sec} /> : <TierIndex />;
}
