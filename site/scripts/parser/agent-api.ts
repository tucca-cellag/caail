/**
 * agent-api.ts (parser) — emit the corpus as static JSON under `site/public/api/`,
 * so an AI agent can query CAAIL without any server, package or hosting.
 *
 * Why static files rather than an MCP server: the corpus is ~1 MB and the site is
 * already a static host, so publishing the data the build already generates costs one
 * copy step and gives structured, enumerable access from any client that can fetch a
 * URL — browser assistants included, which cannot reach a locally installed server.
 *
 * Two things here are DERIVED rather than copied, because they answer questions the
 * site's own JSON cannot:
 *
 *   matrix.json  — all 175 method×area cells, INCLUDING the 107 with no indexed paper.
 *                  papers.json carries only the 68 populated ones, so an agent could
 *                  never distinguish "no paper here" from "I didn't find one". Every
 *                  empty cell carries its own scope note (see SCOPE_NOTE) so absence in
 *                  the corpus cannot be read as absence in the literature.
 *
 *   topics.json  — an INVERTED index (topic → item ids across every content type). A
 *                  design question ("untargeted metabolomics on cultured bovine muscle")
 *                  does not arrive typed, so the useful answer spans papers, software,
 *                  databases and datasets at once.
 *
 * Everything else is copied verbatim from the models the build already validated, so
 * the API cannot drift from what the site itself renders.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatasetInventory, PapersData } from './types.js';

/** Where an agent-visible caveat is stated once and reused everywhere. */
export const SCOPE_NOTE =
  'CAAIL indexes a curated subset of the literature, not a census. An empty cell means ' +
  'no INDEXED paper occupies it as of corpus_date. That is not evidence that no such ' +
  'work exists. CAAIL has not measured its own recall.';

/** Repo root, two levels above this module's directory (parser/ -> scripts/ -> site/ -> root). */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** The one section of Papers.md whose references participate in the matrix. */
const MATRIX_SECTION = 'References';

export interface AgentApiInputs {
  papers: PapersData;
  catalog: unknown;
  datasets: unknown;
  /**
   * The `## Complete data inventory` rows. Optional so the emitter degrades to the
   * curated entries alone rather than throwing, but generate-data always supplies them:
   * without these the endpoint contradicts its own manifest, which is what #151 was.
   */
  inventory?: DatasetInventory;
  topics: unknown;
  taxonomy: unknown;
  /** ISO date stamped onto every response. Defaults to `readCorpusDate()`. */
  corpusDate?: string;
}

/**
 * The date the CORPUS last changed, read from git, not the date this build ran.
 *
 * Using `new Date()` here would be both less true and actively broken: the emitted files
 * are committed, and CI re-runs the parse to check they are in sync, so a build on any
 * later day would produce a one-line diff and fail the guard for no reason. Deriving from
 * the last commit that touched the NDJSON makes the output a pure function of the repo
 * state, and makes the field mean what an agent reading it would assume it means.
 *
 * Falls back to today only when git is unavailable (a tarball export, say), which is not
 * the CI case.
 */
export function readCorpusDate(repoRoot: string): string {
  const git = (args: string[]): string =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, TZ: 'UTC' },
    }).trim();

  try {
    // A shallow clone silently produces a WRONG date rather than no date: its grafted
    // root commit has no parent, so `git log -- <path>` treats any path present in that
    // tree as touched and returns the tip commit's date. That is well-formed, so no
    // format check catches it, and the committed output would then disagree with CI.
    // Refuse rather than emit a plausible lie; workflows set fetch-depth: 0.
    if (git(['rev-parse', '--is-shallow-repository']) === 'true') {
      throw new Error(
        'agent-api: cannot derive corpusDate from a shallow clone — it would silently ' +
          'return the tip commit date. Check out with fetch-depth: 0.',
      );
    }
    // --date=format-local with TZ=UTC normalises across contributors' timezones; %cs
    // alone is the committer's local date and can read a day ahead of UTC.
    const out = git(['log', '-1', '--date=format-local:%Y-%m-%d', '--format=%cd', '--', 'site/db/ndjson']);
    if (/^\d{4}-\d{2}-\d{2}$/.test(out)) return out;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('agent-api:')) throw err;
    /* git unavailable (tarball export): fall through to the clock */
  }
  return new Date().toISOString().slice(0, 10);
}

/** One emitted endpoint: the path under api/ and its already-serialisable body. */
export interface ApiFile {
  name: string;
  body: unknown;
}

// ---------------------------------------------------------------------------
// matrix.json — the full grid, empties included
// ---------------------------------------------------------------------------

export interface MatrixCell {
  method: string;
  area: string;
  areaLabel: string;
  refIds: number[];
  /** true when no indexed paper occupies this cell */
  emptyInCorpus: boolean;
  /** present ONLY on empty cells, so the caveat travels with the result */
  scope?: string;
}

/**
 * Expand the populated cells into the complete method×area grid.
 *
 * `papers.cells` holds only cells that have references (68 of 175). Emitting just those
 * would make an empty cell indistinguishable from a cell the agent failed to look up,
 * which is the precise confusion this endpoint exists to remove.
 */
export function buildMatrix(papers: PapersData, corpusDate: string): {
  corpusDate: string;
  methods: string[];
  areas: { key: string; label: string }[];
  totalCells: number;
  populatedCells: number;
  emptyCells: number;
  scopeNote: string;
  cells: MatrixCell[];
} {
  const byKey = new Map<string, number[]>();
  for (const c of papers.cells) byKey.set(`${c.method} ${c.area}`, [...c.refIds]);

  const cells: MatrixCell[] = [];
  for (const method of papers.methods) {
    for (const area of papers.areas) {
      const refIds = byKey.get(`${method} ${area.key}`) ?? [];
      const emptyInCorpus = refIds.length === 0;
      cells.push({
        method,
        area: area.key,
        areaLabel: area.label,
        refIds,
        emptyInCorpus,
        ...(emptyInCorpus ? { scope: SCOPE_NOTE } : {}),
      });
    }
  }

  const populated = cells.filter((c) => !c.emptyInCorpus).length;
  return {
    corpusDate,
    methods: [...papers.methods],
    areas: papers.areas.map((a) => ({ key: a.key, label: a.label })),
    totalCells: cells.length,
    populatedCells: populated,
    emptyCells: cells.length - populated,
    scopeNote: SCOPE_NOTE,
    cells,
  };
}

// ---------------------------------------------------------------------------
// topics.json — inverted index across every content type
// ---------------------------------------------------------------------------

interface TopicRefLike { slug: string }
interface ItemWithTopics { topics?: TopicRefLike[] }

/**
 * Invert the per-item topic tags into `topic slug -> { papers, software, databases,
 * datasets }`, so one lookup answers "what does CAAIL have on this subject" across
 * content types instead of requiring four separate scans.
 */
export function buildTopicIndex(
  papers: PapersData,
  catalog: unknown,
  datasets: unknown,
  topics: unknown,
): { corpusDate?: string; tree: unknown; index: Record<string, Record<string, (string | number)[]>> } {
  const index: Record<string, Record<string, (string | number)[]>> = {};
  const add = (slug: string, kind: string, id: string | number) => {
    index[slug] ??= { papers: [], software: [], databases: [], datasets: [] };
    index[slug][kind]!.push(id);
  };

  for (const r of papers.references) {
    for (const t of r.topics ?? []) add(t.slug, 'papers', r.id);
  }

  const cat = catalog as { software?: ItemWithTopics[]; databases?: ItemWithTopics[] } | null;
  for (const [kind, list] of [
    ['software', cat?.software ?? []],
    ['databases', cat?.databases ?? []],
  ] as const) {
    for (const e of list) {
      const slug = (e as { slug?: string }).slug;
      if (!slug) continue;
      for (const t of e.topics ?? []) add(t.slug, kind, slug);
    }
  }

  const ds = datasets as { entries?: (ItemWithTopics & { id?: string })[] } | null;
  for (const e of ds?.entries ?? []) {
    if (!e.id) continue;
    for (const t of e.topics ?? []) add(t.slug, 'datasets', e.id);
  }

  return { tree: topics, index };
}

// ---------------------------------------------------------------------------
// index.json — the manifest an agent reads first
// ---------------------------------------------------------------------------

/**
 * Counts are labelled with the POPULATION they counted. `papers.ndjson` carries six
 * sections and only `References` is matrix-eligible, so a bare "345 papers" invites an
 * agent to state a number that is true of one population and false of another.
 */
export function buildManifest(
  papers: PapersData,
  matrix: ReturnType<typeof buildMatrix>,
  corpusDate: string,
  datasets: { curated: number; inventory: number } = { curated: 0, inventory: 0 },
): unknown {
  const bySection: Record<string, number> = {};
  for (const r of papers.references) bySection[r.section] = (bySection[r.section] ?? 0) + 1;

  return {
    name: 'CAAIL — Cellular Agriculture AI Library',
    corpusDate,
    canonical: 'https://github.com/tucca-cellag/caail',
    site: 'https://tucca-cellag.github.io/caail/',
    license: 'MIT (CAAIL curation). Linked third-party resources keep their own licenses.',
    scopeNote: SCOPE_NOTE,
    counts: {
      papersAllSections: papers.references.length,
      papersBySection: bySection,
      papersMatrixEligible: bySection[MATRIX_SECTION] ?? 0,
      matrixTotalCells: matrix.totalCells,
      matrixPopulatedCells: matrix.populatedCells,
      matrixEmptyCells: matrix.emptyCells,
      // Two populations, like the paper sections above: the curated `### …` entries
      // (portals, atlases, GEMs) and the per-study deposit rows. Quoting either as
      // "datasets in CAAIL" is true of one and false of the other.
      datasetsCurated: datasets.curated,
      datasetsInventoryRows: datasets.inventory,
    },
    endpoints: [
      { path: 'index.json', use: 'This manifest: corpus date, counts by population, endpoint list.' },
      { path: 'matrix.json', use: 'All method×area cells, empties included. Use to ask what has and has not been indexed.' },
      { path: 'papers.json', use: 'Every reference with DOI, code URL, data URL, topics, license and citation count.' },
      { path: 'catalog.json', use: 'Software and databases, with topic, license tier and DOI.' },
      {
        path: 'datasets.json',
        use:
          'Two arrays. `entries` = curated dataset entries (portals, atlases, GEMs; kind ' +
          'atlas/gem/other). `inventory` = the per-species inventory rows (kind "inventory") ' +
          '— the per-study deposits with accession, tissue, assay type and size, keyed by the ' +
          'source page\'s own column labels. Filter either by `page` (e.g. "Cow"). Use the ' +
          'inventory rows for "what could I combine my own run with".',
      },
      { path: 'topics.json', use: 'Subject tree plus an inverted index: topic → items across all content types. Start here for "what should I use for X".' },
      { path: 'taxonomy.json', use: 'What each method and area means in CAAIL, with exclusion criteria. Read before trusting a placement.' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Assembly + write
// ---------------------------------------------------------------------------

/** Build every API file. Pure: no I/O, so it is testable without a filesystem. */
export function buildAgentApi(inputs: AgentApiInputs): ApiFile[] {
  const corpusDate = inputs.corpusDate ?? readCorpusDate(REPO_ROOT);
  const matrix = buildMatrix(inputs.papers, corpusDate);
  const datasetCounts = {
    curated: ((inputs.datasets as { entries?: unknown[] } | null)?.entries ?? []).length,
    inventory: (inputs.inventory?.inventory ?? []).length,
  };

  return [
    { name: 'index.json', body: buildManifest(inputs.papers, matrix, corpusDate, datasetCounts) },
    { name: 'matrix.json', body: matrix },
    { name: 'papers.json', body: { ...inputs.papers, scopeNote: SCOPE_NOTE, corpusDate } },
    { name: 'catalog.json', body: { ...(inputs.catalog as object), corpusDate } },
    {
      name: 'datasets.json',
      body: {
        ...(inputs.datasets as object),
        inventory: inputs.inventory?.inventory ?? [],
        corpusDate,
      },
    },
    {
      name: 'topics.json',
      body: {
        ...buildTopicIndex(inputs.papers, inputs.catalog, inputs.datasets, inputs.topics),
        corpusDate,
      },
    },
    { name: 'taxonomy.json', body: { ...(inputs.taxonomy as object), corpusDate } },
  ];
}

/** Write the built files into `apiDir`, creating it if needed. */
export function writeAgentApi(files: ApiFile[], apiDir: string): void {
  mkdirSync(apiDir, { recursive: true });
  for (const f of files) {
    writeFileSync(join(apiDir, f.name), JSON.stringify(f.body, null, 2) + '\n', 'utf-8');
  }
}

/**
 * Republish the plugin's SKILL.md at `public/setup.md`, so the install prompt can use a
 * short site URL while the repository copy stays the single source of truth.
 *
 * Copying rather than maintaining two files is deliberate: the install prompt carries a
 * raw.githubusercontent fallback for when the site 403s or is unreachable, and two
 * hand-edited copies of the same instructions would eventually disagree about which
 * endpoint answers what.
 */
export function publishSkillDoc(skillPath: string, publicDir: string): void {
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'setup.md'), readFileSync(skillPath, 'utf-8'), 'utf-8');
}
