# CAAIL

CAAIL is a curated library of resources at the intersection of cellular agriculture and
AI. This file names the concepts the curation is built from. It is a glossary and nothing
else: the **scope** of any individual matrix row or column lives in
[`Taxonomy.md`](./Taxonomy.md), which is the trusted definition source, and is never
restated here. `ResearchAreas/*.md` and `Methods/*.md` are prose deep dives and are
explicitly not a definition source.

Decisions about how these concepts relate live on the tracker, not in this repository: a
decision record is not library documentation. This file describes the repository as it is
**today**, not as a decision intends it to become. Where the two differ, the entry says so
plainly; it does not name a ticket, because the tracker is private and a key would resolve
for nobody reading this. That is a rule about **this file's entries**, not a sweep: the tree
carries many tracker keys in comments and commit messages, where they are useful to whoever
can resolve them, and whether an always-loaded public file should carry them is a separate
argument that belongs on the tracker rather than here. A glossary that states a decided end-state as present fact tells a
reader the work is already done.

**Every count below is a snapshot taken 2026-08-20, except where a line carries its own later date.** Their source is `site/db/ndjson/`, with one exception: the number of pages in `ResearchAreas/` is a filesystem count that no NDJSON file carries, so a disagreement about that one is settled against the directory rather than the DB. Not by a bare `ls`, which returns nine: the figure counts PUBLISHED pages, and `isPublishedMarkdown` drops `CLAUDE.md` and any `*.local.md` beside them. `areas.ndjson`,
`topics.ndjson`, `item_topics.ndjson` and `matrix_cells.ndjson` are the source of truth: where a
number here disagrees with them, they are right and this file is stale. **No one command prints
all of these.** `pnpm --dir site db:check` prints the theme assertions, including that there are
exactly eight; `pnpm --dir site parse` prints the headline totals but not the 230 matrix-eligible
subset, nor any theme or `area_key` count. Read `parse`'s output carefully: its `researchAreas`
figure counts files in `ResearchAreas/` and is **not** the number of research areas as defined
below, which is the matrix columns in `areas.ndjson`. Both are 8 as of 2026-08-25, and that is the
bijection holding rather than the two being the same measurement. They can diverge, and
**only one direction is guarded**: `db:check` fails if a column has no page, and says nothing
about an extra page that names no column. A ninth non-column file in `ResearchAreas/` passes
`db:check`; what catches it is `counts.test.ts`'s literal and `caail-pages.test.ts`. Read the
four files rather than either figure.

## Language

### The matrix

**Matrix**:
The two-dimensional table at the top of `Papers.md` pairing an AI/ML method with a
cellular-agriculture research area.
_Avoid_: grid, map, table

**Method**:
A row of the matrix: a family of AI/ML techniques.
_Avoid_: technique, model class, algorithm, approach

**Research area**:
A column of the matrix. Usually the cellular-agriculture problem a paper's method is
demonstrated on, with `AI Tooling / Methodology` as the deliberate exception: it holds
general methods, agents and tools not yet tied to an applied cell-ag result. Read each
column's actual boundary from `Taxonomy.md` rather than from this sentence. Distinct from a
subject theme, which spans research areas and every content type.
_Avoid as a synonym_: domain, sector, field, application area. The last of those is banned only
in this sense: it is the live name for the `Software.md` and `Databases.md` groupings, so keep
using it there.

**Cell**:
The intersection of one method and one research area, holding anchor links to references.

**Placement**:
The assignment of one reference to one cell, justified from that paper's own methods text.
_Avoid_: classification (when naming the result rather than the act), tagging, mapping

**Matrix-eligible reference**:
A reference in `Papers.md`'s `## References` section, the only section whose entries take
matrix cells. Reviews & Perspectives and the four reference-work sections are not
matrix-eligible.
_Avoid_: paper (ambiguous: 346 references exist and 230 are matrix-eligible, so an
unqualified count is always the wrong number)

### The subject axis

**Subject theme**:
One of the eight top-level browse subjects, spanning every content type (papers, datasets,
software, databases). A theme spans content types the matrix cannot hold, so its population is
larger than its research area's for every joined pair today. Read that as a measurement rather
than an invariant, and note it holds only over the **whole** population: on the matrix-eligible
subset the direction has already reversed, since `Scaffolding & Biomaterials` tags 10 matrix
papers where the `Scaffolding` column holds 12. Either way the two counts are not comparable.
_Avoid_: category, area, subject area

**Fine tag**:
An earned second-tier topic sitting under exactly one theme, minted only once at least
three items cluster. Stored as `tier='tag'` (never `'fine'`), with its parent in `theme_slug`.
_Avoid_: subtag, subtopic

**Topic**:
The umbrella term covering both themes and fine tags. Never a synonym for either alone.

**Cross-cutting subject**:
A subject that spans research areas rather than naming one. The class is **empty**:
`Metabolism & Modeling` and `Food Safety` were given the columns they were missing, so every
theme now names a research area. The term is kept because it explains why the taxonomy is shaped
as it is, not because anything is filed under it.

Adding a cross-cutting theme is therefore a deliberate reopening of a settled decision rather than a quiet
addition, and that is now enforced rather than asked for: `db:check` requires every theme to carry
a non-null `area_key`, so such a theme fails the build. It separately guards the theme *list*
against `THEME_SLUGS`, so a ninth theme cannot appear unnoticed either.

### Joining the axes

**area_key**:
The stored link from a subject theme to its research area, and the single joint between the
two axes. Correspondence between the axes is **read** from this key and never from a shared
label. Note the asymmetry, which is a trap rather than a nicety: the key is **populated** by a
label lookup in `seedTopics`, which returns `null` silently when no area label matches, so a
label still has to match exactly at seed time even though nothing downstream reads one. Two
`db:check` assertions now cover that seam — every theme must carry a key, and the seed constant
must reproduce the committed themes on label *and* key — because a stale label there re-mints a
theme under its old name with a valid key, which the first assertion alone would not catch.

**The join is total.** Each of the eight themes reaches one of the eight research areas, and each
research area has exactly one `ResearchAreas/` deep-dive page hanging off it rather than off the
theme (`RESEARCH_AREA_SLUG`). The bijection is the live state rather than a target, and
`db:check`'s `checkAxisBijection` is what holds it there.

**Deep-dive page**:
A hand-authored prose overview of one axis member: `ResearchAreas/<Area>.md` for a research
area, `Methods/<Method>.md` for a method. Editorial, AI-assisted, and not a definition
source.
_Avoid_: area page, docs page

### Naming convention

A research area's label should read as a **problem** (`Media Optimization`, `Sensory
Prediction`, `Cellular Engineering`). A subject theme's label should read as an **`&`-joined
subject** (`Media & Growth Factors`, `Sensory & Flavor`, `Cell Lines & Engineering`). This
convention **binds new labels rather than describing the existing ones**, and neither half
holds across the live set: `Scaffolding` and `AI Tooling / Methodology` are columns naming no
problem, `Food Safety` is a theme carrying no `&`, and `Bioprocess & Scale-Up` is an
`&`-joined column. Where it does hold, the difference is deliberate and load-bearing, because it
is the only cue a reader has that two similar names denote different populations.

**No label is shared across the axes any more.** `Bioprocess & Scale-Up` names the research
area and the theme is `Bioprocess & Manufacturing`, so `Taxonomy.md` carries two distinct
`###` headings rather than one collision. Re-read that from `topics.ndjson` and `Taxonomy.md`
rather than from here. The slug did not move with the label: `topic:bioprocess-scale-up` is a
frozen id and its slug is what `/topics/?t=<slug>` and `api/topics.json` serve, so label and
slug diverge permanently and that mismatch is intended rather than drift to repair.
