---
status: accepted
date: 2026-08-13
---

# The subject axes are distinct populations joined by a key, not one taxonomy seen twice

CAAIL carries two subject axes: the **matrix research areas** (columns of the `Papers.md`
matrix, spanning matrix-eligible references) and the **subject themes** (the browse
taxonomy, spanning papers, datasets, software and databases). GH #132 read the places
where the two disagreed as three gaps to close. We are closing them, but the model that
results is deliberately not "one taxonomy": the axes stay distinct populations with
distinct labels, joined by a single stored key (`area_key`). The target is a bijection:
eight themes, eight research areas, one research-area deep-dive page each, **to be** asserted
by `db:check`. That guard does not exist yet; see Implementation status.

That target is not the repository's current state, and this ADR is careful to say which
sentences describe which. **Implementation status** below lists what has landed and what
has not; the decision is accepted, the delivery is partial.

The **live** counts in this document were measured from `site/db/ndjson/` on 2026-08-20.
Re-measure them from `areas.ndjson`, `topics.ndjson`, `item_topics.ndjson` and
`matrix_cells.ndjson` rather than trusting them here: those are the source of truth, and a
number written into prose beside them is exactly the drift this repository's `CLAUDE.md`
calls its most expensive recurring bug.

The figures describing the matrix **before** the `AI Evaluation & Benchmarking` column was
retired are not in those files and cannot be re-measured from them: the `eval` key is gone
from both `areas.ndjson` and `matrix_cells.ndjson`. That covers the 23 references the column
held, its collapse to a single method row against 6 to 17 elsewhere, and `AI Tooling /
Methodology`'s starting 66. Read those against `0333b01f^`, the commit before the retirement,
and read every other number against the files above.

## Why the counts must not be read as one number

Every theme's population is larger than its research area's, because a theme spans content
types the matrix cannot hold, and the gap is not small: `Metabolism & Modeling` carries 104
distinct items (171 tag rows: 70 datasets, 40 software, 34 databases, 27 papers, counted with
its fine tag rolled in, so an item tagged both ways is one item and two rows). Ten of those
items are matrix-eligible references, making 13 placements across 12 cells. References,
placements and cells are three different counts, per `CONTEXT.md`, and two of those references
share a cell. The disagreement is not even one-directional: `Scaffolding & Biomaterials` tags 10 matrix papers while the `Scaffolding`
column holds 12, so the column contains papers the theme does not.

That is why the **labels must stay different**, as a convention this ADR establishes: a
research area should read as a problem (`Media Optimization`, `Sensory Prediction`) and a theme
as an `&`-joined subject (`Media & Growth Factors`, `Sensory & Flavor`). **The convention binds
new labels rather than describing the existing ones**, because neither half holds across the
live set: `Scaffolding` and `AI Tooling / Methodology` are columns naming no problem,
`Food Safety` is a theme carrying no `&`, and `Bioprocess & Scale-Up` is an `&`-joined *column*,
which is the pair this ADR relabels. Where it does hold it is the only cue a reader has that two
similar names count different things, and `/by-the-numbers/` renders both on one page. The one pair that already shares a label, `Bioprocess & Scale-Up`, is the one
pair that produced a bug: `Taxonomy.md` defines it twice and the theme blurb silently
overwrote the column's scope in `taxonomy.json`, so an auditor sent to read the column's
boundaries got two lines with none (GH #133, CAAIL-240). CAAIL-240 fixed the overwrite by
keying on axis; the duplicate heading and the shared label are both still there, and this ADR
resolves them by relabelling the theme `Bioprocess & Manufacturing`.

Correspondence is **read** from `area_key` and never from a shared label. A guard that compared
labels would pass exactly when the names matched and the populations diverged, which is the
failure it exists to catch.

The key is not yet **written** that way, and this is the sharpest trap in implementing this ADR.
`seedTopics` resolves a theme's `area_key` by looking the area up **by label**
(`SELECT key FROM areas WHERE label=?`, `site/scripts/db/seed.ts:222-223`) and falls back to `null`
on a miss without complaining. A theme's `area` field therefore has to carry the column's label
character for character. Since this ADR requires theme and area labels to *differ*, that lookup
is the one place the two axes still meet by name, and getting it wrong is silent in every
direction that matters: the theme keeps `area_key: null`, it is left out of the `areaToTheme` map
(`seed.ts:244`), every matrix cell in that area is then skipped at `seed.ts:247` so its papers go
untagged, and `db:check` passes because it validates only non-null keys.
Whoever lands the two columns should pass the area **key** rather than the label, or make the
miss throw. Doing neither leaves the bijection resting on two strings agreeing.

## What has to change to reach the bijection

- **`AI Evaluation & Benchmarking` is retired as a column.** Its column definition and the
  `Benchmarks & Evaluation Frameworks` row definition were near-verbatim copies with matching
  out-of-scope clauses, so the cell was the intersection of a set with itself and the column
  collapsed to one method row against 6 to 17 elsewhere. The row survives; each of the 23
  references is re-placed into the area its benchmark measures. `ResearchAreas/AIEvaluation.md`
  migrates to `Methods/BenchmarksEvaluation.md`, the first member of a method deep-dive axis.
- **`Metabolic Modeling` and `Food Safety Prediction` are added as columns.** The second is
  named for the problem rather than after its theme, so it parallels `Sensory Prediction` and
  does not become a second identical-label pair over a tenfold population gap. **Both are
  required**: the bijection is eight themes against eight areas, so landing one of the two
  leaves the other's theme without an `area_key` and the model unreached.
- **`benchmarks-evaluation` stays a fine tag** under `AI Methods & Tooling`. Promoting it
  would make nine themes against eight areas and reopen the mismatch from the other side.
- **`counts.json`'s `researchAreas` needs no relabel.** It is derived from the file count in
  `ResearchAreas/`, which reads 7: the `AIEvaluation.md` migration already moved it off 8, and
  it exceeds the 6 columns by one because `MetabolicModeling.md` has a page but no column.
  Adding `FoodSafetyPrediction.md` alongside the two columns moves it 7 to 8, where it means
  the column count rather than coinciding with it.

## Implementation status

**Landed.**

- The `AI Evaluation & Benchmarking` column is retired and its 23 references re-placed
  (PR #206). `areas.ndjson` holds 6 columns.
- `ResearchAreas/AIEvaluation.md` has migrated to `Methods/BenchmarksEvaluation.md`, and
  `/research-areas/aievaluation/` redirects to its new home in `astro.config.mjs`.
- `benchmarks-evaluation` remains a fine tag under `AI Methods & Tooling`.
- **`/by-the-numbers/` already labels the two axes**, saying themes are "a different axis from
  the N research areas above, not a renaming of them", and naming the area-less themes and the
  unthemed columns. It **derives** all three from the data (`MetricsDashboard.astro:53-56`,
  rendered at `:113-123`), so the sentence self-corrects as curation closes the gap. Do not
  re-implement it, and do not replace the derivation with a hardcoded list when the columns land.

**Not yet implemented.** Each of the following is a sentence this ADR would otherwise assert
as fact, and none of it is true today:

- **The bijection does not hold.** Live state is 8 themes, 6 research areas and 7 research-area
  deep-dive pages. (`CONTEXT.md` defines a deep-dive page as covering either axis, so the
  all-axes count is 8 including `Methods/BenchmarksEvaluation.md`; the bijection is about the
  research-area ones.) `Metabolism & Modeling` and `Food Safety` both carry `area_key: null`.
- **`db:check` asserts no bijection and no not-null `area_key`.** `checkTopicTiers` asserts
  only that a **non-null** `area_key` resolves to an existing area, so a theme is free to carry
  none. There is no assertion that every theme has one, that every column has exactly one theme,
  or that every column has a deep-dive page. Be precise about what this does *not* say: the
  theme **list** is already guarded, since `db:check` asserts the live themes are exactly
  `THEME_SLUGS`, so a ninth theme fails CI until someone edits that constant, which is a
  deliberate act. The missing guard is the narrower one this ADR leans on, that a theme must
  name a research area. Until it exists, a theme added through `THEME_SLUGS` can still be
  cross-cutting, and nothing objects.
- **The `Bioprocess & Scale-Up` theme has not been relabelled**, so one label is still shared
  across the axes and `Taxonomy.md` still carries it as a duplicate `###` heading.
- **The naming convention is not written into `Taxonomy.md`.** It exists only here and in
  `CONTEXT.md`.
- **No GFI crosswalk table exists in `Taxonomy.md`.** It is offered below as the mitigation for
  rejecting the GFI-facet option; it is a commitment, not a delivery.
- **The two cross-cutting prose statements have not been rewritten.** `Taxonomy.md` still
  describes both `Metabolism & Modeling` and `Food Safety` as "a cross-cutting subject with no
  single matrix column", and `ResearchAreas/MetabolicModeling.md` still opens by calling itself
  a cross-cutting methodology overview rather than a research area. Considered options below
  commits to rewriting both; neither is done.
- **`/topics/` does not say which axis a reader is looking at.** `TopicHub` never mentions the
  matrix, so a reader arriving there has no cue that themes are not the columns. `/by-the-numbers/`
  is **not** in this gap; see Landed above before touching it. That remaining absence is the live
  half of what let GH #132 read a deliberate design as three gaps.

Re-tighten each of these into present-tense fact in the change that lands it, not before.

## Considered options

**Sub-divide the `Benchmarks & Evaluation Frameworks` row** instead of retiring the column,
with CAAIL-52's eight-way split of the LLM row as precedent. Rejected: finer sub-rows of a row
that duplicates the column stay tautological, so it cannot fix the collapse it was aimed at,
and the corpus supports only a 20-against-3 split whose minority halves again.

**Explain the collapse as intended** and describe the matrix as five research-area columns plus
two columns of unapplied work. Rejected in favour of the bijection, which leaves no mismatch to
explain. The concept of an "unapplied column" was drafted for this option and is not adopted:
after the retirement, `AI Tooling / Methodology` spans 18 method rows and will pair with a
theme, so nothing about it is anomalous and the term would name a class of one.

**Keep both themes as cross-cutting subjects with no column**, which is what `Taxonomy.md` and
the opening paragraph of `ResearchAreas/MetabolicModeling.md` both said before this decision.
It is the more conservative reading and it is where the axis rule genuinely points, since a
metabolic-modeling paper's problem is usually media design or bioprocess yield and the model is
the technique. Rejected because it leaves two mismatches standing that readers do encounter, and
both prose statements are to be rewritten as the things that were wrong. The guard that makes a
future cross-cutting theme a deliberate reopening of this ADR rather than a quiet addition is
part of the same not-yet-implemented work.

**Adopt GFI's Alternative Protein Solutions facets as the column axis** (Production Platform,
Value Chain Segment, Technology Sector, End Product Focus, Relevant Actor, Maturity Level,
Solution Category, Topic). Rejected on a concrete count: none of the eight facets has a place for
a general AI method, and `AI Tooling / Methodology` holds 81 of the 229 matrix-eligible
references now that the retired column's are absorbed, so 35% of the matrix would be homeless.
Underneath that, GFI's facets answer "who should act on this gap" and CAAIL's column answers
"what did this paper demonstrate". A crosswalk table in `Taxonomy.md` is to map each column to
its nearest GFI sector and state the four gaps as gaps, which delivers the legibility without the
axis change. `Production Platform` (cultivated / fermentation / plant-based) remains attractive
as an additive DB-only facet, because the corpus genuinely mixes cultivated scaffolds with
plant-protein structuring and nothing records which, but it is a facet rather than a column: no
audit verdict depends on it, so it can land at any time.

## Consequences

- `AI Tooling / Methodology` grew from 66 distinct references to 81 when the retired column's
  references were re-placed, making the library's largest column larger still.
- The `Bioprocess & Manufacturing` relabel moves the **label only**. `topic:bioprocess-scale-up`
  is a frozen id and its `slug` is what `/topics/?t=<slug>` and `api/topics.json` carry, so the
  label and the slug diverge permanently. That is the intended trade, since changing the slug
  would break a public URL, but expect the mismatch rather than reading it as drift to repair.
- A retired column has no tombstone machinery (`retired_paper_ids` covers reference ids only),
  so `/research-areas/aievaluation/` gets a redirect to its new method-page home and the
  `Taxonomy.md` column anchor stops resolving. Judged acceptable rather than worth new schema.
- The bijection guard is to cover the **research-area axis only**. Extending it to the method
  axis would require all 25 method deep dives to exist, which would in turn block any new method
  row on writing a page.
- The freeze (CAAIL-151) must follow all of this, since retiring one column, adding two, and
  re-placing 23 references all move the counts a freeze would fix.
