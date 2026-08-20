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
A column of the matrix: the cellular-agriculture problem a paper's method is demonstrated
on. Distinct from a subject theme, which spans research areas and every content type.
_Avoid_: domain, application area, sector, field

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
software, databases). A theme's population is therefore always larger than its research
area's, and the two counts are not comparable.
_Avoid_: category, area, subject area

**Fine tag**:
An earned second-tier topic sitting under exactly one theme, minted only once at least
three items cluster.
_Avoid_: subtag, subtopic

**Topic**:
The umbrella term covering both themes and fine tags. Never a synonym for either alone.

**Cross-cutting subject**:
A subject that spans research areas rather than naming one. Two themes are cross-cutting
today (`Metabolism & Modeling` and `Food Safety`), because neither has a research area to
name. ADR-0001 decides to empty the class by giving both a column, after which a new
cross-cutting theme becomes a deliberate reopening of that ADR. Until those columns land
the class has two members, and nothing rejects a theme that has no research area.

### Joining the axes

**area_key**:
The stored link from a subject theme to its research area, and the single joint between the
two axes. Correspondence between the axes is always carried by this key and never inferred
from a shared label. The join is not yet total: eight themes point at six research areas
and seven deep-dive pages, and two themes carry no key at all. ADR-0001's target is a
bijection (eight themes, eight research areas, one deep-dive page each), reached by the two
columns it adds.

**Deep-dive page**:
A hand-authored prose overview of one axis member: `ResearchAreas/<Area>.md` for a research
area, `Methods/<Method>.md` for a method. Editorial, AI-assisted, and not a definition
source.
_Avoid_: area page, docs page

### Naming convention

A research area's label reads as a **problem** (`Media Optimization`, `Sensory
Prediction`, `Cellular Engineering`). A subject theme's label reads as an **`&`-joined
subject** (`Media & Growth Factors`, `Sensory & Flavor`, `Cell Lines & Engineering`). The
difference is deliberate and load-bearing: it is the only cue a reader has that two
similar names denote different populations. One label is still shared across the axes:
`Bioprocess & Scale-Up` names both a research area and a theme, which is the collision
`Taxonomy.md` still carries as a duplicate `###` heading. ADR-0001 closes it by relabelling
the theme `Bioprocess & Manufacturing`.
