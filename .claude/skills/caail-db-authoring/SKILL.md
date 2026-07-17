---
name: caail-db-authoring
description: Use when adding, editing, or removing a paper, software tool, database, dataset inventory row, or curated dataset entry (atlas/GEM/reference) in CAAIL — the structured catalog is authored in an in-repo SQLite DB (issue #78) and the canonical Markdown (Papers.md, Software.md, Databases.md, and the Datasets/*.md inventory tables + curated ### entries) is generated from it. Covers the edit-DB → export → emit → check → commit workflow. The DB-era successor to hand-editing the matrix and catalog files.
---

# Authoring CAAIL's structured catalog via the SQLite DB

## Overview

CAAIL's **structured catalog** — the `Papers.md` matrix + references, the `Software.md`
and `Databases.md` entries, and the `Datasets/*.md` inventory tables + curated `### …` entries
(featured atlases, GEMs, reference entries) — is authored in an in-repo SQLite database and
**generated** back to Markdown. The DB is the source of truth; those Markdown regions are derived
and must not be hand-edited (a PreToolUse hook blocks structured edits; the CI sync guard fails on drift).

The DB is **authoring-time only** — it never runs in the deploy build. `pnpm build` still
parses the committed Markdown into `data/*.json`. This skill is the *workflow* for changing
the catalog; it does not restate schema rules — `CLAUDE.md` (the "SQLite authoring backend"
section + the `Papers.md` schema) is the source of truth for those.

Editorial **prose** (page intros, `## Category definitions`, group intros, dataset
narrative, `## Further reading`, the `> Note` blockquotes) stays hand-authored — `db:emit`
preserves it verbatim from the file. Only the structured blocks are regenerated. The
non-catalog files (`OtherResources.md`, `ReferenceWorks.md`, `AwesomeLists.md`, `Funding.md`,
`ResearchAreas/`, `Talks.md`, `Primers/`) are not DB-owned; edit them directly.

The mechanical steps are scripted; the judgment — which cells a paper belongs in, how to
classify a tool, whether a citation is faithful — is not, and is where it goes wrong. Route
every new/changed entry through the read-only reviewer subagents (`caail-citation-reviewer`,
`caail-claim-reviewer`, `caail-classification-reviewer`) before commit, exactly as the
Markdown-era workflow did.

## What lives where

| Content | `items.type` | frozen id | detail table(s) | generated file |
| --- | --- | --- | --- | --- |
| Paper (primary + review) | `paper` | `paper:N` (N = next ref id) | `papers`, `matrix_cells` | `Papers.md` |
| Software tool | `software` | `sw:<slug>` | `catalog` | `Software.md` |
| Database / lookup resource | `database` | `db:<slug>` | `catalog` | `Databases.md` |
| Dataset inventory row | `dataset` | `ds:<slug>` | `dataset_rows` | `Datasets/<page>.md` |
| Dataset curated entry (atlas / GEM / reference) | `dataset` | `ds:<slug>` | `dataset_entries` | `Datasets/<page>.md` |
| Topic (subject tag) | `topic` | `topic:<slug>` | `topics`, `item_topics`, `aliases` | — (surfaced as card chips + the `/topics/` hub) |

A `dataset` item is an inventory row **or** a curated entry, never both (they share the `ds:` id
namespace; `db:check` enforces exactly-one). A curated entry is any `### …` heading outside
`## Complete data inventory` — the featured atlases + GEMs (species pages) and every reference-page
entry. It carries `section` + `kind` (atlas/gem/other); its `url` is nullable (unlinked GEM headings).
Entries are topic-tagged, rendered as `.ds-card`s with chips on `/datasets/<page>/`, and appear as
linkable items in the `/topics/` hub; inventory rows stay count-only.

**Licenses** are a coarse DB-owned tier axis (permissive/copyleft/restricted/unknown), NOT a table:
`catalog` + `dataset_entries` carry `license` + `license_source` (`auto`|`manual`). Like topics they
are DB-only (not in Markdown) and fold into the site JSON; the tier is derived at parse. To set one:
add a curator override to `site/scripts/db/licenses-manual.json` (catalog by url, datasets by ds: id;
`manual` wins over the GitHub-SPDX `license-cache.json`) then fold with **`db:reseed-axes`**, OR run
the opt-in `db:fetch-licenses` (GITHUB_TOKEN) to refresh the auto SPDX cache then `db:reseed-axes`.
**Never guess a license** — GitHub NOASSERTION and unverified data-use terms stay `unknown`. A reseed
reconciles adds, edits, and removals; `db:check` flags a manual override url that resolves to no entry
(a typo'd key is otherwise a silent no-op). Surfaced as a corner badge, the `/licenses/` hub, and the
catalog tier facet.

**DOIs & citation counts** are a second DB-owned axis, structured exactly like licenses. `catalog` +
`dataset_entries` carry `doi` + `doi_source` (`manual` = curator-verified; `auto` reserved). DB-only
(not in Markdown). To attach a DOI: add the tool/dataset's **associated-publication** DOI to
`site/scripts/db/dois-manual.json` (catalog by url, datasets by `ds:` id), then fold with
**`db:reseed-axes`**; papers need no entry (their DOI comes from the citation `raw`). **Verify every DOI against its source** before
adding it (Crossref title/author/year) — never guess; an entry with no genuine associated publication
stays blank. The OpenAlex `cited_by_count` is refreshed by the opt-in `pnpm --dir site fetch:citations`
(the same script now gathers catalog/dataset DOIs and selects `cited_by_count`) and folded at parse by
`citation-counts.ts`; the count is derived, never stored. `db:check` guards `doi_source` and manual-key
resolution. Surfaced as a "cited by N" badge on every card, the `/citations/` hub, and the catalog
"Most cited" facet. A coarse popularity signal, not a quality measure.

Topics are **two-tier**: a fixed 7-**theme** backbone + earned **fine tags** (each `tier='tag'` under
one `theme_slug`; theme and tag slugs share one namespace, so they must be disjoint). When tagging an
item, prefer an existing fine tag; mint a new fine tag only when ≥3 items cluster under it (curator
sign-off), and add new themes rarely and deliberately (they're defined in `Taxonomy.md`). `db:check`
guards the tiers.

IDs are **frozen**: assigned once, stored, and never changed on rename (a rename keeps the
id; that's the point). Paper ids reuse the numeric public anchor and are **never renumbered**
(the matrix and external bookmarks point at them). New paper = `max(ref_id) + 1`.

## Quick path — adding or removing one item

For a straight **add** or **remove**, use the one-command helpers (they assign the frozen
id, insert/delete correctly, run the guards, and regenerate NDJSON + Markdown):

```
pnpm --dir site db:add <descriptor.json>   # add a paper / tool / database / dataset row
pnpm --dir site db:remove <id>             # e.g. sw:oldtool, paper:123 (paper ids retired)
```

Descriptor examples (see `ItemAdd` in `site/scripts/db/mutate.ts`):

```json
{ "type": "database", "name": "RefMet", "url": "https://…", "group": "Pathways, Metabolism & Metabolic Models",
  "body": "Summary: …", "topics": ["metabolic-modeling"] }
{ "type": "paper", "raw": "Author, A. (2026). Title. *Journal*. https://doi.org/…", "label": "Author 2026",
  "cells": [{ "method": "Deep Learning", "area": "Media Optimization" }], "topics": ["media-optimization"] }
```

Then **review the diff and commit Markdown + NDJSON together**. The method/area/topic must
already exist (adding a new matrix row/column is a deliberate act — define it in `Taxonomy.md`
+ `Papers.md` first). For anything beyond a plain add/remove (editing an existing entry,
re-tagging, corrections), use the full procedure below.

## Procedure (full — for edits, corrections, bulk changes)

1. **Materialize the DB from the committed source** (the `.db` is gitignored):
   ```
   pnpm --dir site db:build      # site/db/ndjson/*.ndjson -> site/caail.db
   ```
2. **Make the change** — in the DB (`sqlite3 site/caail.db`) or, for a one-line change, by
   editing `site/db/ndjson/<table>.ndjson` directly and skipping to step 4.
   - **Add a paper:** insert `items('paper:N','paper','N')` + `papers(...)` with the full
     citation markdown (including the `<a id="N">N</a>` anchor) in `raw`, `code_url`/`data_url`
     if present; then insert its `matrix_cells` rows (one per method×area cell). **The matrix
     rows and the reference must change together** — the #1 CAAIL error. A primary paper must
     appear in ≥1 cell; a Review/Perspective goes in a non-`References` section and gets no cell.
   - **Add a tool/database:** insert `items` + `catalog(name,url,grp,body_md,ordinal)`; `name`
     is the inline markdown of the H3 link text, `body_md` the entry body.
   - **Add a curated dataset entry:** insert `items('ds:<slug>','dataset',…)` + `dataset_entries`
     with `page` (basename, e.g. `Chicken`), `section` (its H2), `kind` (atlas/gem/other),
     `heading_md` (raw H3 after `### `), `body_md`, and nullable `url`. Its `ds:` slug must not
     collide with any inventory row (`db:check` enforces a `dataset` item is in exactly one table).
   - **Tag topics:** insert `item_topics(item_id, topic_id)` (multi-tag is allowed and
     encouraged); add a new `topics` row + `aliases` if the subject is new.
3. **Export the DB back to NDJSON** (the tracked source):
   ```
   pnpm --dir site db:export     # site/caail.db -> site/db/ndjson/*.ndjson
   ```
4. **Regenerate the canonical Markdown:**
   ```
   pnpm --dir site db:emit       # NDJSON -> Papers.md / Software.md / Databases.md / Datasets/*.md
   ```
5. **Gate before commit** (all must pass):
   ```
   pnpm --dir site db:check      # id/RI integrity + matrix↔ref reachability + #81 column drift
   pnpm --dir site db:verify     # round-trip: emitted Markdown re-parses to identical models
   pnpm --dir site lint:papers   # matrix↔reference integrity on the emitted Papers.md
   pnpm --dir site test          # parser vitest suite
   pnpm --dir site parse         # regenerate data/*.json; asserts tallies + taxonomy coverage
   ```
6. **Review the judgment**, then **commit Markdown + NDJSON together** in one commit
   (`git diff -- Papers.md site/db/ndjson` should be internally consistent). Conventional
   scopes: `papers`, `software`, `databases`, `data`/`datasets`. No AI attribution in CAAIL
   commits/PRs.

## Known pitfalls

| Pitfall | Reality |
| --- | --- |
| Hand-editing `Papers.md` / `Software.md` / `Databases.md` structured content | It's DB-owned — clobbered by the next `db:emit` and fails the CI sync guard. Edit the DB. (The PreToolUse hook blocks it; prose-only edits are still allowed.) |
| Committing NDJSON without running `db:emit` | The CI sync guard (`git diff --exit-code`) fails: committed Markdown must equal the emit output. |
| Committing Markdown and NDJSON in separate commits | They move together — NDJSON is the source, Markdown is derived from it. |
| Editing `caail.db` but forgetting `db:export` | The `.db` is gitignored; only the NDJSON is tracked. Export or the change is lost. |
| Renumbering / reusing a `paper:N` id | Frozen and permanent (matrix links + external bookmarks). New paper = `max(ref_id)+1`; a removed paper's id is retired, not reused. |
| Adding a reference without a matrix cell (or a cell without the reference) | Same-commit rule; `db:check` reachability + `lint:papers` catch it. |
| Re-listing the matrix method rows in prose | They drift (see #81). The live set is `Papers.md`; only the 7 columns are enumerated + guarded. |
| Running `db:bootstrap` to fold a new license/DOI | Bootstrap re-derives topics from classifiers (reverting `db:add` curation) and renumbers ordinals (#100). Use `db:reseed-axes` for the license/DOI fold; reserve `db:bootstrap` for a full canonical-Markdown re-import. |

## CLI reference

```
pnpm --dir site db:add <file>  # add one item from a JSON descriptor (mutate -> check -> emit)
pnpm --dir site db:remove <id> # remove one item by frozen id (paper ids retired)
pnpm --dir site db:bootstrap   # one-time / re-import: canonical Markdown -> DB -> NDJSON
pnpm --dir site db:build       # NDJSON -> caail.db (materialize for editing/querying)
pnpm --dir site db:export      # caail.db -> NDJSON (after editing the DB)
pnpm --dir site db:reseed-axes # fold license/DOI from *-manual.json into NDJSON (safe; topics/ordinals intact)
pnpm --dir site db:emit        # NDJSON -> canonical Markdown (regenerate)
pnpm --dir site db:check       # integrity + drift guards (incl. license provenance)
pnpm --dir site db:verify      # round-trip fidelity oracle (re-parse == identical model)
pnpm --dir site db:fetch-licenses  # OPT-IN, networked: refresh the GitHub-SPDX license cache
```

All are Node-22-only and set `--experimental-sqlite` internally. Run `source ~/.nvm/nvm.sh &&
nvm use 22` first if the shell defaults to an older Node.
