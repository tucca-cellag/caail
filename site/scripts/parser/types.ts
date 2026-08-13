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

/** A topic tag attached to an item: the fine tag (or theme) + its parent theme slug. */
export const TopicRefSchema = z.object({
  slug: z.string(),
  label: z.string(),
  theme: z.string(), // parent theme slug (a theme-level tag points at itself)
});
export type TopicRef = z.infer<typeof TopicRefSchema>;

/** Coarse license/access tier — the unified 4-tier axis (see src/lib/licenses.ts). */
export const LicenseTierSchema = z.enum(['permissive', 'copyleft', 'restricted', 'unknown']);
/** The license fields folded onto every card: raw token, provenance, derived tier. */
export const LicenseFieldsSchema = z.object({
  /** SPDX-ish token or manual string; null = unknown/not detected */
  license: z.string().nullable().default(null),
  /** provenance: 'auto' = GitHub SPDX, 'manual' = hand-verified; null = none */
  licenseSource: z.enum(['auto', 'manual']).nullable().default(null),
  /** coarse tier derived from `license` via licenseTier() */
  tier: LicenseTierSchema.default('unknown'),
});
export type LicenseTier = z.infer<typeof LicenseTierSchema>;

export const ReferenceSchema = z.object({
  /** Stable numeric ID — never renumbered after assignment */
  id: z.number().int().positive(),
  /** The `##` heading the anchor lives under, e.g. "References", "Reviews & Perspectives" */
  section: z.string(),
  /** Full citation paragraph text (always preserved) */
  raw: z.string(),
  /** Parsed author list; null if APA parse failed */
  authors: z.array(z.string()).nullable(),
  /**
   * Count of unpairable author-run tokens dropped from `authors` (an
   * internal-comma org suffix, a mononym, or a malformed personal author).
   * 0 when clean; > 0 flags silent information loss even when `authors` is
   * non-null. Surfaced by the lint's unparsed-fields warning.
   */
  authorsDropped: z.number().int().nonnegative(),
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
  /** Two-tier subject tags (#78 topic axis), folded in from the committed topic NDJSON */
  topics: z.array(TopicRefSchema).default([]),
  /** OpenAlex global cited_by_count for this DOI, folded from the citation cache; null when
   *  the DOI is absent from the cache (not yet re-fetched) or the paper has no DOI */
  citedByOpenAlex: z.number().int().nonnegative().nullable().default(null),
  /**
   * OpenAlex best-OA-location license string ("cc-by", "cc-by-nc-nd", …), folded from the
   * citation cache; null when the paper is closed, when the OA location states no license
   * (all bronze and much green), or when the DOI predates the license re-fetch. Raw here,
   * like catalog's `license` — the coarse tier is derived by src/lib/licenses.ts so there
   * is one definition of a tier across every content type.
   */
  license: z.string().nullable().default(null),
  /**
   * Provenance of `license`, mirroring catalog's `licenseSource`. Always 'auto' for papers
   * today (derived from OpenAlex); 'manual' is reserved for curator overrides.
   */
  licenseSource: z.enum(['auto', 'manual']).nullable().default(null),
  /**
   * OpenAlex `open_access.is_oa` — free to READ, folded from the citation cache. Null when
   * the DOI is absent from the cache or the paper has no DOI, which is why it is nullable
   * rather than defaulting to false: "no record" and "not open" are different facts, and
   * anything quoting a denominator over these has to tell them apart.
   *
   * NOT a redistribution grant, and not interchangeable with `license` — many works here
   * are free to read under no license at all. Anything that STORES text must filter on the
   * derived license tier, never on this field.
   */
  isOa: z.boolean().nullable().default(null),
});

export const CatalogEntrySchema = z.object({
  /** Slugified name with a/b disambiguation, e.g. "biometa", "biometa-b" */
  slug: z.string(),
  /**
   * Frozen `sw:`/`db:` id, folded in from the committed catalog NDJSON on the same
   * `(type, url, name)` triple as topics. NOT derivable from `slug` — a dual-listed
   * entry shares its URL across two namespaces. Null only if the entry has no DB row,
   * which `generate-data.ts` fails the build on.
   */
  itemId: z.string().nullable().default(null),
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
  /** Two-tier subject tags (#78 topic axis), folded in from the committed topic NDJSON */
  topics: z.array(TopicRefSchema).default([]),
  /** DB-owned license/access fields, folded in from the committed catalog NDJSON */
  license: z.string().nullable().default(null),
  licenseSource: z.enum(['auto', 'manual']).nullable().default(null),
  tier: LicenseTierSchema.default('unknown'),
  /** DB-owned associated-publication DOI + provenance, folded from the catalog NDJSON */
  doi: z.string().nullable().default(null),
  doiSource: z.enum(['auto', 'manual']).nullable().default(null),
  /** OpenAlex cited_by_count summed over `doi` + its sibling version DOIs; null when unknown */
  citationCount: z.number().int().nonnegative().nullable().default(null),
  /** number of papers the count aggregates (1 = single paper; >1 = versioned resource, #102) */
  citationSources: z.number().int().nonnegative().default(0),
  /** the DOIs whose counts were summed — the works the badge/hub link opens (#102) */
  citationDois: z.array(z.string()).default([]),
});

/**
 * One curated dataset entry (a featured atlas / GEM / reference entry — the `### …`
 * headings on the Datasets/ pages), surfaced as a tagged, linkable item. Built from
 * the committed dataset_entries NDJSON offline (like topics), joined to its topic refs.
 */
export const DatasetEntrySchema = z.object({
  /** frozen ds: id, e.g. "ds:chickengtex-portal" */
  id: z.string(),
  /** display name — the H3 link text, or the heading text when unlinked */
  name: z.string(),
  /** external home URL (the H3 link target); null for unlinked GEM/reference headings */
  url: z.string().nullable(),
  /** dataset page basename, e.g. "Chicken" — lowercased to the route slug by consumers */
  page: z.string(),
  /** enclosing H2 section label, e.g. "Featured atlases" */
  section: z.string(),
  /** soft classification driving the card badge */
  kind: z.enum(['atlas', 'gem', 'other']),
  /** in-page anchor slug for the card element id + the hub's #link (unique per page) */
  anchor: z.string(),
  /** two-tier subject tags, folded in from the committed topic NDJSON */
  topics: z.array(TopicRefSchema).default([]),
  /** DB-owned license/access fields (data-use terms), folded in from dataset_entries NDJSON */
  license: z.string().nullable().default(null),
  licenseSource: z.enum(['auto', 'manual']).nullable().default(null),
  tier: LicenseTierSchema.default('unknown'),
  /** DB-owned associated-publication DOI + provenance, folded from dataset_entries NDJSON */
  doi: z.string().nullable().default(null),
  doiSource: z.enum(['auto', 'manual']).nullable().default(null),
  /** OpenAlex cited_by_count summed over `doi` + its sibling version DOIs; null when unknown */
  citationCount: z.number().int().nonnegative().nullable().default(null),
  /** number of papers the count aggregates (1 = single paper; >1 = versioned resource, #102) */
  citationSources: z.number().int().nonnegative().default(0),
  /** the DOIs whose counts were summed — the works the badge/hub link opens (#102) */
  citationDois: z.array(z.string()).default([]),
});

/** Schema for datasets.json — the curated dataset entries across the Datasets/ pages. */
export const DatasetsDataSchema = z.object({
  entries: z.array(DatasetEntrySchema),
});
export type DatasetEntry = z.infer<typeof DatasetEntrySchema>;
export type DatasetsData = z.infer<typeof DatasetsDataSchema>;

/**
 * One `## Complete data inventory` row — a per-study deposit (accession, tissue, assay,
 * size), as opposed to the curated `### …` entries above.
 *
 * Kept OUT of `DatasetsDataSchema` on purpose: three Preact islands import the site's
 * datasets.json (CitationHub, LicenseHub, TopicHub), so folding 164 rows in there would
 * ship them to the browser for no gain. They belong to the agent API, which is fetched
 * deliberately and whose manifest already advertises them.
 *
 * `columns` is keyed by the page's own header labels because the tables genuinely differ
 * — the species pages use Study/Paper/Data/Type/Tissue/…, Fish and the invertebrates add
 * a Species column, and CrossSpecies is a different table entirely. A positional array
 * would be unreadable without fetching the Markdown, which is the cost this removes.
 * Values are the RAW markdown cell, so nothing is lost; `links` is the convenience
 * extraction of the URLs inside them.
 */
export const DatasetInventoryRowSchema = z.object({
  /** frozen ds: id, shared with the curated entries' namespace */
  id: z.string(),
  /** discriminator against DatasetEntrySchema's atlas/gem/other */
  kind: z.literal('inventory'),
  /** dataset page basename, e.g. "Cow" */
  page: z.string(),
  /** plain text of the first column — the study/resource name */
  name: z.string(),
  /** the page's header labels → that row's raw markdown cell, in table order */
  columns: z.record(z.string(), z.string()),
  /** every URL appearing in the row, in document order, deduped */
  links: z.array(z.string()),
  /** two-tier subject tags, folded in from the committed topic NDJSON */
  topics: z.array(TopicRefSchema).default([]),
  /**
   * Member accessions when this row's deposit is a SuperSeries (CAAIL-258); `[]` otherwise.
   *
   * A SuperSeries accession resolves to no analysable data — it is a container — so a row
   * that names only the parent hides every member from anyone querying this endpoint.
   * `id` is RESOLVED against the inventory rather than recorded: non-null when the member
   * is catalogued in its own right, null when it is reachable only from here.
   */
  subseries: z.array(z.object({
    /** bare uppercase member accession, e.g. "GSE173198" */
    accession: z.string(),
    /** frozen ds: id of the member's own inventory row, or null if it has none */
    id: z.string().nullable(),
  })).default([]),
});

/** Schema for the inventory model — the rows across every inventory page. */
export const DatasetInventorySchema = z.object({
  inventory: z.array(DatasetInventoryRowSchema),
});
export type DatasetInventoryRow = z.infer<typeof DatasetInventoryRowSchema>;
export type DatasetInventory = z.infer<typeof DatasetInventorySchema>;

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
  /** == counts.datasets; the sum of the four parts below */
  total: z.number().int().nonnegative(),
  /** `## Complete data inventory` rows over the species + CrossSpecies pages */
  speciesRows: z.number().int().nonnegative(),
  /** curated `###` entries (featured atlases, GEMs) ON the species + CrossSpecies pages */
  curatedEntries: z.number().int().nonnegative(),
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

/**
 * Subject-axis coverage (the /topics/ hub, rolled up).
 *
 * `assignments` counts item↔topic rows, `taggedItems` counts DISTINCT items, and
 * `taggableItems` is the denominator — they are three different numbers and the
 * dashboard must not present one as another.
 */
export const MetricsTopicsSchema = z.object({
  themes: z.number().int().nonnegative(),
  tags: z.number().int().nonnegative(),
  assignments: z.number().int().nonnegative(),
  taggedItems: z.number().int().nonnegative(),
  taggableItems: z.number().int().nonnegative(),
  perTheme: z.array(
    z.object({
      slug: z.string(),
      label: z.string(),
      /** matrix area this theme maps onto, when it maps onto one */
      areaKey: z.string().nullable(),
      tags: z.number().int().nonnegative(),
      items: z.number().int().nonnegative(),
      /**
       * The theme's fine tags with their own item counts. These do NOT sum to `items`:
       * a theme also holds items tagged at theme level only, and an item carrying two
       * of its tags is counted once by the theme but once per tag here.
       */
      tagList: z.array(
        z.object({
          slug: z.string(),
          label: z.string(),
          items: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
});

/**
 * A subject grid: theme rows each followed by their fine-tag rows, split across some
 * categorical axis (license tiers or citation bands). Shared by both axes so the two
 * grids can't drift in shape.
 *
 * Rows OVERLAP by construction: an item tagged with several themes is counted under
 * each, and a theme row also holds items tagged only at theme level, so its tag rows
 * never sum to it. Never present a column of these as a partition.
 */
export const MetricsSubjectGridSchema = z.array(
  z.object({
    slug: z.string(),
    label: z.string(),
    kind: z.enum(['theme', 'tag']),
    /** parent theme slug for a tag row; null for a theme row */
    theme: z.string().nullable(),
    total: z.number().int().nonnegative(),
    cells: z.array(
      z.object({ key: z.string(), count: z.number().int().nonnegative() }),
    ),
  }),
);

/**
 * License-tier triage over the catalog + curated dataset entries.
 *
 * NOTE the universe: software + databases + dataset entries. Papers carry no license
 * by design, so they are NOT in `total` — do not cross-assert this against a
 * paper-inclusive tally.
 */
export const MetricsLicensesSchema = z.object({
  total: z.number().int().nonnegative(),
  tiers: z.array(
    z.object({
      tier: LicenseTierSchema,
      count: z.number().int().nonnegative(),
      /** share of `total`, one decimal */
      pct: z.number(),
    }),
  ),
  /** tier × subject, over the same paper-free population as `total` */
  bySubject: MetricsSubjectGridSchema,
});

/**
 * OpenAlex citation-count bands.
 *
 * NOTE the universe differs from licenses: papers ARE included here. Items with no
 * count are excluded entirely (unbanded ≠ zero citations), so `withCount` is the
 * denominator for `pct`, not the library total.
 */
export const MetricsCitationsSchema = z.object({
  withCount: z.number().int().nonnegative(),
  papersWithCount: z.number().int().nonnegative(),
  papersTotal: z.number().int().nonnegative(),
  catalogWithCount: z.number().int().nonnegative(),
  catalogTotal: z.number().int().nonnegative(),
  /** entries whose count sums sibling-version DOIs (the `∑` marker, #102) */
  aggregated: z.number().int().nonnegative(),
  bands: z.array(
    z.object({
      band: z.string(),
      label: z.string(),
      count: z.number().int().nonnegative(),
      /** share of `withCount`, one decimal */
      pct: z.number(),
    }),
  ),
  /**
   * Band × subject, over every counted item INCLUDING papers — the same population
   * `/citations/?band=&t=` lists, since each grid cell links there.
   */
  bySubject: MetricsSubjectGridSchema,
});

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
  /** subject-axis coverage — the /topics/ hub rolled up */
  topics: MetricsTopicsSchema,
  /** license-tier triage over catalog + dataset entries (no papers) */
  licenses: MetricsLicensesSchema,
  /** OpenAlex citation bands over papers + catalog + dataset entries */
  citations: MetricsCitationsSchema,
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
// taxonomy.json — Taxonomy.md definitions, per axis plus a flat matrix lookup
// ---------------------------------------------------------------------------

/** One vocabulary: `heading text → flattened definition prose`. */
export const TaxonomyAxisMapSchema = z.record(z.string(), z.string());

/**
 * Schema for taxonomy.json — the plain-text definition of every matrix
 * row/column and subject theme, extracted from each `### Heading` in
 * Taxonomy.md. Values are the flattened definition prose (markdown emphasis
 * dropped).
 *
 * Two views of the same content, and the distinction matters:
 *
 * - `axes` is the source of truth, split by the vocabulary each heading
 *   belongs to. A label may appear in more than one axis — `Bioprocess &
 *   Scale-Up` is both a matrix column and a subject theme, with different
 *   text — so only an axis-qualified lookup is unambiguous.
 * - `definitions` is the flat matrix lookup (areas + methods, never themes),
 *   keyed by the exact heading text so the explorer can resolve a Papers.md
 *   label directly.
 *
 * Reading a column's scope out of `definitions` is safe. Reading it out of a
 * whole-file flatten is not, which is what this shape exists to prevent.
 */
export const TaxonomyDataSchema = z.object({
  definitions: z.record(z.string(), z.string()),
  axes: z.object({
    area: TaxonomyAxisMapSchema,
    method: TaxonomyAxisMapSchema,
    theme: TaxonomyAxisMapSchema,
  }),
});

/** One node in the topic tree (a theme or a fine tag) with cross-content counts. */
export const TopicNodeSchema = z.object({
  slug: z.string(),
  label: z.string(),
  tier: z.enum(['theme', 'tag']),
  theme: z.string().nullable(), // parent theme slug (null on themes)
  areaKey: z.string().nullable(), // matrix-area link (themes only)
  counts: z.object({
    paper: z.number(), software: z.number(), database: z.number(), dataset: z.number(), total: z.number(),
  }),
  tags: z.array(z.string()), // child fine-tag slugs (themes only; [] for tags)
});
export const TopicsDataSchema = z.object({
  themes: z.array(TopicNodeSchema),
  tags: z.array(TopicNodeSchema),
});
export type TopicNode = z.infer<typeof TopicNodeSchema>;
export type TopicsData = z.infer<typeof TopicsDataSchema>;

// ---------------------------------------------------------------------------
// The agent API's response bodies (site/public/api/*.json)
// ---------------------------------------------------------------------------

/**
 * These describe what `agent-api.ts` WRITES, as opposed to the models above, which
 * describe what the parser builds. Mostly the two coincide — a response is its model
 * plus `corpusDate` — but `index.json` and `matrix.json` are derived and had no schema
 * at all, which is how the API came to be both emitted unvalidated and consumed by
 * guesswork.
 *
 * They are `strictObject` at the top level so zod's own `.parse` rejects a stray key
 * rather than silently stripping it. Note what this does NOT do: `.strict()` does not
 * cascade into nested schemas, so it never protected an unknown key inside an array item.
 * Nor does it change the emitted JSON Schema — `z.toJSONSchema` writes
 * `additionalProperties: false` for a plain `z.object` just the same. Enforcement at
 * depth comes from validating against the emitted document with ajv; see `assertValid`
 * in openapi.ts, which explains why that is the check that counts.
 *
 * Everything here is GET of a static file: no request bodies, no parameters, no auth.
 */

/** Stamped onto every response so staleness is visible without a HEAD request. */
const CorpusDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One method×area cell, including the empty ones papers.json cannot express. */
export const ApiMatrixCellSchema = z.object({
  method: z.string(),
  area: z.string(),
  areaLabel: z.string(),
  refIds: z.array(z.number().int().positive()),
  /** true when no INDEXED paper occupies this cell (not: no such work exists) */
  emptyInCorpus: z.boolean(),
  /** present only on empty cells, so the recall caveat travels with the result */
  scope: z.string().optional(),
  /** present only on populated cells: what this placement does and does not assert */
  placement: z.string().optional(),
});

export const ApiMatrixSchema = z.strictObject({
  corpusDate: CorpusDateSchema,
  /** see ApiManifestSchema.status: pinned so a drift from agent-api's STATUS fails loudly */
  status: z.literal('beta'),
  /** the cell counts are firm; the classification over them is still being verified */
  placementsUnderReview: z.boolean(),
  methods: z.array(z.string()),
  areas: z.array(AreaSchema),
  totalCells: z.number().int().nonnegative(),
  populatedCells: z.number().int().nonnegative(),
  emptyCells: z.number().int().nonnegative(),
  scopeNote: z.string(),
  /** what a POPULATED cell asserts, as scopeNote bounds what an empty one asserts */
  placementNote: z.string(),
  cells: z.array(ApiMatrixCellSchema),
});

export const ApiManifestSchema = z.strictObject({
  name: z.string(),
  corpusDate: CorpusDateSchema,
  /**
   * Maturity, stated to the consumer rather than assumed. Pinned to the literal on
   * purpose: agent-api's STATUS is the value, and a literal here fails the parse loudly
   * if the two ever drift, rather than letting a silent change ship.
   */
  status: z.literal('beta'),
  /** the inventory counts are firm; the classification over them is still being verified */
  placementsUnderReview: z.boolean(),
  canonical: z.string(),
  site: z.string(),
  license: z.string(),
  scopeNote: z.string(),
  /** relative path to the OpenAPI description of every endpoint below */
  openapi: z.string(),
  /** what a POPULATED cell asserts, as SCOPE_NOTE bounds what an empty one asserts */
  placementNote: z.string(),
  /** Each key names the POPULATION it counted — see buildManifest. */
  counts: z.strictObject({
    papersAllSections: z.number().int().nonnegative(),
    papersBySection: z.record(z.string(), z.number().int().nonnegative()),
    papersMatrixEligible: z.number().int().nonnegative(),
    matrixTotalCells: z.number().int().nonnegative(),
    matrixPopulatedCells: z.number().int().nonnegative(),
    matrixEmptyCells: z.number().int().nonnegative(),
    software: z.number().int().nonnegative(),
    databases: z.number().int().nonnegative(),
    catalogTotal: z.number().int().nonnegative(),
    datasetsCurated: z.number().int().nonnegative(),
    datasetsInventoryRows: z.number().int().nonnegative(),
    /** the two above, which are disjoint and exhaustive — == the library total */
    datasetsTotal: z.number().int().nonnegative(),
  }),
  endpoints: z.array(z.strictObject({ path: z.string(), use: z.string() })),
});

export const ApiPapersSchema = PapersDataSchema.extend({
  scopeNote: z.string(),
  corpusDate: CorpusDateSchema,
}).strict();

export const ApiCatalogSchema = CatalogSchema.extend({
  corpusDate: CorpusDateSchema,
}).strict();

/* ---------------------------------------------------------------------------
   The compact indexes.

   `papers.json` is 554 KB served and `catalog.json` 576 KB. Both are correct and
   complete, and both are past what a fetch tool that converts a page to text and
   summarises it will carry — which is the common shape of an agent's only HTTP tool.
   The failure is not an error. Two agents given nothing but the published skill were
   measured reporting "No matches found" for terms that are in the corpus, "Total
   database entries: 0" against 150, and a named section as absent when it exists.
   A confident false negative from a complete endpoint is worse than a 404.

   So each large endpoint gains a small sibling carrying one row per item: enough to
   answer "what is indexed, how is it filed, and which full record do I now want",
   and nothing whose absence changes an answer. Measured against the live corpus,
   84 KB and 49 KB against 554 KB and 576 KB.

   What is deliberately NOT here, because each is what made the parent large:
   `raw` (102 KB of formatted citations), `authors`/`authorsText` (72 KB — the index
   carries `firstAuthor`, which is what a citation label needs), `topics` (44 KB, and
   already inverted in topics.json, which is the endpoint for subject questions), and
   the catalog's `summary`/`summaryHtml` (329 KB, the same prose twice).

   These are additive. The full endpoints are unchanged, and an agent that can read
   them should still prefer them. */

/** One reference, reduced to what selects it. */
export const ApiPaperIndexRowSchema = z.strictObject({
  id: z.number().int(),
  title: z.string(),
  year: z.number().int().nullable(),
  /** Enough for an author-year label; the full list is in papers.json. */
  firstAuthor: z.string().nullable(),
  section: z.string(),
  /** True only for the matrix-eligible population. See the note on the endpoint. */
  isPrimary: z.boolean(),
  methods: z.array(z.string()),
  areas: z.array(z.string()),
  doi: z.string().nullable(),
  hasCode: z.boolean(),
  hasData: z.boolean(),
});

export const ApiPapersIndexSchema = z.strictObject({
  corpusDate: CorpusDateSchema,
  /** Stated before the rows so it survives a truncation that eats the tail. */
  count: z.number().int(),
  scopeNote: z.string(),
  truncationNote: z.string(),
  /** States the trap this endpoint exists to make visible. Prose, so it reaches an agent. */
  matrixNote: z.string(),
  references: z.array(ApiPaperIndexRowSchema),
});

/** One catalogue item, reduced to what selects it. */
export const ApiCatalogIndexRowSchema = z.strictObject({
  slug: z.string(),
  name: z.string(),
  kind: z.enum(['software', 'database']),
  group: z.string(),
  url: z.string().nullable(),
  doi: z.string().nullable(),
  tier: z.string().nullable(),
});

export const ApiCatalogIndexSchema = z.strictObject({
  corpusDate: CorpusDateSchema,
  count: z.number().int(),
  truncationNote: z.string(),
  entries: z.array(ApiCatalogIndexRowSchema),
});

export const ApiDatasetsSchema = DatasetsDataSchema.extend({
  inventory: z.array(DatasetInventoryRowSchema),
  corpusDate: CorpusDateSchema,
}).strict();

/** topic slug → the ids of every item carrying it, per content type. */
export const ApiTopicIndexEntrySchema = z.strictObject({
  /** reference ids */
  papers: z.array(z.number().int().positive()),
  /** catalog slugs */
  software: z.array(z.string()),
  databases: z.array(z.string()),
  /** frozen ds: ids */
  datasets: z.array(z.string()),
});

/**
 * The endpoint whose shape was guessed wrong: the theme→tag tree is under `tree`, and
 * the inverted index under `index`. There is no top-level `themes` or `tags`.
 */
export const ApiTopicsSchema = z.strictObject({
  tree: TopicsDataSchema,
  index: z.record(z.string(), ApiTopicIndexEntrySchema),
  corpusDate: CorpusDateSchema,
});

export const ApiTaxonomySchema = TaxonomyDataSchema.extend({
  corpusDate: CorpusDateSchema,
}).strict();

export type ApiManifest = z.infer<typeof ApiManifestSchema>;
export type ApiMatrix = z.infer<typeof ApiMatrixSchema>;

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
