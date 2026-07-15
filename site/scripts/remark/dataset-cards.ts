/**
 * dataset-cards.ts — a remark transform that wraps each curated `### …` dataset entry
 * (featured atlas / GEM / reference entry) on a `Datasets/<page>.md` page into a
 * `<article class="ds-card …">` and appends its topic chips, so those entries render
 * as distinct, tagged cards instead of a run of headings + prose. Inventory tables and
 * narrative sections are left untouched.
 *
 * The join is POSITIONAL: the Nth non-inventory H3 on the page ↔ the Nth datasets.json
 * entry for that page (both are in document order). This mirrors the emitter's splice
 * and needs no fragile name/anchor matching. The card carries the entry's `ds-`-prefixed
 * anchor as its id (the hub's #link target); it can't collide with the H3's own slug id.
 *
 * Card + chips are emitted as raw-HTML mdast nodes (open article, real prose nodes, chip
 * `<ul>`, close article), which Astro's markdown pipeline reparses and nests correctly.
 * Chips reuse the `.topic-chips`/`.topic-chip` classes (+ `.not-content`, the #67 trap).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Root } from 'mdast';
import { toString as mdastToString } from 'mdast-util-to-string';

export interface DatasetCardEntry {
  name: string;
  kind: 'atlas' | 'gem' | 'other';
  anchor: string; // 'ds-…' — the card element id
  topics: Array<{ slug: string; label: string; theme: string }>;
}

const DATA_PATH = fileURLToPath(new URL('../../src/content/data/datasets.json', import.meta.url));
const BASE = '/caail';
const INVENTORY = 'Complete data inventory';

/** HTML-escape a string for safe interpolation into a raw-HTML node. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Chip `<ul>` markup mirroring TopicChips.tsx; '' when the entry has no topics. */
function chipsHtml(entry: DatasetCardEntry): string {
  if (entry.topics.length === 0) return '';
  const lis = entry.topics
    .map(
      (t) =>
        `<li><a class="topic-chip" data-theme="${esc(t.theme)}" href="${BASE}/topics/?t=${esc(t.slug)}">${esc(t.label)}</a></li>`,
    )
    .join('');
  return `<ul class="topic-chips not-content" aria-label="Topics">${lis}</ul>`;
}

/**
 * Load datasets.json grouped by page (document order preserved), for the config
 * wrapper. Returns an empty map when the build artifact is absent (e.g. a dev run
 * before `pnpm parse`), so the transform is then a no-op.
 */
export function loadDatasetEntriesByPage(): Map<string, DatasetCardEntry[]> {
  const out = new Map<string, DatasetCardEntry[]>();
  if (!existsSync(DATA_PATH)) return out;
  const { entries } = JSON.parse(readFileSync(DATA_PATH, 'utf-8')) as {
    entries: Array<DatasetCardEntry & { page: string }>;
  };
  for (const e of entries) {
    const list = out.get(e.page) ?? out.set(e.page, []).get(e.page)!;
    list.push({ name: e.name, kind: e.kind, anchor: e.anchor, topics: e.topics });
  }
  return out;
}

/**
 * The transform. `sourcePath` is the repo-relative path (e.g. "Datasets/Chicken.md");
 * `entriesByPage` is the grouped datasets.json. A non-Datasets page, or a page with no
 * curated entries, is left untouched.
 */
export function datasetCards(options: {
  sourcePath: string;
  entriesByPage: Map<string, DatasetCardEntry[]>;
}) {
  return (tree: Root) => {
    if (!options.sourcePath.startsWith('Datasets/')) return;
    const page = options.sourcePath.slice('Datasets/'.length).replace(/\.md$/i, '');
    const list = options.entriesByPage.get(page);
    if (!list || list.length === 0) return;

    const kids = tree.children as any[];
    // Positional join (Nth non-inventory H3 ↔ Nth datasets.json entry). If the source H3
    // count and this page's entry-list length disagree (e.g. a stale datasets.json build
    // artifact), skip the whole page rather than wrap content under the wrong card / assign
    // the wrong anchor. db:verify guards the committed DB↔Markdown; this protects the render.
    let precheckSection = '';
    let h3Count = 0;
    for (const n of kids) {
      if (n.type === 'heading' && n.depth === 2) { precheckSection = mdastToString(n).trim(); continue; }
      if (n.type === 'heading' && n.depth === 3 && precheckSection !== INVENTORY) h3Count += 1;
    }
    if (h3Count !== list.length) return;

    const out: any[] = [];
    let section = '';
    let idx = 0;
    for (let i = 0; i < kids.length; ) {
      const n = kids[i];
      if (n.type === 'heading' && n.depth === 2) { section = mdastToString(n).trim(); out.push(n); i++; continue; }
      if (n.type === 'heading' && n.depth === 3 && section !== INVENTORY) {
        const entry = list[idx++];
        if (!entry) { out.push(n); i++; continue; } // more H3s than entries: leave as-is
        out.push({ type: 'html', value: `<article class="ds-card ds-card--${entry.kind}" id="${entry.anchor}">` });
        out.push(n); i++;
        // Pull body blocks up to the next H2/H3 into the card. Nested H4+ sub-sections (e.g.
        // the Arc atlas umbrella's Tahoe-100M / scBaseCount) belong INSIDE the parent card;
        // stopping at any heading would leave them stranded after the closing </article>.
        while (i < kids.length && !(kids[i].type === 'heading' && kids[i].depth <= 3)) { out.push(kids[i]); i++; }
        const chips = chipsHtml(entry);
        if (chips) out.push({ type: 'html', value: chips });
        out.push({ type: 'html', value: '</article>' });
        continue;
      }
      out.push(n); i++;
    }
    tree.children = out;
  };
}
