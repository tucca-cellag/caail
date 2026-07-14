-- CAAIL SQLite re-platform — production schema (issue #78).
--
-- The DB is the AUTHORING source of truth for CAAIL's structured catalog (papers +
-- matrix, software, databases, dataset inventory rows, topics). It is NOT in the
-- deploy build path: `pnpm build` still parses the committed, DB-generated canonical
-- Markdown. The git-tracked source is per-table PK-sorted NDJSON (site/db/*.ndjson);
-- site/caail.db is a gitignored build artifact rebuilt from the NDJSON.
--
-- Design: class-table inheritance. A thin universal `items` registry owns the
-- cross-cutting concerns (topic tagging, cross-content joins); one detail table per
-- content type FKs back to it. IDs are namespaced frozen slugs assigned once and
-- stored (papers keep their numeric public anchor as the local part). The DB stores
-- CONTENT only (raw citation markdown incl. the <a id> anchor, matrix cell membership,
-- entry body markdown, inventory cells); all derived fields (APA authors/year/title/
-- journal/doi, catalog summary/summaryHtml, slugs, methods/areas) are recomputed by
-- the existing parser at parse time, so the single source of truth stays the content.

PRAGMA foreign_keys = ON;

-- Universal item registry (class-table-inheritance parent) --------------------
CREATE TABLE items (
  id    TEXT PRIMARY KEY,   -- namespaced frozen slug: 'paper:249','sw:alphafold','db:geo','ds:cattlegtex','topic:metabolic-modeling'
  type  TEXT NOT NULL CHECK (type IN ('paper','software','database','dataset','topic')),
  slug  TEXT NOT NULL       -- local part (numeric string for papers)
);

-- Papers detail ---------------------------------------------------------------
-- `raw` is the full citation markdown INCLUDING the <a id="N"> anchor; the APA
-- fields (authors/year/title/journal/doi) and the slug are DERIVED at parse time,
-- so they are not stored (single source of truth = raw).
CREATE TABLE papers (
  item_id         TEXT PRIMARY KEY REFERENCES items(id),
  ref_id          INTEGER NOT NULL UNIQUE,   -- numeric public anchor id (never renumbered)
  section         TEXT NOT NULL,             -- '## <section>' the ref lives under
  raw             TEXT NOT NULL,
  -- Verbatim run of the `> …` blockquote block(s) trailing this citation (Code / Data /
  -- Models / any label), stored whole so the emitter reproduces them in place. (Typed
  -- code_url/data_url only modelled two labels, so an unmodelled `> **Models**:` used to
  -- float onto the wrong paper on re-emit.) The site parser still derives codeUrl/dataUrl
  -- from the emitted Markdown, so this is content, not a duplicated derived field.
  blockquotes_md  TEXT,
  ordinal         INTEGER NOT NULL           -- document order (stable emit)
);

-- Retired paper ref_ids: a tombstone so a removed paper's numeric anchor is NEVER
-- reused (matrix links + external bookmarks point at ref_ids by number). `removeItem`
-- records the id here; the next `addItem` takes MAX over papers AND this table, so a
-- freed number can't be handed to a different paper. Reachability/emit ignore it.
CREATE TABLE retired_paper_ids (
  ref_id INTEGER PRIMARY KEY
);

-- Matrix axes -----------------------------------------------------------------
-- `header_md` is the raw linked markdown of the axis header/row-label, e.g.
-- '[Media Optimization](./Taxonomy.md#media-optimization)'. It is stored verbatim
-- because the parser's short `key` ('media') is not the Taxonomy.md anchor
-- ('media-optimization'), and method labels carry no key at all — so the emitter
-- cannot reconstruct the header links and must preserve them from source.
CREATE TABLE areas   (key   TEXT PRIMARY KEY, label TEXT NOT NULL, header_md TEXT NOT NULL, ordinal INTEGER NOT NULL);
CREATE TABLE methods (label TEXT PRIMARY KEY, header_md TEXT NOT NULL, ordinal INTEGER NOT NULL);

-- Matrix cell membership: one row per (method × area) citation, ordered within
-- the cell. A cell exists only when it cites >=1 ref.
CREATE TABLE matrix_cells (
  method   TEXT NOT NULL REFERENCES methods(label),
  area_key TEXT NOT NULL REFERENCES areas(key),
  ref_id   INTEGER NOT NULL REFERENCES papers(ref_id),
  label    TEXT NOT NULL,              -- link display text ('Ndahiro et al. 2025')
  ordinal  INTEGER NOT NULL,           -- global order (reproduces cell + within-cell order)
  PRIMARY KEY (method, area_key, ref_id)
);

-- Catalog detail (Software.md + Databases.md share one table; type on items) --
-- `heading_md` is the FULL raw H3 heading after '### ' (e.g. '[GNPS](url) (cross-listed)'),
-- emitted verbatim so trailing curator annotations survive; `name`/`url` are the parsed
-- link used for the frozen id + tally. `body_md` is the raw entry body; summary/summaryHtml
-- are DERIVED.
CREATE TABLE catalog (
  item_id    TEXT PRIMARY KEY REFERENCES items(id),
  name       TEXT NOT NULL,            -- inline markdown of the H3 link text (id/tally)
  url        TEXT NOT NULL,
  grp        TEXT NOT NULL,            -- H2 group label (seeds a topic via aliases)
  heading_md TEXT NOT NULL,            -- full H3 heading source after '### '
  body_md    TEXT NOT NULL,
  ordinal    INTEGER NOT NULL
);

-- Dataset inventory rows promoted to first-class records ----------------------
CREATE TABLE dataset_rows (
  item_id    TEXT PRIMARY KEY REFERENCES items(id),
  page       TEXT NOT NULL,            -- species page ('Cow')
  cells_json TEXT NOT NULL,            -- inventory-table row cells (ordered), JSON array of markdown strings
  ordinal    INTEGER NOT NULL
);

-- Topic vocabulary — two-tier: a fixed backbone of `theme`s + earned fine `tag`s.
-- `slug` is UNIQUE across BOTH tiers (one namespace), so a theme and a tag can never
-- share a slug. A theme: tier='theme', theme_slug NULL, optional area_key. A fine tag:
-- tier='tag', theme_slug = its parent theme. The compound CHECK enforces that invariant.
CREATE TABLE topics (
  item_id    TEXT PRIMARY KEY REFERENCES items(id),   -- 'topic:metabolism-modeling'
  slug       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  tier       TEXT NOT NULL CHECK (tier IN ('theme','tag')),
  theme_slug TEXT REFERENCES topics(slug),            -- set iff tier='tag'
  area_key   TEXT REFERENCES areas(key),              -- set only on themes aligned to a matrix column
  CHECK ((tier='theme' AND theme_slug IS NULL) OR (tier='tag' AND theme_slug IS NOT NULL))
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
