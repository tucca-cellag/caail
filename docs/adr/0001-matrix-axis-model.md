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
distinct labels, joined by a single stored key (`area_key`) that `db:check` asserts is
bijective. Eight themes, eight research areas, one deep-dive page each.

## Why the counts must not be read as one number

Every theme's population is larger than its research area's, because a theme spans content
types the matrix cannot hold, and the gap is not small: `Metabolism & Modeling` carries 171
tag rows (70 datasets, 40 software, 34 databases, 27 papers) of which 10 are matrix-eligible
placements. The disagreement is not even one-directional: `Scaffolding & Biomaterials` tags
10 matrix papers while the `Scaffolding` column holds 12, so the column contains papers the
theme does not.

That is why the **labels stay different**, as a convention now written into `Taxonomy.md`: a
research area reads as a problem (`Media Optimization`, `Sensory Prediction`), a theme reads
as an `&`-joined subject (`Media & Growth Factors`, `Sensory & Flavor`). It is the only cue a
reader has that two similar names count different things, and `/by-the-numbers/` renders both
on one page. The one pair that already shared a label, `Bioprocess & Scale-Up`, is the one
pair that produced a bug: `Taxonomy.md` defined it twice and the theme blurb silently
overwrote the column's scope in `taxonomy.json`, so an auditor sent to read the column's
boundaries got two lines with none (GH #133, CAAIL-240). The theme is therefore relabelled
`Bioprocess & Manufacturing`, and no label is now shared across axes.

Correspondence is carried by `area_key` and never inferred from a shared label. A guard that
compared labels would pass exactly when the names matched and the populations diverged, which
is the failure it exists to catch.

## What changed to reach the bijection

- **`AI Evaluation & Benchmarking` is retired as a column.** Its column definition and the
  `Benchmarks & Evaluation Frameworks` row definition were near-verbatim copies with matching
  out-of-scope clauses, so the cell was the intersection of a set with itself and the column
  collapsed to one method row against 6 to 17 elsewhere. The row survives; each of the 23
  references is re-placed into the area its benchmark measures. `ResearchAreas/AIEvaluation.md`
  migrates to `Methods/BenchmarksEvaluation.md`, the first member of a method deep-dive axis.
- **`Metabolic Modeling` and `Food Safety Prediction` are added as columns.** The second is
  named for the problem rather than after its theme, so it parallels `Sensory Prediction` and
  does not become a second identical-label pair over a tenfold population gap.
- **`benchmarks-evaluation` stays a fine tag** under `AI Methods & Tooling`. Promoting it
  would make nine themes against eight areas and reopen the mismatch from the other side.
- **`counts.json`'s `researchAreas` needs no relabel.** It is derived from the file count in
  `ResearchAreas/`, and adding `FoodSafetyPrediction.md` keeps it at 8 while making the number
  mean the column count rather than coincide with it.

## Considered options

**Sub-divide the `Benchmarks & Evaluation Frameworks` row** instead of retiring the column,
with CAAIL-52's eight-way split of the LLM row as precedent. Rejected: finer sub-rows of a row
that duplicates the column stay tautological, so it cannot fix the collapse it was aimed at,
and the corpus supports only a 20-against-3 split whose minority halves again.

**Explain the collapse as intended** and describe the matrix as five research-area columns plus
two columns of unapplied work. Rejected in favour of the bijection, which leaves no mismatch to
explain. The concept of an "unapplied column" was drafted for this option and is not adopted:
after the retirement, `AI Tooling / Methodology` spans 17 method rows and pairs with a theme, so
nothing about it is anomalous and the term would name a class of one.

**Keep both themes as cross-cutting subjects with no column**, which is what `Taxonomy.md` and
the opening paragraph of `ResearchAreas/MetabolicModeling.md` both said before this decision.
It is the more conservative reading and it is where the axis rule genuinely points, since a
metabolic-modeling paper's problem is usually media design or bioprocess yield and the model is
the technique. Rejected because it leaves two mismatches standing that readers do encounter, and
both prose statements are rewritten here as the things that were wrong. `db:check` now rejects a
theme without a research area, so a future cross-cutting theme is a deliberate reopening of this
ADR rather than a quiet addition.

**Adopt GFI's Alternative Protein Solutions facets as the column axis** (Production Platform,
Value Chain Segment, Technology Sector, End Product Focus, Relevant Actor, Maturity Level,
Solution Category, Topic). Rejected on a concrete count: none of the eight facets has a place for
a general AI method, and `AI Tooling / Methodology` holds roughly 89 references once the retired
column's are absorbed, so 40% of the matrix would be homeless. Underneath that, GFI's facets
answer "who should act on this gap" and CAAIL's column answers "what did this paper demonstrate".
A crosswalk table in `Taxonomy.md` maps each column to its nearest GFI sector and states the four
gaps as gaps, which delivers the legibility without the axis change. `Production Platform`
(cultivated / fermentation / plant-based) remains attractive as an additive DB-only facet,
because the corpus genuinely mixes cultivated scaffolds with plant-protein structuring and
nothing records which, but it is a facet rather than a column: no audit verdict depends on it, so
it can land at any time.

## Consequences

- `AI Tooling / Methodology` grows from 66 distinct references to roughly 89, making the
  library's largest column larger still.
- A retired column has no tombstone machinery (`retired_paper_ids` covers reference ids only),
  so `/research-areas/aievaluation/` gets a redirect to its new method-page home and the
  `Taxonomy.md` column anchor stops resolving. Judged acceptable rather than worth new schema.
- The bijection guard covers the **research-area axis only** for now. Extending it to the method
  axis would require all 25 method deep dives to exist, which would in turn block any new method
  row on writing a page.
- The freeze (CAAIL-151) must follow all of this, since retiring one column, adding two, and
  re-placing 23 references all move the counts a freeze would fix.
