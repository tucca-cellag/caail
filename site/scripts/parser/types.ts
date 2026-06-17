/**
 * types.ts — single source of truth for the parser's output shape.
 *
 * Exports Zod schemas and their inferred TypeScript types for the two
 * build-time JSON artifacts: papers.json and counts.json.
 *
 * This is a pure schema/types module — no file I/O, no parsing logic.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas (exported for reuse in downstream parser modules)
// ---------------------------------------------------------------------------

export const AreaSchema = z.object({
  /** Short machine-readable key, e.g. "media" */
  key: z.string(),
  /** Human-readable column label, e.g. "Media Optimization" */
  label: z.string(),
});

export const CellSchema = z.object({
  /** Method-row label, e.g. "Bayesian Optimization" */
  method: z.string(),
  /** Area key (not label), e.g. "media" */
  area: z.string(),
  /** Reference IDs cited in this cell */
  refIds: z.array(z.number().int().positive()),
  /** Human link labels, e.g. ["Cosenza et al. 2022"] */
  labels: z.array(z.string()),
});

export const ReferenceSchema = z.object({
  /** Stable numeric ID — never renumbered after assignment */
  id: z.number().int().positive(),
  /** The `##` heading the anchor lives under, e.g. "References", "Reviews & Perspectives" */
  section: z.string(),
  /** Full citation paragraph text (always preserved) */
  raw: z.string(),
  /** Parsed author list; null if APA parse failed */
  authors: z.array(z.string()).nullable(),
  /** Raw author run text — ALWAYS present (never null) */
  authorsText: z.string(),
  /** Publication year; null if not parsed */
  year: z.number().int().nullable(),
  /** Paper title; null if not parsed */
  title: z.string().nullable(),
  /** Journal / venue name; null if not parsed */
  journal: z.string().nullable(),
  /** Bare DOI, e.g. "10.1234/abc" (not the https://doi.org/... URL); null if absent */
  doi: z.string().nullable(),
  /** URL from `> **Code**:` blockquote; null if absent */
  codeUrl: z.string().url().nullable(),
  /** URL from `> **Data**:` blockquote; null if absent */
  dataUrl: z.string().url().nullable(),
  /** True if section === "References" AND ≥1 matrix cell cites this ref */
  isPrimary: z.boolean(),
  /** Method labels whose cells cite this reference */
  methods: z.array(z.string()),
  /** Area keys whose cells cite this reference */
  areas: z.array(z.string()),
  /** codeUrl !== null */
  hasCode: z.boolean(),
  /** dataUrl !== null */
  hasData: z.boolean(),
  /** First-author-surname + year, with a/b disambiguation, e.g. "cosenza-2022" */
  slug: z.string(),
});

export const CatalogEntrySchema = z.object({
  /** Slugified name with a/b disambiguation, e.g. "biometa", "biometa-b" */
  slug: z.string(),
  /** Display name (the H3 link text), e.g. "BioMeta" */
  name: z.string(),
  /** Canonical home URL (the H3 link target) */
  url: z.string().url(),
  /** The H2 section label the entry lives under (application area / category) */
  group: z.string(),
  /** Plain-text description — the FULL entry body (every paragraph after the H3
   *  up to the next heading), flattened to text. Software.md's leading `Summary:`
   *  label is stripped. Used for the search index and the JS-disabled fallback.
   *  May be empty if no body follows the heading. */
  summary: z.string(),
  /** The same full entry body rendered to HTML, with all hyperlinks preserved
   *  and repo-relative `.md` links rewritten to site routes (via
   *  rewriteCaailLinks — `./Papers.md#N` → GitHub blob, `./Datasets/Cow.md` →
   *  `/caail/datasets/cow/`). Rendered into the card so every reference in the
   *  canonical Markdown is surfaced and clickable. Empty when summary is empty. */
  summaryHtml: z.string(),
});

export const TalkItemSchema = z.object({
  /** List-item link text, e.g. "Multus Biotechnology: AI-driven media optimization" */
  title: z.string(),
  /** Destination URL (YouTube watch/playlist, or other) */
  url: z.string().url(),
  /** 'video' = embeddable single video; 'playlist' = YouTube playlist; 'link' = other */
  kind: z.enum(['video', 'playlist', 'link']),
  /** 11-character YouTube video id for kind === 'video'; null otherwise */
  videoId: z.string().nullable(),
  /** Trailing descriptive text after the link (venue/year/blurb); '' if none */
  note: z.string(),
});

export const TalkSectionSchema = z.object({
  /** H2 section heading, e.g. "Applied AI/ML for Cellular Agriculture" */
  heading: z.string(),
  /** Section intro paragraph; '' if none */
  intro: z.string(),
  items: z.array(TalkItemSchema),
});

// ---------------------------------------------------------------------------
// Top-level schemas
// ---------------------------------------------------------------------------

/**
 * Schema for papers.json — the main output of the Papers.md parser.
 */
export const PapersDataSchema = z.object({
  areas: z.array(AreaSchema),
  methods: z.array(z.string()),
  cells: z.array(CellSchema),
  references: z.array(ReferenceSchema),
});

/**
 * Schema for catalog.json — Software.md and Databases.md entries, each grouped
 * by its H2 section, in document order.
 */
export const CatalogSchema = z.object({
  software: z.array(CatalogEntrySchema),
  databases: z.array(CatalogEntrySchema),
});

/**
 * Schema for talks.json — Talks.md sections of curated videos/playlists, grouped.
 */
export const TalksSchema = z.object({
  sections: z.array(TalkSectionSchema),
});

// ---------------------------------------------------------------------------
// primers.json — the Primers/*.md curated onboarding hubs (cell-ag ⇄ AI)
// ---------------------------------------------------------------------------

/**
 * One primer item — a TalkItem plus an `internal` flag. Internal items are
 * cross-links into the rest of the site (e.g. /caail/papers/explorer/) whose
 * repo-relative `.md` URL has been rewritten to a site route by primers.ts;
 * they render as same-tab nav cards rather than new-tab external links.
 */
export const PrimerItemSchema = TalkItemSchema.extend({
  /** Destination URL — an absolute external URL, OR a site-relative route
   *  (e.g. "/caail/papers/explorer/") for rewritten internal cross-links, so
   *  this relaxes TalkItem's absolute-URL constraint. */
  url: z.string(),
  /** true when `url` is a rewritten same-site route (CAAIL navigation target) */
  internal: z.boolean(),
});

export const PrimerSectionSchema = z.object({
  /** H2 section heading, e.g. "Watch first — cellular agriculture foundations" */
  heading: z.string(),
  /** Section intro paragraph; '' if none */
  intro: z.string(),
  items: z.array(PrimerItemSchema),
});

export const PrimerSchema = z.object({
  /** Route slug, e.g. "cell-ag" → /caail/primers/cell-ag/ */
  slug: z.string(),
  /** H1 title of the primer file */
  title: z.string(),
  /** Lede paragraph (plain text) shown above the sections; '' if none */
  lead: z.string(),
  sections: z.array(PrimerSectionSchema),
});

/**
 * Schema for primers.json — the canonical Primers/*.md onboarding hubs, parsed
 * the same way as Talks.md but with internal cross-links rewritten to site
 * routes and YouTube links classified for inline embedding.
 */
export const PrimersSchema = z.object({
  primers: z.array(PrimerSchema),
});

// ---------------------------------------------------------------------------
// awesome-lists.json — the AwesomeLists.md curated-bibliography card page
// ---------------------------------------------------------------------------

/**
 * One curated "awesome list" — a GitHub repo plus its (optional) live metrics.
 * `stars` / `pushedAt` / `archived` come from the committed GitHub cache folded
 * in at parse time; all three are null when the cache lacks the repo (or there
 * is no cache), so the card renders without metrics. `repo` is the `owner/repo`
 * key used to look the metrics up; null for a non-GitHub URL.
 */
export const AwesomeListItemSchema = z.object({
  /** Display name — the bullet's link text, e.g. "seandavi/awesome-single-cell" */
  name: z.string(),
  /** Canonical home URL (the bullet's link target) */
  url: z.string().url(),
  /** GitHub `owner/repo` slug parsed from the URL; null for non-GitHub links */
  repo: z.string().nullable(),
  /** Plain-text description (after the link), for the search index */
  summary: z.string(),
  /** The same description rendered to HTML, with repo-relative `.md` links
   *  rewritten to site routes (via rewriteCaailLinks) */
  summaryHtml: z.string(),
  /** GitHub stargazer count from the cache; null when unknown */
  stars: z.number().int().nonnegative().nullable(),
  /** ISO timestamp of the repo's last push from the cache; null when unknown */
  pushedAt: z.string().nullable(),
  /** Whether GitHub marks the repo archived; null when unknown */
  archived: z.boolean().nullable(),
});

export const AwesomeListGroupSchema = z.object({
  /** H2 group label, e.g. "General bioinformatics". The anchor slug is derived
   *  at render time from this label via awesome-groups.groupSlug (single source
   *  of truth, mirroring how the catalog derives group slugs). */
  label: z.string(),
  items: z.array(AwesomeListItemSchema),
});

/**
 * Schema for awesome-lists.json — the AwesomeLists.md curated-bibliography page,
 * grouped by H2 section, with optional GitHub metrics folded in from the cache.
 */
export const AwesomeListsSchema = z.object({
  /** H1 title of AwesomeLists.md */
  title: z.string(),
  /** Lede paragraph (plain text) above the groups; '' if none */
  lead: z.string(),
  groups: z.array(AwesomeListGroupSchema),
  /** ISO timestamp of the metrics cache fold-in; null when no cache was present */
  generatedAt: z.string().nullable(),
});

/**
 * Schema for counts.json — aggregate stats across all canonical content files.
 */
export const CountsSchema = z.object({
  papers: z.number().int().nonnegative(),
  software: z.number().int().nonnegative(),
  databases: z.number().int().nonnegative(),
  /** number of dataset *pages* in Datasets/ (per-species + reference + topical) */
  species: z.number().int().nonnegative(),
  /** number of catalogued *datasets* across all Datasets/ pages */
  datasets: z.number().int().nonnegative(),
  researchAreas: z.number().int().nonnegative(),
  talks: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// graph.json — paper network with two toggleable edge modes (M5 / M7)
//   - shared-author co-authorship edges (undirected)
//   - citation edges (directed, derived from OpenAlex referenced_works)
// ---------------------------------------------------------------------------

export const GraphNodeSchema = z.object({
  /** reference.id */
  id: z.number().int().positive(),
  /** reference.slug — human-readable node label, e.g. "cosenza-2022" */
  label: z.string(),
  title: z.string().nullable(),
  /** raw author run, for the node tooltip/panel */
  authorsText: z.string(),
  year: z.number().int().nullable(),
  isPrimary: z.boolean(),
  methods: z.array(z.string()),
  areas: z.array(z.string()),
  doi: z.string().nullable(),
  journal: z.string().nullable(),
  hasCode: z.boolean(),
  hasData: z.boolean(),
  /** number of shared-author edges incident to this node (0 = isolated) */
  degree: z.number().int().nonnegative(),
  /** out-degree in the citation graph: in-corpus papers this node cites */
  citesCount: z.number().int().nonnegative(),
  /** in-degree in the citation graph: in-corpus papers that cite this node */
  citedByCount: z.number().int().nonnegative(),
});

export const GraphEdgeSchema = z.object({
  /** lower reference.id of the pair */
  source: z.number().int().positive(),
  /** higher reference.id of the pair */
  target: z.number().int().positive(),
  /** display names of the author(s) shared by source & target */
  sharedAuthors: z.array(z.string()).min(1),
});

/** Directed citation edge: `source` cites `target` (both in-corpus reference ids). */
export const CitationEdgeSchema = z.object({
  source: z.number().int().positive(),
  target: z.number().int().positive(),
});

/** Connectivity stats for one edge mode (shared-author or citation). */
export const GraphModeStatsSchema = z.object({
  /** edge count in this mode */
  edges: z.number().int().nonnegative(),
  /** nodes with ≥1 incident edge in this mode */
  connectedNodes: z.number().int().nonnegative(),
  /** nodes with 0 incident edges in this mode */
  isolatedNodes: z.number().int().nonnegative(),
  /** size of the largest connected component (undirected projection) */
  largestComponent: z.number().int().nonnegative(),
});

export const GraphMetadataSchema = z.object({
  /** total node count (shared by both modes) */
  nodes: z.number().int().nonnegative(),
  /** shared-author (co-authorship) connectivity */
  sharedAuthor: GraphModeStatsSchema,
  /** citation connectivity (zeroed when no citation cache is present) */
  citation: GraphModeStatsSchema,
});

/** Schema for graph.json — the paper network with both edge modes. */
export const GraphSchema = z.object({
  metadata: GraphMetadataSchema,
  nodes: z.array(GraphNodeSchema),
  /** shared-author edges (undirected) */
  edges: z.array(GraphEdgeSchema),
  /** citation edges (directed: source cites target) */
  citationEdges: z.array(CitationEdgeSchema),
});

// ---------------------------------------------------------------------------
// metrics.json — "By the Numbers" dashboard (M6)
// ---------------------------------------------------------------------------

export const MetricsAreaSchema = z.object({
  key: z.string(),
  label: z.string(),
  papers: z.number().int().nonnegative(),
});

export const MetricsMethodSchema = z.object({
  method: z.string(),
  papers: z.number().int().nonnegative(),
});

export const MetricsSpeciesSchema = z.object({
  species: z.string(),
  /** rows in the page's `## Complete data inventory` table; 0 for stubs */
  inventoryRows: z.number().int().nonnegative(),
  /** true when a placeholder note stands in for the inventory table */
  isStub: z.boolean(),
});

/** Breakdown of the catalogued-dataset total by source-page shape. */
export const MetricsDatasetsSchema = z.object({
  /** == counts.datasets; the sum of the three parts below */
  total: z.number().int().nonnegative(),
  /** `## Complete data inventory` rows over the species + CrossSpecies pages */
  speciesRows: z.number().int().nonnegative(),
  /** `###` dataset entries over the reference pages */
  referenceEntries: z.number().int().nonnegative(),
  /** `##` dataset entries on the benchmarks page */
  benchmarkEntries: z.number().int().nonnegative(),
});

/** Build-time git snapshot; null when git history is unavailable (shallow clone). */
export const MetricsMomentumSchema = z
  .object({
    papersLastModified: z.string().nullable(),
    datasetsLastModified: z.string().nullable(),
    papersCommits30d: z.number().int().nonnegative(),
    datasetsCommits30d: z.number().int().nonnegative(),
  })
  .nullable();

/** Schema for metrics.json — breadth, matrix coverage, per-species gaps, momentum. */
export const MetricsSchema = z.object({
  /** library-wide counts (identical to counts.json) */
  library: CountsSchema,
  matrix: z.object({
    totalCells: z.number().int().nonnegative(),
    filledCells: z.number().int().nonnegative(),
    coveragePct: z.number(),
    perArea: z.array(MetricsAreaSchema),
    perMethod: z.array(MetricsMethodSchema),
  }),
  species: z.array(MetricsSpeciesSchema),
  /** catalogued-dataset total + breakdown by source-page shape */
  datasets: MetricsDatasetsSchema,
  momentum: MetricsMomentumSchema,
  /** ISO build timestamp */
  generatedAt: z.string(),
});

// ---------------------------------------------------------------------------
// recent.json — home page "Recently added" list, derived from git history
// ---------------------------------------------------------------------------

/** One entry in the home page "Recently added" panel (RecentlyAdded.astro). */
export const RecentEntrySchema = z.object({
  /** commit date, YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** entry type, rendered as an uppercase label */
  kind: z.enum(['Paper', 'Software', 'Dataset', 'Database', 'Resource']),
  /** short title: the commit subject with prefix, lead verb, and issue ref stripped */
  title: z.string().min(1),
  /** research-area key driving the dot colour (RecentlyAdded.astro areaColor) */
  area: z.enum([
    'media',
    'cell',
    'bioprocess',
    'scaffolding',
    'sensory',
    'tooling',
    'eval',
  ]),
});

/** recent.json is a flat array of entries, newest first. */
export const RecentSchema = z.array(RecentEntrySchema);

// ---------------------------------------------------------------------------
// taxonomy.json — Taxonomy.md row/column definitions, keyed by matrix label
// ---------------------------------------------------------------------------

/**
 * Schema for taxonomy.json — the plain-text definition of every matrix
 * row/column, extracted from each `### Heading` in Taxonomy.md. Keyed by the
 * exact heading text (which matches the matrix labels in Papers.md), so the
 * explorer can look a label up directly. Values are the flattened definition
 * prose (markdown emphasis dropped).
 */
export const TaxonomyDataSchema = z.object({
  definitions: z.record(z.string(), z.string()),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type Area = z.infer<typeof AreaSchema>;
export type Cell = z.infer<typeof CellSchema>;
export type Reference = z.infer<typeof ReferenceSchema>;
export type PapersData = z.infer<typeof PapersDataSchema>;
export type Counts = z.infer<typeof CountsSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
export type TalkItem = z.infer<typeof TalkItemSchema>;
export type TalkSection = z.infer<typeof TalkSectionSchema>;
export type Talks = z.infer<typeof TalksSchema>;
export type PrimerItem = z.infer<typeof PrimerItemSchema>;
export type PrimerSection = z.infer<typeof PrimerSectionSchema>;
export type Primer = z.infer<typeof PrimerSchema>;
export type Primers = z.infer<typeof PrimersSchema>;
export type AwesomeListItem = z.infer<typeof AwesomeListItemSchema>;
export type AwesomeListGroup = z.infer<typeof AwesomeListGroupSchema>;
export type AwesomeLists = z.infer<typeof AwesomeListsSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type CitationEdge = z.infer<typeof CitationEdgeSchema>;
export type GraphModeStats = z.infer<typeof GraphModeStatsSchema>;
export type Graph = z.infer<typeof GraphSchema>;
export type MetricsSpecies = z.infer<typeof MetricsSpeciesSchema>;
export type MetricsDatasets = z.infer<typeof MetricsDatasetsSchema>;
export type Metrics = z.infer<typeof MetricsSchema>;
export type RecentEntry = z.infer<typeof RecentEntrySchema>;
export type Recent = z.infer<typeof RecentSchema>;
export type TaxonomyData = z.infer<typeof TaxonomyDataSchema>;
