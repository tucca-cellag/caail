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

import { assertValid, buildOpenApiDocument, OPENAPI_FILE } from './openapi.js';
import type { DatasetInventory, PapersData } from './types.js';

/** Where an agent-visible caveat is stated once and reused everywhere. */
export const SCOPE_NOTE =
  'CAAIL indexes a curated subset of the literature, not a census. An empty cell means ' +
  'no INDEXED paper occupies it as of corpus_date. That is not evidence that no such ' +
  'work exists. CAAIL has not measured its own recall.';

/**
 * Maturity, stated to the consumer rather than assumed.
 *
 * SCOPE_NOTE bounds what an EMPTY cell proves. This bounds what a POPULATED one proves,
 * and the two limits are NOT the same size. Absence is genuinely weak evidence: CAAIL has
 * not measured its own recall, so an empty cell says almost nothing about the literature.
 * A placement is strong: it is a curator's substantive claim about the paper's method and
 * application area, and the re-verification underway tightens precision rather than
 * establishing trust that was missing.
 *
 * Calibrate the caveat to the actual risk. Where a placement is off it is nearly always a
 * closely related cell — an adjacent method row, a neighbouring area — not a paper that
 * does not belong in CAAIL at all. Telling an agent to discount the classification would
 * be both wrong and self-defeating, since the classification is the thing CAAIL adds.
 *
 * This reaches agents more than humans. A person browsing treats the matrix as a reading
 * list; an agent answering "which method has been applied to X" reports the cell and
 * carries it into a citation chain where provenance is lost. The payload is the only
 * place that reaches them.
 */
export const STATUS = 'beta' as const;
export const PLACEMENT_NOTE =
  'Placements are curator-assigned and are being re-verified against paper full texts, ' +
  'then graded by evaluators. Treat a cell as a substantive claim about the paper method ' +
  'and application area. The residual uncertainty is precision, not inclusion: where a ' +
  'placement is off it is typically a closely related cell rather than a paper that does ' +
  'not belong. Cite the paper itself.';

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
  /** present ONLY on populated cells: what this placement does and does not assert */
  placement?: string;
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
  status: string;
  placementsUnderReview: boolean;
  methods: string[];
  areas: { key: string; label: string }[];
  totalCells: number;
  populatedCells: number;
  emptyCells: number;
  scopeNote: string;
  placementNote: string;
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
        // The caveat travels ON the cell, not only at the top level, because an agent
        // that looks up one cell and reports it will never have read the envelope. Empty
        // and populated cells need different caveats: one bounds what absence proves,
        // the other bounds what presence proves. Both are claims an agent carries into a
        // citation chain, where the provenance is gone.
        ...(emptyInCorpus ? { scope: SCOPE_NOTE } : { placement: PLACEMENT_NOTE }),
      });
    }
  }

  const populated = cells.filter((c) => !c.emptyInCorpus).length;
  return {
    corpusDate,
    status: STATUS,
    placementsUnderReview: true,
    methods: [...papers.methods],
    areas: papers.areas.map((a) => ({ key: a.key, label: a.label })),
    totalCells: cells.length,
    populatedCells: populated,
    emptyCells: cells.length - populated,
    scopeNote: SCOPE_NOTE,
    placementNote: PLACEMENT_NOTE,
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
): { tree: unknown; index: Record<string, Record<string, (string | number)[]>> } {
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
// The compact indexes
// ---------------------------------------------------------------------------

/**
 * What an agent is told when the matrix is the wrong instrument.
 *
 * This is the defect the indexes were built after, and it is worth stating in the payload
 * because it has now been made three times, twice by this project's own curators with full
 * repository access, and once by an outside agent using nothing but the published API and
 * the skill. All three concluded that CAAIL indexes no paper coupling a genome-scale model
 * to media design. Reference 240 is exactly that paper. It is invisible to `matrix.json`
 * because it sits in a Reference Work section with no method and no area, and nothing in
 * the API said that such a reference could exist.
 *
 * SCOPE_NOTE bounds what an empty cell proves, which is the failure everyone anticipated.
 * This bounds what the matrix's SILENCE proves, which is the one that actually fired.
 */
export const MATRIX_NOTE =
  'A reference with empty `methods` and `areas` is indexed but occupies no matrix cell: ' +
  'only the References section is matrix-eligible, so reviews and reference works never ' +
  'appear in matrix.json however directly they answer a question. Searching the matrix ' +
  'alone will not find them. Before concluding that CAAIL indexes no work on something, ' +
  'search this index over every section, or the topic index in topics.json.';

/** One row per reference: enough to select, small enough to survive a summarising fetch. */
export function buildPapersIndex(papers: PapersData, corpusDate: string): unknown {
  // Same reason as buildCatalogIndex: never throw ahead of the validator. A malformed
  // `references` should be reported as papers.json failing its schema, by name.
  const refs = Array.isArray(papers?.references) ? papers.references : [];
  return {
    corpusDate,
    scopeNote: SCOPE_NOTE,
    matrixNote: MATRIX_NOTE,
    references: refs.map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year ?? null,
      // The first author is what an author-year citation label needs. The full list is
      // 72 KB across the corpus and is one fetch away in papers.json.
      firstAuthor: r.authors?.[0] ?? null,
      section: r.section,
      isPrimary: r.isPrimary,
      methods: r.methods ?? [],
      areas: r.areas ?? [],
      doi: r.doi ?? null,
      hasCode: Boolean(r.hasCode),
      hasData: Boolean(r.hasData),
    })),
  };
}

/** The same trade for the catalogue, where the duplicated summary prose is two thirds of it. */
export function buildCatalogIndex(catalog: unknown, corpusDate: string): unknown {
  type Entry = {
    slug?: string;
    name?: string;
    group?: string;
    url?: string | null;
    doi?: string | null;
    tier?: string | null;
  };
  const cat = catalog as { software?: Entry[]; databases?: Entry[] } | null;
  // Tolerate a malformed input rather than throwing on it. These builders run BEFORE
  // `assertValid`, so a bare `.filter` here turns "catalog.json failed its schema" — which
  // names the file and the offending key — into `list.filter is not a function`, which
  // names neither. Degrade to empty and let the validator report it properly; the sibling
  // catalog.json in the same batch carries the same bad input and will fail on it.
  const arr = (v: unknown): Entry[] => (Array.isArray(v) ? (v as Entry[]) : []);
  const rows = ([['software', arr(cat?.software)], ['database', arr(cat?.databases)]] as const)
    .flatMap(([kind, list]) =>
      list
        .filter((e) => e && e.slug)
        .map((e) => ({
          slug: e.slug as string,
          name: e.name ?? '',
          kind,
          group: e.group ?? '',
          url: e.url ?? null,
          doi: e.doi ?? null,
          tier: e.tier ?? null,
        })),
    );
  return { corpusDate, entries: rows };
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
    name: 'CAAIL: Cellular Agriculture AI Library',
    corpusDate,
    // First thing an agent reads, so the maturity belongs here rather than three
    // fetches deep. The inventory counts are firm; it is the classification over them
    // that is still being verified.
    status: STATUS,
    placementsUnderReview: true,
    canonical: 'https://github.com/tucca-cellag/caail',
    site: 'https://tucca-cellag.github.io/caail/',
    license: 'MIT (CAAIL curation). Linked third-party resources keep their own licenses.',
    scopeNote: SCOPE_NOTE,
    // The machine-readable shape of every endpoint below. Named up here rather than only
    // in the endpoint list because the point is to be found BEFORE anyone guesses a key.
    openapi: OPENAPI_FILE,
    placementNote: PLACEMENT_NOTE,
    counts: {
      papersAllSections: papers.references.length,
      papersBySection: bySection,
      papersMatrixEligible: bySection[MATRIX_SECTION] ?? 0,
      matrixTotalCells: matrix.totalCells,
      matrixPopulatedCells: matrix.populatedCells,
      matrixEmptyCells: matrix.emptyCells,
      // Two populations, like the paper sections above: the curated entries (portals,
      // atlases, GEMs, benchmarks) and the per-study deposit rows. Quoting either alone as
      // "datasets in CAAIL" is true of one and false of the other — but unlike the paper
      // sections these two are disjoint and exhaustive, so their SUM is the library total.
      // That was not true until #156 folded the benchmark datasets in; a `datasetsNote`
      // used to sit here warning a consumer not to add them.
      datasetsCurated: datasets.curated,
      datasetsInventoryRows: datasets.inventory,
      datasetsTotal: datasets.curated + datasets.inventory,
    },
    endpoints: [
      { path: 'index.json', use: 'This manifest: corpus date, counts by population, endpoint list.' },
      { path: 'matrix.json', use: 'All method×area cells, empties included. Use to ask what has and has not been indexed — then read `matrixNote` in papers-index.json before reading a silence as an absence.' },
      { path: 'papers-index.json', use: 'START HERE for papers. Every reference, one compact row: id, title, year, first author, section, methods, areas, DOI, code/data flags. A sixth the size of papers.json, so it survives a fetch tool that truncates. Enumerate here, then fetch full records.' },
      { path: 'papers.json', use: 'Full records for the references you selected. Large (~554 KB): if your fetch summarises rather than returning bytes, a "not found" from this file is not evidence of absence.' },
      { path: 'catalog-index.json', use: 'START HERE for software and databases. One compact row each: slug, name, kind, group, URL, DOI, license tier. A tenth the size of catalog.json.' },
      { path: 'catalog.json', use: 'Full records with summaries. Large (~576 KB), two thirds of it the same summary prose as Markdown and as HTML; same truncation caveat as papers.json.' },
      {
        path: 'datasets.json',
        use:
          'Two arrays, together the whole dataset corpus. `entries` = curated dataset entries ' +
          '(portals, atlases, GEMs, reference corpora, and the AI/ML benchmark and evaluation ' +
          'datasets on page "Benchmarks"; kind atlas/gem/other). `inventory` = the per-species ' +
          'inventory rows (kind "inventory") — the per-study deposits with accession, tissue, ' +
          'assay type and size, keyed by the source page\'s own column labels. Filter either by ' +
          '`page` (e.g. "Cow", "Benchmarks"). Use the inventory rows for "what could I combine ' +
          'my own run with", and page "Benchmarks" for "what could I evaluate a model against".',
      },
      { path: 'topics.json', use: 'Subject tree plus an inverted index: topic → items across all content types. Start here for "what should I use for X".' },
      { path: 'taxonomy.json', use: 'What each method, area and subject theme means in CAAIL, with exclusion criteria. Read before trusting a placement. Definitions are split by vocabulary under `axes` (`area`, `method`, `theme`) because a label may appear in more than one — "Bioprocess & Scale-Up" is both a matrix column and a theme, with different text. `definitions` is the flat matrix lookup (areas + methods only); look a theme up under `axes.theme`.' },
      { path: OPENAPI_FILE, use: 'OpenAPI 3.1 description of every endpoint above, generated from the schemas that validate them. Read this instead of guessing a key.' },
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

  const files: ApiFile[] = [
    { name: 'index.json', body: buildManifest(inputs.papers, matrix, corpusDate, datasetCounts) },
    { name: 'matrix.json', body: matrix },
    { name: 'papers-index.json', body: buildPapersIndex(inputs.papers, corpusDate) },
    { name: 'papers.json', body: { ...inputs.papers, scopeNote: SCOPE_NOTE, corpusDate } },
    { name: 'catalog-index.json', body: buildCatalogIndex(inputs.catalog, corpusDate) },
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

  // Every body is checked against its published schema BEFORE anything is written, so a
  // model that changed shape fails the build rather than shipping a payload the document
  // says is impossible. This is what makes the OpenAPI file a property of the output and
  // not a claim about it.
  for (const f of files) assertValid(f.name, f.body);

  // Emitted last, and in the same pass, so it cannot describe a set of files that was
  // never written. It is the description rather than a described response, so it carries
  // its corpus date as info.version + x-corpus-date rather than a bare corpusDate key,
  // which would make the document invalid against the OpenAPI 3.1 meta-schema.
  files.push({ name: OPENAPI_FILE, body: buildOpenApiDocument(corpusDate) });
  return files;
}

/**
 * The two index files are serialised ONE ROW PER LINE rather than fully pretty-printed.
 *
 * Two-space indent puts every field of every row on its own line, which took the papers
 * index to 150 KB for 84 KB of data — 78% whitespace, in the one file whose entire purpose
 * is to be small enough to survive a fetch tool that truncates. Minifying it outright would
 * fix the size and produce a single-line diff on a committed, CI-diffed artifact, so that
 * trades one real problem for another.
 *
 * Row-per-line gets both: the payload is compact, and a reference changing shows up as one
 * changed line with the id visible at the front of it.
 */
const COMPACT_ARRAY: Record<string, string> = {
  'papers-index.json': 'references',
  'catalog-index.json': 'entries',
};

export function serializeApiFile(name: string, body: unknown): string {
  const key = COMPACT_ARRAY[name];
  const rows = key ? (body as Record<string, unknown>)[key] : undefined;
  if (!key || !Array.isArray(rows)) return JSON.stringify(body, null, 2) + '\n';

  // Everything except the row array keeps its readable form; the array is emitted with one
  // minified object per line, which is valid JSON and stays reviewable in a diff.
  const rest = JSON.stringify({ ...(body as object), [key]: [] }, null, 2);
  const lines = rows.map((r) => '    ' + JSON.stringify(r)).join(',\n');
  return rest.replace(`"${key}": []`, `"${key}": [\n${lines}\n  ]`) + '\n';
}

/** Write the built files into `apiDir`, creating it if needed. */
export function writeAgentApi(files: ApiFile[], apiDir: string): void {
  mkdirSync(apiDir, { recursive: true });
  for (const f of files) {
    writeFileSync(join(apiDir, f.name), serializeApiFile(f.name, f.body), 'utf-8');
  }
}

/**
 * Republish the INSTALL skill at `public/setup.md`, so the install prompt can use a short
 * site URL while the repository copy stays the single source of truth.
 *
 * Copying rather than maintaining two files is deliberate: the install prompt carries a
 * raw.githubusercontent fallback for when the site 403s or is unreachable, and two
 * hand-edited copies of the same instructions would eventually disagree about which
 * endpoint answers what.
 *
 * The caller decides which skill this is, and it must be the installer rather than the
 * `caail` query skill. Pointing it at the query skill made the fallback above impossible
 * to honour: the prompt fetched a raw GitHub path directly and the short URL this
 * function exists to publish went unused.
 */
export function publishSkillDoc(skillPath: string, publicDir: string): void {
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, 'setup.md'), readFileSync(skillPath, 'utf-8'), 'utf-8');
}
