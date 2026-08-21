# CAAIL

CAAIL is a curated library of resources at the intersection of cellular agriculture and
AI. This file names the concepts the curation is built from. It is a glossary and nothing
else: the **scope** of any individual matrix row or column lives in
[`Taxonomy.md`](./Taxonomy.md), which is the trusted definition source, and is never
restated here. `ResearchAreas/*.md` and `Methods/*.md` are prose deep dives and are
explicitly not a definition source.

Decisions about how these concepts relate live in [`docs/adr/`](./docs/adr/). This file
describes the repository as it is **today**, not as a decision intends it to become: where
the two differ, the entry says so and points at the ADR that closes the gap. A glossary
that states a decided end-state as present fact tells a reader the work is already done.

**Every count below is a snapshot taken 2026-08-20 from `site/db/ndjson/`.** `areas.ndjson`,
`topics.ndjson`, `item_topics.ndjson` and `matrix_cells.ndjson` are the source of truth: where a
number here disagrees with them, they are right and this file is stale. **No one command prints
all of these.** `pnpm --dir site db:check` prints the theme assertions, including that there are
exactly eight; `pnpm --dir site parse` prints the headline totals but not the 229 matrix-eligible
subset, nor any theme or `area_key` count. Read `parse`'s output carefully: its `researchAreas`
figure counts files in `ResearchAreas/`, currently 7, and is **not** the number of research areas
as defined below, which is the 6 matrix columns in `areas.ndjson`. For the rest, read the four
files.

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
_Avoid_: paper (ambiguous: 345 references exist and 229 are matrix-eligible, so an
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
A subject that spans research areas rather than naming one. Two themes are cross-cutting
today (`Metabolism & Modeling` and `Food Safety`), because neither has a research area to
name. ADR-0001 decides to empty the class by giving both a column, after which a new
cross-cutting theme becomes a deliberate reopening of that ADR. Until those columns land the
class has two members. `db:check` does guard the theme *list*, asserting it is exactly
`THEME_SLUGS`, so a ninth theme cannot appear unnoticed; what it does not do is require a
theme to carry an `area_key`, so an added theme may still be cross-cutting.

### Joining the axes

**area_key**:
The stored link from a subject theme to its research area, and the single joint between the
two axes. Correspondence between the axes is **read** from this key and never from a shared
label. Note the asymmetry, which is a trap rather than a nicety: the key is currently
**populated** by a label lookup in `seedTopics`, which returns `null` silently when no area
label matches, so a label still has to match exactly at seed time even though nothing
downstream reads one. The join is not yet total: two of the eight themes carry no key, so only
six reach a research area. A deep-dive page hangs off the research area rather than the theme
(`RESEARCH_AREA_SLUG`), and `ResearchAreas/` holds seven pages against six columns, because
`MetabolicModeling.md` has a page with no column. ADR-0001's target is a bijection (eight
themes, eight research areas, one deep-dive page each), reached by the two columns it adds.

**Deep-dive page**:
A hand-authored prose overview of one axis member: `ResearchAreas/<Area>.md` for a research
area, `Methods/<Method>.md` for a method. Editorial, AI-assisted, and not a definition
source.
_Avoid_: area page, docs page

### Naming convention

A research area's label should read as a **problem** (`Media Optimization`, `Sensory
Prediction`, `Cellular Engineering`). A subject theme's label should read as an **`&`-joined
subject** (`Media & Growth Factors`, `Sensory & Flavor`, `Cell Lines & Engineering`). Per
ADR-0001 this **binds new labels rather than describing the existing ones**, and neither half
holds across the live set: `Scaffolding` and `AI Tooling / Methodology` are columns naming no
problem, `Food Safety` is a theme carrying no `&`, and `Bioprocess & Scale-Up` is an
`&`-joined column. Where it does hold, the difference is deliberate and load-bearing, because it
is the only cue a reader has that two similar names denote different populations. One label is still shared across the axes:
`Bioprocess & Scale-Up` names both a research area and a theme, which is the collision
`Taxonomy.md` still carries as a duplicate `###` heading. ADR-0001 closes it by relabelling
the theme `Bioprocess & Manufacturing`.
