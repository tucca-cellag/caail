/**
 * metrics.ts — builds metrics.json for the "By the Numbers" dashboard (M6).
 *
 * Signals, all derived at build time (no committed history, no workflow):
 *   - library:  the counts.json values (single source of truth via computeCounts)
 *   - matrix:   Papers.md matrix coverage + per-area / per-method paper counts
 *   - species:  per-species `## Complete data inventory` row counts (the
 *               "where help is wanted" recruitment signal; stubs → 0 rows)
 *   - datasets: the catalogued-dataset total + breakdown by source-page shape
 *               (via datasets.ts; total === counts.datasets)
 *   - topics:   the subject axis rolled up (themes/tags/assignments + per-theme items)
 *   - licenses: the 4-tier triage over catalog + curated dataset entries
 *   - citations: OpenAlex counts banded over papers + catalog + dataset entries
 *   - momentum: a git snapshot (last-modified + 30-day commit counts), guarded
 *               so a shallow clone degrades to null rather than failing the build.
 *
 * The last three deliberately span DIFFERENT universes and must not be cross-asserted:
 * licenses exclude papers (papers carry no license by design); citations include them.
 * The tier and band vocabularies are imported from src/lib rather than redefined, so a
 * dashboard panel and its hub (/licenses/, /citations/) cannot drift apart.
 *
 * Reads the canonical files; never mutates them.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { AREAS } from './areas.js';
import { computeCounts } from './counts.js';
import { lastAdditionDate } from './recent.js';
import {
  SPECIES_PAGES,
  inventoryRowCount,
  computeDatasetBreakdown,
} from './datasets.js';
import { topicAssignmentStats } from './topics.js';
import { LICENSE_TIERS } from '../../src/lib/licenses.js';
import { CITATION_BANDS, BAND_META, citationBand } from '../../src/lib/citation-bands.js';
import {
  MetricsSchema,
  type Catalog,
  type DatasetsData,
  type Metrics,
  type MetricsSpecies,
  type PapersData,
  type TopicsData,
} from './types.js';

/** Round to one decimal, the same precision the matrix coverage figure uses. */
const share = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 1000) / 10);

/** parser/ → scripts/ → site/ → repo root. */
const DEFAULT_REPO_ROOT: string = fileURLToPath(new URL('../../../', import.meta.url));

// ---------------------------------------------------------------------------
// Matrix coverage
// ---------------------------------------------------------------------------

function buildMatrix(model: PapersData) {
  const methods = model.methods;
  const totalCells = methods.length * AREAS.length;
  const filledCells = model.cells.filter((c) => c.refIds.length > 0).length;

  // distinct refs per area key / per method label
  const perArea = AREAS.map(({ key, label }) => {
    const refs = new Set<number>();
    for (const c of model.cells) {
      if (c.area === key) c.refIds.forEach((id) => refs.add(id));
    }
    return { key, label, papers: refs.size };
  });

  const perMethod = methods.map((method) => {
    const refs = new Set<number>();
    for (const c of model.cells) {
      if (c.method === method) c.refIds.forEach((id) => refs.add(id));
    }
    return { method, papers: refs.size };
  });

  const coveragePct =
    totalCells === 0 ? 0 : Math.round((filledCells / totalCells) * 1000) / 10;

  return { totalCells, filledCells, coveragePct, perArea, perMethod };
}

// ---------------------------------------------------------------------------
// Per-species dataset inventory
// ---------------------------------------------------------------------------

/**
 * Per-species inventory signal for the recruitment chart. Delegates the row
 * count to `datasets.inventoryRowCount` (the shared inventory-table counter);
 * a stub page (placeholder note, no table) or a missing page yields
 * `{ 0, true }`.
 */
export function speciesInventory(repoRoot: string, species: string): MetricsSpecies {
  const inventoryRows = inventoryRowCount(repoRoot, species);
  return { species, inventoryRows, isStub: inventoryRows === 0 };
}

// ---------------------------------------------------------------------------
// Subject axis (topics)
// ---------------------------------------------------------------------------

/**
 * Roll the topic tree up for the dashboard. Per-theme item counts are taken straight
 * off `topics.json` nodes — `buildTopicsModel` already dedupes a theme's members across
 * its child tags, so recomputing here would risk a second, subtly different answer.
 */
function buildTopics(topics: TopicsData): Metrics['topics'] {
  const { assignments, taggedItems, taggableItems } = topicAssignmentStats();
  return {
    themes: topics.themes.length,
    tags: topics.tags.length,
    assignments,
    taggedItems,
    taggableItems,
    perTheme: topics.themes.map((t) => {
      const bySlug = new Map(topics.tags.map((g) => [g.slug, g]));
      return {
        slug: t.slug,
        label: t.label,
        areaKey: t.areaKey,
        tags: t.tags.length,
        items: t.counts.total,
        // Ordered by size so the dashboard can show the biggest sub-topics first.
        tagList: t.tags
          .map((slug) => bySlug.get(slug))
          .filter((g): g is NonNullable<typeof g> => g != null)
          .map((g) => ({ slug: g.slug, label: g.label, items: g.counts.total }))
          .sort((a, b) => b.items - a.items),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Licenses and citations
// ---------------------------------------------------------------------------

/** The license/citation universe for non-paper content: catalog + curated dataset entries. */
function licensableItems(catalog: Catalog, datasets: DatasetsData) {
  return [...catalog.software, ...catalog.databases, ...datasets.entries];
}

/**
 * Tier tallies over catalog + dataset entries. The tier is already resolved onto each
 * entry at parse time (licenses.ts), so this only groups; it does not re-classify.
 */
function buildLicenses(
  catalog: Catalog,
  datasets: DatasetsData,
  topics: TopicsData,
): Metrics['licenses'] {
  const items = licensableItems(catalog, datasets);
  const total = items.length;
  return {
    total,
    tiers: LICENSE_TIERS.map((tier) => {
      const count = items.filter((i) => i.tier === tier).length;
      return { tier, count, pct: share(count, total) };
    }),
    // Same population as /licenses/?tier=&t= (papers excluded, they carry no license).
    bySubject: buildSubjectGrid(topics, items, LICENSE_TIERS, (i) => i.tier ?? 'unknown'),
  };
}

/**
 * Band tallies over every item that HAS a count. Items without one are excluded rather
 * than folded into `under10` — no count means "not indexed by OpenAlex", which is not a
 * citation level. `pct` is therefore a share of `withCount`, not of the library.
 */
/**
 * A subject grid: one row per theme, each followed by its fine tags, with counts split
 * across whatever categorical axis is passed in (license tiers, citation bands, …).
 *
 * Generic on purpose. Licensing-by-subject and citations-by-subject are the same shape
 * over different populations, and writing them twice is how the two would drift.
 *
 * Two properties to keep in mind when reading a grid built here:
 *   - Rows OVERLAP. An item tagged with several themes is counted under each, and a theme
 *     row also counts items tagged only at theme level, so tag rows never sum to their
 *     theme row.
 *   - The population must match what the corresponding filtered hub lists, because every
 *     cell links there. Callers pass exactly that population.
 */
interface SubjectItem {
  topics?: Array<{ slug: string; theme: string }>;
}

function buildSubjectGrid<T extends SubjectItem>(
  topics: TopicsData,
  items: T[],
  keys: readonly string[],
  classify: (item: T) => string | null,
): Metrics['licenses']['bySubject'] {
  const tagsBySlug = new Map(topics.tags.map((t) => [t.slug, t]));
  const cellsFor = (rows: T[]) =>
    keys.map((key) => ({ key, count: rows.filter((i) => classify(i) === key).length }));

  const rowFor = (
    slug: string,
    label: string,
    kind: 'theme' | 'tag',
    theme: string | null,
    match: (r: { slug: string; theme: string }) => boolean,
  ) => {
    const inScope = items.filter((i) => (i.topics ?? []).some(match));
    return { slug, label, kind, theme, total: inScope.length, cells: cellsFor(inScope) };
  };

  return topics.themes.flatMap((theme) => {
    const themeRow = rowFor(theme.slug, theme.label, 'theme', null, (r) =>
      r.theme === theme.slug || r.slug === theme.slug,
    );
    const tagRows = theme.tags
      .map((slug) => tagsBySlug.get(slug))
      .filter((t): t is NonNullable<typeof t> => t != null)
      .map((t) => rowFor(t.slug, t.label, 'tag', theme.slug, (r) => r.slug === t.slug))
      .sort((a, b) => b.total - a.total);
    return [themeRow, ...tagRows];
  });
}

/** Every item carrying a citation count — the population /citations/?band=&t= lists. */
function countedItems(papers: PapersData, catalog: Catalog, datasets: DatasetsData) {
  return [
    ...papers.references
      .filter((r) => r.citedByOpenAlex != null)
      .map((r) => ({ count: r.citedByOpenAlex as number, topics: (r.topics ?? []) as any[] })),
    ...licensableItems(catalog, datasets)
      .filter((i) => i.citationCount != null)
      .map((i) => ({ count: i.citationCount as number, topics: (i.topics ?? []) as any[] })),
  ];
}

function buildCitations(
  papers: PapersData,
  catalog: Catalog,
  datasets: DatasetsData,
  topics: TopicsData,
): Metrics['citations'] {
  const paperCounts = papers.references
    .map((r) => r.citedByOpenAlex)
    .filter((n): n is number => n != null);
  const items = licensableItems(catalog, datasets);
  const itemCounts = items
    .map((i) => i.citationCount)
    .filter((n): n is number => n != null);

  const all = [...paperCounts, ...itemCounts];
  const withCount = all.length;

  return {
    withCount,
    papersWithCount: paperCounts.length,
    papersTotal: papers.references.length,
    catalogWithCount: itemCounts.length,
    catalogTotal: items.length,
    aggregated: items.filter((i) => (i.citationSources ?? 1) > 1).length,
    bands: CITATION_BANDS.map((band) => {
      const count = all.filter((n) => citationBand(n) === band).length;
      return { band, label: BAND_META[band].label, count, pct: share(count, withCount) };
    }),
    bySubject: buildSubjectGrid(
      topics,
      countedItems(papers, catalog, datasets),
      CITATION_BANDS,
      (i) => citationBand(i.count),
    ),
  };
}

// ---------------------------------------------------------------------------
// Momentum (git snapshot, guarded)
// ---------------------------------------------------------------------------

function git(repoRoot: string, args: string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf-8' }).trim();
}

function computeMomentum(repoRoot: string): Metrics['momentum'] {
  try {
    // "Last updated" is the newest *addition* of that kind — the same selection the
    // home page "Recently added" list uses (lastAdditionDate), so the two panels
    // tell one story instead of diverging on a fix/refactor/merge commit.
    const commits30d = (path: string): number => {
      const out = git(repoRoot, ['log', '--no-merges', '--since=30.days', '--format=%H', '--', path]);
      return out ? out.split('\n').filter(Boolean).length : 0;
    };
    return {
      papersLastModified: lastAdditionDate('Paper', repoRoot),
      datasetsLastModified: lastAdditionDate('Dataset', repoRoot),
      papersCommits30d: commits30d('Papers.md'),
      datasetsCommits30d: commits30d('Datasets'),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/** The already-built models metrics derives from. */
export interface MetricsInputs {
  papers: PapersData;
  catalog: Catalog;
  topics: TopicsData;
  datasets: DatasetsData;
}

/**
 * Build the metrics.json model from already-built models.
 *
 * Takes the catalog / topics / dataset-entry models rather than rebuilding them, so
 * every dashboard figure is the same object the corresponding hub renders. That means
 * `buildMetricsModel` must run AFTER those builders in generate-data.ts.
 *
 * @param inputs    Validated papers / catalog / topics / datasets models
 * @param repoRoot  Repository root (defaults to the canonical root). Override
 *                  in tests to point at a fixture directory.
 * @param now       ISO build timestamp (injectable for deterministic tests).
 */
export function buildMetricsModel(
  inputs: MetricsInputs,
  repoRoot: string = DEFAULT_REPO_ROOT,
  now: string = new Date().toISOString(),
): Metrics {
  const { papers, catalog, topics, datasets } = inputs;
  const { total, speciesRows, curatedEntries, referenceEntries, benchmarkEntries } =
    computeDatasetBreakdown(repoRoot);

  const metrics: Metrics = {
    library: computeCounts(papers, repoRoot),
    matrix: buildMatrix(papers),
    species: SPECIES_PAGES.map((s) => speciesInventory(repoRoot, s)),
    datasets: { total, speciesRows, curatedEntries, referenceEntries, benchmarkEntries },
    topics: buildTopics(topics),
    licenses: buildLicenses(catalog, datasets, topics),
    citations: buildCitations(papers, catalog, datasets, topics),
    momentum: computeMomentum(repoRoot),
    generatedAt: now,
  };
  return MetricsSchema.parse(metrics);
}
