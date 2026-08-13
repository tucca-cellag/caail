# CAAIL

CAAIL is a curated library of resources at the intersection of cellular agriculture and
AI. This file names the concepts the curation is built from. It is a glossary and nothing
else: the **scope** of any individual matrix row or column lives in
[`Taxonomy.md`](./Taxonomy.md), which is the trusted definition source, and is never
restated here. `ResearchAreas/*.md` and `Methods/*.md` are prose deep dives and are
explicitly not a definition source.

Decisions about how these concepts relate live in [`docs/adr/`](./docs/adr/).

## Language

### The matrix

**Matrix**:
The two-dimensional table at the top of `Papers.md` pairing an AI/ML method with a
cellular-agriculture research area.
_Avoid_: grid, map, table

**Method**:
A row of the matrix: a family of AI/ML technique.
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
_Avoid_: subtag, subtopic, label

**Topic**:
The umbrella term covering both themes and fine tags. Never a synonym for either alone.

**Cross-cutting subject**:
A subject that spans research areas rather than naming one. The term is retained because
it explains the shape of the taxonomy's history, but it now has **no members**, and a
theme without a research area is rejected by `db:check`. See ADR-0001.

### Joining the axes

**area_key**:
The stored link from a subject theme to its research area. It is the single joint between
the two axes, and it is bijective: eight themes, eight research areas, one deep-dive page
each. Correspondence between the axes is always carried by this key and never inferred
from a shared label.

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
similar names denote different populations. No label is shared between the two axes.
