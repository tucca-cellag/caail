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
  /** One-line description — the first paragraph after the H3 (Software.md's
   *  leading `Summary:` label is stripped; Databases.md's first paragraph is
   *  used verbatim). May be empty if no paragraph follows the heading. */
  summary: z.string(),
});

export const TalkSchema = z.object({
  /** List-item link text, e.g. "Multus Biotechnology: AI-driven media optimization" */
  title: z.string(),
  /** Full YouTube watch/short URL */
  url: z.string().url(),
  /** 11-character YouTube video id extracted from the URL */
  videoId: z.string(),
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
 * Schema for talks.json — curated YouTube videos from OtherResources.md.
 */
export const TalksSchema = z.object({
  talks: z.array(TalkSchema),
});

/**
 * Schema for counts.json — aggregate stats across all canonical content files.
 */
export const CountsSchema = z.object({
  papers: z.number().int().nonnegative(),
  software: z.number().int().nonnegative(),
  databases: z.number().int().nonnegative(),
  species: z.number().int().nonnegative(),
  researchAreas: z.number().int().nonnegative(),
  talks: z.number().int().nonnegative(),
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
export type Talk = z.infer<typeof TalkSchema>;
export type Talks = z.infer<typeof TalksSchema>;
