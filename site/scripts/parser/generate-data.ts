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
import { buildCorrectionForm } from './correction-form.js';
import { verifyContributeForms } from './contribute-form.js';
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
  CorrectionFormSchema,
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
 *
 * Generated, but COMMITTED, unlike graph.json — every file under `site/public/api/` is
 * tracked, and none is gitignored. So a corpus change has to be parsed and the result
 * committed with it. `lint-papers.yml`'s "Agent API ↔ corpus sync guard" re-runs `parse`
 * and fails on any diff, which is what keeps the committed endpoints and their committed
 * `openapi.json` schema describing the same thing.
 */
export const DEFAULT_API_DIR: string = fileURLToPath(
  new URL('../../public/api/', import.meta.url),
);

/**
 * The INSTALL skill, republished at `public/setup.md` so the install prompt has a short
 * site URL. Single source of truth: the copy in `public/` is generated.
 *
 * Deliberately the installer and not the `caail` query skill, which is what this pointed
 * at until the two were told apart. They have opposite lifecycles: the installer is
 * fetched once by an agent that does not have CAAIL yet and is then thrown away, while
 * the query skill is loaded into context on every session forever. Publishing the wrong
 * one meant the short URL named in the hero could not be the URL the hero used, so the
 * hero fetched a raw GitHub path instead and `setup.md` was generated, CI-guarded, and
 * referenced by nothing.
 *
 * The query skill needs no copy here: Claude Code installs it from the plugin, and other
 * clients are handed its raw GitHub URL by the installer.
 */
export const SKILL_DOC_PATH: string = fileURLToPath(
  new URL('../../../skills/caail-install/SKILL.md', import.meta.url),
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
  correctionReasons: number;
  awesomeLists: number;
  apiFiles: number;
  contributeTemplates: number;
  contributeParams: number;
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

  // The correction issue form's reason vocabulary, for the /report/ composer. Throws when
  // the template's options and the composer's follow-up declarations stop being in
  // bijection, or when a prefilled field id has been renamed away.
  const correctionForm = buildCorrectionForm();

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
  CorrectionFormSchema.parse(correctionForm);
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
      metrics.datasets.curatedEntries +
      metrics.datasets.referenceEntries +
      metrics.datasets.benchmarkEntries,
    metrics.datasets.total,
  );
  // The library total and what the agent API serves must now be the SAME population, so
  // the manifest no longer has to warn a consumer that adding its two numbers yields a
  // figure about nothing (#156). Curated entries + inventory rows == the headline count.
  assertCountsMatch(
    'datasets served == datasets counted',
    datasets.entries.length + inventory.inventory.length,
    counts.datasets,
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

  // Coverage guard: every matrix row (method) and column (area) must resolve to
  // a non-empty Taxonomy.md definition *under its own axis*. A miss means a
  // row/column label drifted from its `### Heading` — fail the build rather
  // than ship an empty definition.
  //
  // Checking the axis, not just non-emptiness, is the point. Taxonomy.md's
  // three H2 groups are separate vocabularies that may share a label, so
  // "this label has some definition somewhere in the file" was satisfiable by
  // a subject theme standing in for a matrix column — which is exactly how the
  // Bioprocess & Scale-Up column lost its in-scope/out-of-scope criteria while
  // every check stayed green.
  const missingDefs: Array<[label: string, axis: 'area' | 'method']> = [
    ...model.methods.map((label) => [label, 'method' as const] as [string, 'method']),
    ...model.areas.map((a) => [a.label, 'area' as const] as [string, 'area']),
  ].filter(([label, axis]) => !taxonomy.axes[axis][label]?.trim());
  if (missingDefs.length > 0) {
    throw new Error(
      `generate-data: ${missingDefs.length} matrix label(s) have no Taxonomy.md ` +
        `definition under their own axis: ` +
        `${missingDefs.map(([l, a]) => `"${l}" (${a})`).join(', ')}. Add a ` +
        `"### <label>" heading under "## Research areas (columns)" for a column, ` +
        `or "## AI/ML methods (rows)" for a row; the heading text must match the ` +
        `matrix label exactly. A heading with the same text under a different H2 ` +
        `does not satisfy this — it belongs to a different vocabulary.`,
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
  // Frozen-id guard, the forward direction of the join above: every parsed catalog entry
  // must resolve to an `sw:`/`db:` id. Software.md and Databases.md are GENERATED from the
  // catalog NDJSON, so an entry without a row means the two have drifted. Reader corrections
  // travel by that id, and an entry missing one silently loses its report link rather than
  // rendering visibly wrong, so this has to fail the build rather than degrade.
  const idless = [...catalog.software, ...catalog.databases].filter((e) => !e.itemId);
  if (idless.length > 0) {
    throw new Error(
      `generate-data: ${idless.length} catalog entr(ies) resolve to no frozen item id: ` +
        `${idless.slice(0, 8).map((e) => `"${e.name}"`).join(', ')}. The parsed entry's ` +
        `(type, url, name) is absent from site/db/ndjson/catalog.ndjson — re-run ` +
        `\`pnpm db:emit\` so the Markdown matches the DB, or fix the diverging name/url.`,
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

  // Write taxonomy.json — the site copy carries `definitions` ONLY.
  //
  // PapersExplorer imports this file and mounts client:load, so every byte here
  // ships in the explorer's JS bundle. It reads `taxonomy.definitions` and
  // nothing else, and `definitions` is by construction `axes.area ∪ axes.method`
  // — so emitting `axes` too would ship a verbatim second copy of all 32 matrix
  // definitions plus 8 theme blurbs the component never reads, roughly doubling
  // the file. The axis split is for consumers that must disambiguate an axis;
  // the only one that does is the agent API, which gets the full model below.
  writeFileSync(
    join(outDir, 'taxonomy.json'),
    JSON.stringify({ definitions: taxonomy.definitions }, null, 2) + '\n',
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

  // Write correction-form.json — the /report/ composer's reason vocabulary, read from the
  // GitHub issue template it prefills. Emitted rather than imported directly by the
  // component so it goes through the same validate-then-write path as every other model,
  // and so a drift between the template and the composer is a BUILD failure.
  writeFileSync(
    join(outDir, 'correction-form.json'),
    JSON.stringify(correctionForm, null, 2) + '\n',
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

  // Reconcile the caail-contribute skill against the issue forms it composes URLs for. Emits
  // nothing: the skill ships as Markdown and the templates ship as YAML, so there is no artifact
  // to write, only an agreement to enforce. Checked here rather than only in the test suite
  // because the failure is invisible at runtime (GitHub ignores a query parameter that matches
  // no field) and lands on a contributor's screen, not ours.
  const contributeClaims = verifyContributeForms();

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
    contributeTemplates: contributeClaims.length,
    contributeParams: contributeClaims.reduce((n, c) => n + c.params.length, 0),
    // Count across all three axes, so this equals the number of `###` headings
    // in Taxonomy.md and can be checked against the file by eye. Counting
    // `definitions` instead would silently omit the themes.
    taxonomyDefs:
      Object.keys(taxonomy.axes.area).length +
      Object.keys(taxonomy.axes.method).length +
      Object.keys(taxonomy.axes.theme).length,
    awesomeLists: awesome.groups.reduce((n, g) => n + g.items.length, 0),
    correctionReasons: correctionForm.reasons.length,
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
      correctionReasons,
      contributeTemplates,
      contributeParams,
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
        `taxonomy.json (${taxonomyDefs} definitions across 3 axes), ` +
        `correction-form.json (${correctionReasons} reasons), ` +
        `and llms-full.txt (${llmsBytes} bytes); verified caail-contribute prefills ` +
        `${contributeParams} parameters across ${contributeTemplates} issue templates`,
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
