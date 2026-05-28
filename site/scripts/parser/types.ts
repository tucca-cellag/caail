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
  refIds: z.array(z.number().int()),
  /** Human link labels, e.g. ["Cosenza et al. 2022"] */
  labels: z.array(z.string()),
});

export const ReferenceSchema = z.object({
  /** Stable numeric ID — never renumbered after assignment */
  id: z.number().int(),
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
  codeUrl: z.string().nullable(),
  /** URL from `> **Data**:` blockquote; null if absent */
  dataUrl: z.string().nullable(),
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
