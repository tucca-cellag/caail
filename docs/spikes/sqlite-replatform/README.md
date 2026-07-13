# Spike: CAAIL SQLite re-platform (issue #78)

**Throwaway proof-of-concept.** Not wired into `site/`'s build; it never writes
canonical files (it regenerates into an OS temp dir and re-parses from there).
It exists to de-risk the design decisions recorded in the **ADR** (the pull
request description that introduces this spike, cross-posted to issue #78)
against real repo data *before* any migration code is written. The production
schema + ETL ship with the migration PR after the ADR is approved; this code is
reference evidence, not a foundation to build on.

## What it proves

| # | Surface | Assertion | Result |
|---|---------|-----------|--------|
| S1 | **Papers round-trip** | model → SQLite → regenerated Markdown → re-parse yields **byte-identical** `papers` JSON **and** `lint:papers` stays green | ✓ 280 refs, 59 cells, 229 citations; 0 lint errors |
| S2 | **Cross-content topic hub** | one `topics`/`item_topics`/`aliases` cluster produces the "Metabolic modeling: N papers, M tools, K databases, J datasets" join #78 exists to enable | ✓ 8 papers · 18 tools · 16 databases · 4 datasets = 46 items across 4 types |
| S3 | **Catalog frozen-slug + splice** | a Software.md group regenerated from the DB (hand-prose intro spliced with generated H3 entries) re-parses identical; a **rename does not change the frozen id** | ✓ 18 entries identical; `sw:cobrapy` survives rename |
| S4 | **Dataset row promotion** | a species inventory table's rows are promoted to first-class records with stable `ds:` ids and the table round-trips identically | ✓ 34 rows promoted; table re-parses identically |
| — | **NDJSON export/import** | per-table PK-sorted NDJSON (sqlite-diffable style) exports and re-imports to an identical DB | ✓ identical papers emit after round-trip |

## Key findings that shaped the ADR

- **JSON-identity holds even though the regenerated Markdown reflows.** The
  emitter's whitespace/table formatting differs completely from the hand-authored
  files, yet the parser flattens that away — confirming the DB should store
  *content* (raw citation markdown, cell membership, entry body markdown), not
  formatting, and derive everything else (APA fields, slugs, methods/areas,
  isPrimary, summary/summaryHtml) at parse time.
- **The parsers already accept a path argument** (`buildPapersModel(path)`,
  `parseCatalogFile(path, sourcePath)`), so the round-trip re-parse reuses the
  real, tested parser — the regeneration is validated by the production code, not
  a spike reimplementation.
- **Datasets have no site JSON contract** (only counts), so S4's bar is a
  self-consistent row-set round-trip rather than a JSON-equality check — matching
  the ADR's fidelity rule per content type.
- **Frozen slugs decouple identity from position/name**, which the current
  positional catalog slugger cannot do (S3's rename check).

## Run it

```bash
source ~/.nvm/nvm.sh && nvm use 22
NODE_OPTIONS='--experimental-sqlite --no-warnings' \
  pnpm --dir site exec tsx "$PWD/docs/spikes/sqlite-replatform/spike.ts"
```

Uses Node 22's built-in `node:sqlite` (experimental flag) — **no new dependency,
network-free**, matching the "no ops / deterministic build" rationale that chose
SQLite over a hosted DB. Reuses the existing `site/scripts/parser/` modules as
the ETL. `schema.sql` is the PoC DDL (the ADR's schema in runnable form).
