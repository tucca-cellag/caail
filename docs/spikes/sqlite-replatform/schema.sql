-- CAAIL SQLite re-platform — proof-of-concept schema (issue #78).
--
-- THROWAWAY SPIKE ARTIFACT. Not wired into site/'s build; not the final schema.
-- It exists to de-risk the ADR's decisions against real data. The final DDL
-- ships with the migration PR after the ADR is approved.
--
-- Design: class-table inheritance. A thin universal `items` registry owns the
-- cross-cutting concerns (topic tagging, cross-content joins); one detail table
-- per content type FK's back to it. IDs are namespaced frozen slugs assigned
-- once and stored (papers keep their numeric public anchor as the local part).

PRAGMA foreign_keys = ON;

-- Universal item registry (class-table-inheritance parent) --------------------
CREATE TABLE items (
  id    TEXT PRIMARY KEY,   -- namespaced frozen slug: 'paper:249','sw:alphafold','db:geo','ds:cattlegtex','topic:metabolic-modeling'
  type  TEXT NOT NULL CHECK (type IN ('paper','software','database','dataset','topic')),
  slug  TEXT NOT NULL       -- local part (numeric string for papers)
);

-- Papers detail ---------------------------------------------------------------
-- `raw` is the full citation markdown INCLUDING the <a id="N"> anchor; the APA
-- fields (authors/year/title/journal/doi) and the slug are DERIVED at parse
-- time, so they are not stored (single source of truth = raw).
CREATE TABLE papers (
  item_id   TEXT PRIMARY KEY REFERENCES items(id),
  ref_id    INTEGER NOT NULL UNIQUE,   -- numeric public anchor id (never renumbered)
  section   TEXT NOT NULL,             -- '## <section>' the ref lives under
  raw       TEXT NOT NULL,
  code_url  TEXT,
  data_url  TEXT,
  ordinal   INTEGER NOT NULL           -- document order (stable emit)
);

-- Matrix axes -----------------------------------------------------------------
CREATE TABLE areas   (key   TEXT PRIMARY KEY, label TEXT NOT NULL, ordinal INTEGER NOT NULL);
CREATE TABLE methods (label TEXT PRIMARY KEY, ordinal INTEGER NOT NULL);

-- Matrix cell membership: one row per (method × area) citation, ordered within
-- the cell. A cell exists only when it cites >=1 ref.
CREATE TABLE matrix_cells (
  method   TEXT NOT NULL REFERENCES methods(label),
  area_key TEXT NOT NULL REFERENCES areas(key),
  ref_id   INTEGER NOT NULL REFERENCES papers(ref_id),
  label    TEXT NOT NULL,              -- link display text ('Ndahiro 2025')
  ordinal  INTEGER NOT NULL,           -- global order (reproduces cell + within-cell order)
  PRIMARY KEY (method, area_key, ref_id)
);

-- Catalog detail (Software.md + Databases.md share one table; type on items) --
-- `body_md` is the raw entry-body markdown; summary/summaryHtml are DERIVED.
CREATE TABLE catalog (
  item_id  TEXT PRIMARY KEY REFERENCES items(id),
  name     TEXT NOT NULL,
  url      TEXT NOT NULL,
  grp      TEXT NOT NULL,              -- H2 group label (seeds a topic via aliases)
  body_md  TEXT NOT NULL,
  ordinal  INTEGER NOT NULL
);

-- Dataset inventory rows promoted to first-class records ----------------------
CREATE TABLE dataset_rows (
  item_id    TEXT PRIMARY KEY REFERENCES items(id),
  page       TEXT NOT NULL,            -- species page ('Cow')
  cells_json TEXT NOT NULL,            -- inventory-table row cells (ordered), JSON array of markdown strings
  ordinal    INTEGER NOT NULL
);

-- Topic vocabulary (flat subject tags; optional link to a matrix area) --------
CREATE TABLE topics (
  item_id   TEXT PRIMARY KEY REFERENCES items(id),   -- 'topic:metabolic-modeling'
  slug      TEXT NOT NULL UNIQUE,
  label     TEXT NOT NULL,
  area_key  TEXT REFERENCES areas(key)               -- NULL = cross-cutting / no matrix column
);

-- Many-to-many tagging (the multi-tag join #78 exists to enable) --------------
CREATE TABLE item_topics (
  item_id   TEXT NOT NULL REFERENCES items(id),
  topic_id  TEXT NOT NULL REFERENCES items(id),
  PRIMARY KEY (item_id, topic_id)
);

-- Alias map: existing per-type category string -> topic (auto-tag on ETL) -----
CREATE TABLE aliases (
  alias     TEXT PRIMARY KEY,          -- e.g. 'Metabolic Modeling & Strain Design'
  topic_id  TEXT NOT NULL REFERENCES items(id)
);
