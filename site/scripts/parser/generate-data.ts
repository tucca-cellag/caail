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

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPapersModel } from './papers.js';
import { computeCounts } from './counts.js';
import { buildCatalogModel } from './catalog.js';
import { buildTalksModel, talkItemCount } from './talks.js';
import { buildGraphModel } from './graph.js';
import { buildMetricsModel } from './metrics.js';
import {
  PapersDataSchema,
  CountsSchema,
  CatalogSchema,
  TalksSchema,
  GraphSchema,
  MetricsSchema,
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
): {
  counts: Counts;
  papersRefs: number;
  catalogEntries: number;
  talks: number;
  graphNodes: number;
  graphEdges: number;
} {
  // Build and validate the papers model.
  const model = buildPapersModel();

  // Compute and validate the aggregate counts.
  const counts = computeCounts(model);

  // Build and validate the catalog (Software + Databases) and talks models.
  const catalog = buildCatalogModel();
  const talks = buildTalksModel();

  // Build and validate the citation graph (M5) and metrics (M6).
  const graph = buildGraphModel(model);
  const metrics = buildMetricsModel(model);

  // Belt-and-suspenders: re-validate all before writing.
  PapersDataSchema.parse(model);
  CountsSchema.parse(counts);
  CatalogSchema.parse(catalog);
  TalksSchema.parse(talks);
  GraphSchema.parse(graph);
  MetricsSchema.parse(metrics);

  // No-drift guard: the homepage counts and the catalog/talks/graph/metrics
  // artifacts derive from the same canonical files, so their tallies must agree
  // exactly. A mismatch means a parser bug — fail the build loudly rather than
  // ship a stat that disagrees with the page it links to.
  assertCountsMatch('software', catalog.software.length, counts.software);
  assertCountsMatch('databases', catalog.databases.length, counts.databases);
  assertCountsMatch('talks', talkItemCount(talks), counts.talks);
  assertCountsMatch('graph nodes', graph.nodes.length, counts.papers);
  assertCountsMatch('metrics.library.papers', metrics.library.papers, counts.papers);

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

  return {
    counts,
    papersRefs: model.references.length,
    catalogEntries: catalog.software.length + catalog.databases.length,
    talks: talkItemCount(talks),
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length,
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
    const { counts, papersRefs, catalogEntries, talks, graphNodes, graphEdges } =
      generateData();
    // eslint-disable-next-line no-console
    console.log(
      `parse: wrote papers.json (${papersRefs} references), counts.json, ` +
        `catalog.json (${catalogEntries} entries), talks.json (${talks} talks), ` +
        `graph.json (${graphNodes} nodes / ${graphEdges} edges), and metrics.json`,
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
