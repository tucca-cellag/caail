/**
 * generate-data.ts — build-time CLI entrypoint (`pnpm parse`).
 *
 * Composes buildPapersModel + computeCounts, validates the outputs, and
 * writes papers.json and counts.json to site/src/content/data/.
 *
 * DESIGN: the testable core (generateData) is a pure-ish function that
 * returns data and throws on failure — it never writes to the real output
 * directory unless explicitly passed that path, and it never calls
 * process.exit. CLI side-effects (file writes to the canonical dir,
 * console output, exit code) are guarded behind the isMain check so that
 * importing this module in tests is side-effect-free.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPapersModel } from './papers.js';
import { buildTaxonomyModel } from './taxonomy.js';
import { computeCounts } from './counts.js';
import { buildCatalogModel } from './catalog.js';
import { buildTalksModel, talkItemCount } from './talks.js';
import { buildPrimersModel } from './primers.js';
import { buildAwesomeListsModel } from './awesome-lists.js';
import { buildGraphModel } from './graph.js';
import { CitationCacheSchema, type CitationCache } from './citations.js';
import { buildMetricsModel } from './metrics.js';
import { buildRecentModel } from './recent.js';
import { buildTopicsModel, unresolvedTopicItems, catalogJoinKey } from './topics.js';
import { buildDatasetsModel } from './datasets-entries.js';
import { buildDatasetInventory } from './dataset-inventory.js';
import { writeLlmsFull } from './llms-full.js';
import { buildAgentApi, writeAgentApi, publishSkillDoc } from './agent-api.js';
import {
  PapersDataSchema,
  CountsSchema,
  CatalogSchema,
  TalksSchema,
  PrimersSchema,
  AwesomeListsSchema,
  GraphSchema,
  MetricsSchema,
  RecentSchema,
  TaxonomyDataSchema,
  TopicsDataSchema,
  DatasetsDataSchema,
  type Counts,
} from './types.js';

// ---------------------------------------------------------------------------
// Default output directory
// ---------------------------------------------------------------------------

/**
 * Absolute path to site/src/content/data/, resolved from this module's
 * location. The two `..` ascend parser/ → scripts/ → site/, then descend
 * into src/content/data/.
 */
export const DEFAULT_OUT_DIR: string = fileURLToPath(
  new URL('../../src/content/data/', import.meta.url),
);

/**
 * Where the agent-facing static API is emitted. Under `public/`, so Astro copies it
 * verbatim into the deploy and every endpoint is live at the same moment the site is.
 * A generated artifact like graph.json, so it is gitignored rather than committed:
 * committing ~1 MB of derived JSON on every corpus change would be pure churn, and the
 * canonical NDJSON in `site/db/ndjson/` is already the committed fallback.
 */
export const DEFAULT_API_DIR: string = fileURLToPath(
  new URL('../../public/api/', import.meta.url),
);

/**
 * The plugin's SKILL.md, republished at `public/setup.md` so the install prompt has a
 * short site URL. Single source of truth: the copy in `public/` is generated.
 */
export const SKILL_DOC_PATH: string = fileURLToPath(
  new URL('../../../plugin/skills/caail/SKILL.md', import.meta.url),
);

/**
 * Absolute path to the committed OpenAlex citation cache (parser input, not a
 * generated artifact). Refreshed by hand via `pnpm fetch:citations`.
 */
export const CITATION_CACHE_PATH: string = fileURLToPath(
  new URL('./citation-cache.json', import.meta.url),
);

/**
 * Read + validate the citation cache if it exists, else return null so the
 * graph is built with no citation edges. Keeps the parse step network-free.
 */
export function loadCitationCache(
  path: string = CITATION_CACHE_PATH,
): CitationCache | null {
  if (!existsSync(path)) return null;
  return CitationCacheSchema.parse(JSON.parse(readFileSync(path, 'utf-8')));
}

// ---------------------------------------------------------------------------
// Testable core
// ---------------------------------------------------------------------------

/**
 * Generate papers.json and counts.json in `outDir`.
 *
 * - Calls buildPapersModel() and computeCounts() (each validates internally).
 * - Re-validates with PapersDataSchema and CountsSchema before writing
 *   (belt-and-suspenders: the schemas are cheap and catch any drift).
 * - Creates outDir if it doesn't exist.
 * - Writes pretty-printed (2-space) JSON for both artifacts.
 * - Returns { counts, papersRefs } — does NOT write to the canonical
 *   src/content/data/ unless outDir defaults to DEFAULT_OUT_DIR.
 * - Throws on any error (schema violation, FS error); never calls process.exit.
 *
 * @param outDir  Directory to write into. Defaults to DEFAULT_OUT_DIR.
 */
export function generateData(
  outDir: string = DEFAULT_OUT_DIR,
  apiDir: string = DEFAULT_API_DIR,
): {
  counts: Counts;
  papersRefs: number;
  catalogEntries: number;
  talks: number;
  primers: number;
  graphNodes: number;
  graphEdges: number;
  recentEntries: number;
  taxonomyDefs: number;
  awesomeLists: number;
  apiFiles: number;
} {
  // Build and validate the papers model.
  const model = buildPapersModel();

  // Compute and validate the aggregate counts.
  const counts = computeCounts(model);

  // Build and validate the catalog (Software + Databases) and talks models.
  const catalog = buildCatalogModel();
  const talks = buildTalksModel();
  const primers = buildPrimersModel();

  // Build the Awesome Lists model (AwesomeLists.md + the committed GitHub-metrics
  // cache, folded in offline; absent cache ⇒ no metrics).
  const awesome = buildAwesomeListsModel();

  // Build and validate the paper network (shared-author + citation edges). The
  // citation cache is an optional committed input; absent ⇒ no citation edges.
  const graph = buildGraphModel(model, loadCitationCache());

  // Home page "Recently added" list, derived from git history. Empty (not an
  // error) when history is unavailable — see buildRecentModel.
  const recent = buildRecentModel();

  // Taxonomy.md row/column definitions for the explorer's hover/click popups.
  const taxonomy = buildTaxonomyModel();

  // Topic tree (theme→tag) folded from the committed topic NDJSON — drives the hub,
  // card chips, and filters. (Catalog/paper entries already carry their topic refs.)
  const topics = buildTopicsModel();

  // Curated dataset entries (featured atlases / GEMs / reference entries) folded from
  // the committed dataset_entries NDJSON — drives the dataset cards + chips and their
  // appearance as linkable items in the /topics/ hub.
  const datasets = buildDatasetsModel();

  // The `## Complete data inventory` rows — the per-study deposits. Built for the agent
  // API only, NOT folded into `datasets` above: three Preact islands import the site's
  // datasets.json, so these would be shipped to the browser for nothing.
  const inventory = buildDatasetInventory();

  // Metrics runs LAST of the model builders: its topic / license / citation panels are
  // rolled up from the catalog, topic and dataset-entry models above, so that a
  // dashboard figure and the hub it links to are literally the same object.
  const metrics = buildMetricsModel({ papers: model, catalog, topics, datasets });

  // Belt-and-suspenders: re-validate all before writing.
  PapersDataSchema.parse(model);
  CountsSchema.parse(counts);
  CatalogSchema.parse(catalog);
  TalksSchema.parse(talks);
  PrimersSchema.parse(primers);
  AwesomeListsSchema.parse(awesome);
  GraphSchema.parse(graph);
  MetricsSchema.parse(metrics);
  RecentSchema.parse(recent);
  TaxonomyDataSchema.parse(taxonomy);
  TopicsDataSchema.parse(topics);
  DatasetsDataSchema.parse(datasets);

  // No-drift guard: the homepage counts and the catalog/talks/graph/metrics
  // artifacts derive from the same canonical files, so their tallies must agree
  // exactly. A mismatch means a parser bug — fail the build loudly rather than
  // ship a stat that disagrees with the page it links to.
  assertCountsMatch('software', catalog.software.length, counts.software);
  assertCountsMatch('databases', catalog.databases.length, counts.databases);
  assertCountsMatch('talks', talkItemCount(talks), counts.talks);
  assertCountsMatch('graph nodes', graph.nodes.length, counts.papers);
  assertCountsMatch('metrics.library.papers', metrics.library.papers, counts.papers);
  assertCountsMatch('metrics.library.datasets', metrics.library.datasets, counts.datasets);
  assertCountsMatch('metrics.datasets.total', metrics.datasets.total, counts.datasets);
  assertCountsMatch(
    'datasets breakdown sum',
    metrics.datasets.speciesRows +
      metrics.datasets.referenceEntries +
      metrics.datasets.benchmarkEntries,
    metrics.datasets.total,
  );
  // The inventory rows the API serves are read from the DB NDJSON; `speciesRows` counts
  // the same rows straight out of the Markdown tables. They must agree exactly — a
  // mismatch means the DB and the canonical pages diverged, and shipping the endpoint
  // anyway would repeat #151 in the other direction (an agent under-reading the corpus).
  assertCountsMatch(
    'dataset inventory rows',
    inventory.inventory.length,
    metrics.datasets.speciesRows,
  );

  // The three cross-cutting axes must agree with the hubs they summarize. Each is
  // checked WITHIN its own universe — licenses cover catalog + dataset entries and
  // exclude papers; citations include papers; and counts.datasets (inventory rows
  // included) is NOT datasets.entries.length (curated entries only). Cross-asserting
  // any of those would be wrong, not stricter.
  assertCountsMatch('metrics.topics.themes', metrics.topics.themes, topics.themes.length);
  assertCountsMatch('metrics.topics.tags', metrics.topics.tags, topics.tags.length);
  assertCountsMatch(
    'metrics.topics.perTheme',
    metrics.topics.perTheme.length,
    topics.themes.length,
  );
  assertCountsMatch(
    'metrics.licenses.total',
    metrics.licenses.total,
    catalog.software.length + catalog.databases.length + datasets.entries.length,
  );
  assertCountsMatch(
    'license tier sum',
    metrics.licenses.tiers.reduce((n, t) => n + t.count, 0),
    metrics.licenses.total,
  );
  assertCountsMatch(
    'citation band sum',
    metrics.citations.bands.reduce((n, b) => n + b.count, 0),
    metrics.citations.withCount,
  );
  assertCountsMatch(
    'citation withCount split',
    metrics.citations.papersWithCount + metrics.citations.catalogWithCount,
    metrics.citations.withCount,
  );

  // Coverage guard: every matrix row (method) and column (area) must have a
  // non-empty Taxonomy.md definition, or the explorer popup would show a blank.
  // A miss means a row/column label drifted from its `### Heading` — fail the
  // build rather than ship an empty definition.
  const missingDefs = [
    ...model.methods,
    ...model.areas.map((a) => a.label),
  ].filter((label) => !taxonomy.definitions[label]?.trim());
  if (missingDefs.length > 0) {
    throw new Error(
      `generate-data: ${missingDefs.length} matrix label(s) have no Taxonomy.md ` +
        `definition: ${missingDefs.join(', ')}. Add a "### <label>" heading to ` +
        `Taxonomy.md (the heading text must match the matrix label exactly).`,
    );
  }

  // Topic-join guard: every catalog/paper/dataset-entry item tagged in item_topics must
  // resolve to a parsed site entry (dataset INVENTORY rows exempt — no site JSON). Catalog
  // resolution uses the FULL join key (type, url, normalized-name) — the same key
  // catalogTopicLookup uses — so a name that diverges between the parser and the NDJSON
  // fails the build here instead of silently losing that entry's topics.
  const paperIds = new Set(model.references.map((r) => `paper:${r.id}`));
  const catalogKeyList = [
    ...catalog.software.map((e) => catalogJoinKey('software', e.url, e.name)),
    ...catalog.databases.map((e) => catalogJoinKey('database', e.url, e.name)),
  ];
  const catalogKeys = new Set(catalogKeyList);
  // The topic join is by (type, url, normalized-name); if two entries collapse to the same
  // key (e.g. names differing only in a leading block-marker the name-normalizer strips),
  // one would silently steal the other's topics. Fail loud on any collision.
  if (catalogKeys.size !== catalogKeyList.length) {
    throw new Error(
      `generate-data: ${catalogKeyList.length - catalogKeys.size} catalog entr(ies) share a ` +
        `(type, url, name) topic-join key — two entries normalize identically. Disambiguate their names.`,
    );
  }
  const datasetEntryIds = new Set(datasets.entries.map((e) => e.id));
  const orphanTopics = unresolvedTopicItems(paperIds, catalogKeys, datasetEntryIds);
  if (orphanTopics.length > 0) {
    throw new Error(
      `generate-data: ${orphanTopics.length} topic tag(s) point at items absent from the site ` +
        `JSON: ${orphanTopics.slice(0, 8).join(', ')}. Re-run \`pnpm db:bootstrap\` or fix the tag.`,
    );
  }

  // Ensure the output directory exists.
  mkdirSync(outDir, { recursive: true });

  // Write papers.json.
  writeFileSync(
    join(outDir, 'papers.json'),
    JSON.stringify(model, null, 2) + '\n',
    'utf-8',
  );

  // Write counts.json.
  writeFileSync(
    join(outDir, 'counts.json'),
    JSON.stringify(counts, null, 2) + '\n',
    'utf-8',
  );

  // Write catalog.json.
  writeFileSync(
    join(outDir, 'catalog.json'),
    JSON.stringify(catalog, null, 2) + '\n',
    'utf-8',
  );

  // Write talks.json.
  writeFileSync(
    join(outDir, 'talks.json'),
    JSON.stringify(talks, null, 2) + '\n',
    'utf-8',
  );

  // Write primers.json.
  writeFileSync(
    join(outDir, 'primers.json'),
    JSON.stringify(primers, null, 2) + '\n',
    'utf-8',
  );

  // Write awesome-lists.json.
  writeFileSync(
    join(outDir, 'awesome-lists.json'),
    JSON.stringify(awesome, null, 2) + '\n',
    'utf-8',
  );

  // Write graph.json.
  writeFileSync(
    join(outDir, 'graph.json'),
    JSON.stringify(graph, null, 2) + '\n',
    'utf-8',
  );

  // Write metrics.json.
  writeFileSync(
    join(outDir, 'metrics.json'),
    JSON.stringify(metrics, null, 2) + '\n',
    'utf-8',
  );

  // Write recent.json.
  writeFileSync(
    join(outDir, 'recent.json'),
    JSON.stringify(recent, null, 2) + '\n',
    'utf-8',
  );

  // Write taxonomy.json.
  writeFileSync(
    join(outDir, 'taxonomy.json'),
    JSON.stringify(taxonomy, null, 2) + '\n',
    'utf-8',
  );

  // Write topics.json (theme→tag tree + counts).
  writeFileSync(
    join(outDir, 'topics.json'),
    JSON.stringify(topics, null, 2) + '\n',
    'utf-8',
  );

  // Write datasets.json (curated dataset entries + topic refs).
  writeFileSync(
    join(outDir, 'datasets.json'),
    JSON.stringify(datasets, null, 2) + '\n',
    'utf-8',
  );

  // Emit the agent-facing static API under public/, from the same validated models the
  // site renders, so the two can't disagree about the corpus.
  const apiFiles = buildAgentApi({
    papers: model,
    catalog,
    datasets,
    inventory,
    topics,
    taxonomy,
  });
  writeAgentApi(apiFiles, apiDir);
  publishSkillDoc(SKILL_DOC_PATH, join(apiDir, '..'));

  return {
    counts,
    papersRefs: model.references.length,
    catalogEntries: catalog.software.length + catalog.databases.length,
    talks: talkItemCount(talks),
    primers: primers.primers.length,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
    recentEntries: recent.length,
    apiFiles: apiFiles.length,
    taxonomyDefs: Object.keys(taxonomy.definitions).length,
    awesomeLists: awesome.groups.reduce((n, g) => n + g.items.length, 0),
  };
}

/** Throw a descriptive error when a catalog/talks tally disagrees with counts.json. */
function assertCountsMatch(label: string, derived: number, expected: number): void {
  if (derived !== expected) {
    throw new Error(
      `generate-data: ${label} count drift — catalog/talks parser found ${derived} ` +
        `but counts.json reports ${expected}. These must agree (same source files).`,
    );
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint — guarded so tests never trigger side effects
// ---------------------------------------------------------------------------

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

if (isMain) {
  try {
    const {
      counts,
      papersRefs,
      catalogEntries,
      talks,
      primers,
      graphNodes,
      graphEdges,
      recentEntries,
      taxonomyDefs,
      awesomeLists,
    } = generateData();
    // Full-text agent index (public/llms-full.txt) — generated alongside the
    // JSON, but written to public/ rather than the data dir, so it lives in the
    // CLI block rather than the side-effect-free generateData() core.
    const llmsBytes = writeLlmsFull();
    if (llmsBytes <= 0) throw new Error('parse: llms-full.txt is empty');
    // eslint-disable-next-line no-console
    console.log(
      `parse: wrote papers.json (${papersRefs} references), counts.json, ` +
        `catalog.json (${catalogEntries} entries), talks.json (${talks} talks), ` +
        `primers.json (${primers} primers), ` +
        `awesome-lists.json (${awesomeLists} lists), ` +
        `graph.json (${graphNodes} nodes / ${graphEdges} edges), metrics.json, ` +
        `recent.json (${recentEntries} entries), ` +
        `taxonomy.json (${taxonomyDefs} definitions), ` +
        `and llms-full.txt (${llmsBytes} bytes)`,
    );
    // eslint-disable-next-line no-console
    console.log('counts:', counts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      'parse: FAILED —',
      err instanceof Error ? err.message : String(err),
    );
    process.exitCode = 1;
  }
}
