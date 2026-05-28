---
name: zotero-collection-scope
description: Use when scoping a Zotero group library collection (or set of collections) for CAAIL ingest. Recursively enumerates items including sub-subcollections, pulls DOI + title + creators + abstract + data-availability evidence per item, cross-references against the current repo three ways, and produces a categorized actionable-vs-already-in-repo report. The Phase 1 (scoping) script for the `zotero-to-caail-sync` workflow.
---

# Scoping a Zotero collection for CAAIL ingest

## Overview

This skill answers *"what's in this Zotero collection that isn't yet in CAAIL?"*. It is **Phase 1** of a sync pass — the **mechanical enumeration**. Phase 2 (drafting and reviewer-gated commits) is owned by the sibling `zotero-to-caail-sync` skill, which consumes this report.

The output is a Markdown report (or JSON, with `--json`) listing every paper-type item across the requested collections, each tagged as:

- `IN_REPO (DOI)` — exact DOI substring match in the repo
- `IN_REPO (VARIANT)` — matched against an arXiv-suffix, bioRxiv-prefix, or Zenodo bare-ID variant of the DOI
- `IN_REPO (fuzzy)` — first-author surname + year + a long distinctive title word all co-occur within a citation-sized window
- `GAP` — none of the above matched; candidate for review
- `GAP (skill-rule?)` — GAP whose title contains a known tool name (COBRApy, MS-DIAL, Pathway Tools, etc.) that's already catalogued in `Software.md` / `Databases.md` — the reviewer should decide whether to apply the `zotero-to-caail-sync` "leave it" rule.
- `NO_DOI` — Zotero record lacks a DOI; cannot be auto-cross-referenced

Each GAP and `NO_DOI` item is followed by per-item evidence: full title, verbatim creators (first 8), date, venue, abstract (400-char excerpt), and — when a PDF attachment with a populated Zotero full-text cache exists — the paper's **Data Availability** snippet.

## When to use

- Starting a new sync pass and the source collection has not been enumerated before.
- A TUCCA member adds a new collection to a group library that should be considered for CAAIL inclusion.
- Reconciling drift between a group library and the repo when most of the work is already in-repo (small actionable list expected).
- As a quick pre-flight check before invoking `zotero-to-caail-sync` — gives the reviewer an upfront scope estimate so they can sequence the work.

## Procedure

1. **Preconditions.** Zotero desktop running, Preferences → Advanced → "Allow other applications…" enabled, the source group library synced locally.

2. **Find the group ID and collection keys.** List group libraries via the local API:

   ```bash
   curl -sS 'http://localhost:23119/api/users/0/groups' | python3 -m json.tool | head -40
   ```

   List top-level collections in a group via:

   ```bash
   curl -sS 'http://localhost:23119/api/groups/<GROUP_ID>/collections/top?limit=100' | python3 -m json.tool
   ```

   Or pass `--collection-name <NAME>` to `scope.py` and let it resolve.

3. **Run the script** against one or more target collections (the script recurses into subcollections automatically):

   ```bash
   python3 .claude/skills/zotero-collection-scope/scope.py \
     --group <GROUP_ID> \
     --collection <KEY1> [--collection <KEY2> ...]
   ```

   Add `--json` for a machine-readable report you can pipe into another tool.

4. **Read the report top-down**: header → totals → per-item table → per-item evidence (only for items not already in-repo) → summary of GAPS grouped by collection.

5. **Hand off to `zotero-to-caail-sync`** for Phase 2. The GAPS list is the Phase 1 deliverable; `zotero-to-caail-sync` is the workflow that classifies each gap, drafts an entry, dispatches the reviewer subagents, and commits.

## What scope.py does (one-paragraph summary)

For each requested collection: recursively walk the collection tree (Zotero's `/items` endpoint does *not* auto-recurse — see Known pitfalls). Pull every item that isn't an attachment or note. For each item, extract DOI, title, verbatim creators array, date, venue, and abstract. Find the first PDF attachment; if its `.zotero-ft-cache` exists in `~/Zotero/storage/<KEY>/`, regex-grep for `data availab|availability of data|code availab|data statement` and capture 300 chars of context. Cross-reference each DOI against the concatenated markdown of every CAAIL repo file three ways: (a) exact DOI substring, (b) arXiv-suffix / bioRxiv-prefix / Zenodo bare-ID variants, (c) fuzzy match requiring first-author surname + year + at least one ≥7-char distinctive title term to all co-occur within a citation-sized window (and ruling out continuation-author cases). Emit a Markdown or JSON report.

## Output structure

```text
# Zotero collection scope report

**Group:** <id>  **Collections scoped:** <names>
**Totals:** <N> distinct paper-type items (of <M> raw). In repo: <a> by DOI / <b> by author+year. GAPS: <c>. No-DOI: <d>.

## Items
| Status | DOI | First author · year | Title | Collections |
| ...

## Per-item evidence
### <KEY> — <DOI>
- Title, Authors (verbatim), Date / Venue, Abstract, Data availability...

## Summary: GAPS grouped by collection
### <Collection name> (<N> gaps)
- <DOI> | <author year> · <title>
```

## Known pitfalls

| Pitfall | Reality |
|---|---|
| `/collections/{key}/items` does NOT auto-recurse into subcollections. | The local Zotero API requires explicit subcollection traversal via `/collections/{key}/collections`. The script fixes this — but if you re-implement enumeration elsewhere, you'll miss items in any sub-subcollection. |
| Fuzzy matcher is intentionally conservative — false negatives expected. | A paper in-repo as a *data accession* (e.g. `GSE184128` in `Cow.md`) without the author surname in the inventory row will show as a **GAP**. That's by design: false positives (claiming a paper is in-repo when it's actually new) would silently skip real gaps. Human reviewer catches the false negatives at Phase 2. |
| `Hashizume 2025` ≠ Ozawa et al. 2025 (which has Hashizume as a co-author). | The matcher requires the surname to be in *first-author position*, not mid-list — rules out matches like "Ozawa, Y., Hashizume, T., ... (2025)" when scoping Hashizume's own 2025 first-author paper. |
| ft-cache may not exist yet for recently-added Zotero PDFs. | Zotero builds the full-text cache lazily. If the report shows "**PDF attached** (key X) — no ft-cache yet", open the paper in Zotero once to trigger indexing, or grep the PDF directly via `pdftotext`. |
| Title-only matching is too noisy without an author anchor. | The script does NOT match on title fragments alone. A paper called "single-cell RNA-seq of bovine satellite cells" would otherwise false-match against every similar inventory entry. The author+year+title-word combo is the minimum viable disambiguator. |
| Skill-rule "leave it" hint is a *prompt*, not a decision. | A `GAP (skill-rule?)` flag means the title mentions a tool already in Software.md/Databases.md, not that the paper is automatically off-limits. The reviewer decides per the `zotero-to-caail-sync` skill rules. |
| The script reads stdlib-only. | No `pip install` required. Runs on any Python 3.x with the Zotero local API reachable at `http://localhost:23119`. |
| Hand-typed identifiers feeding the downstream sync. | Every DOI / arXiv ID / accession / URL the report carries comes from Zotero — pass those forward; never type one from memory or hand-build a scan-input list. Liveness-check any URL before it lands in the repo (see `zotero-to-caail-sync`). |

## CLI reference

```text
usage: scope.py --group GROUP --collection COLLECTION [--collection COLLECTION ...]
                [--collection-name NAME ...] [--repo REPO] [--zotero-storage ZS]
                [--api API] [--json]

required:
  --group GROUP                Zotero group library ID (e.g. 5178481)
  --collection COLLECTION      Zotero collection key (repeatable)

optional:
  --collection-name NAME       Resolve a collection by display name (repeatable)
  --repo PATH                  CAAIL repo root (default: 3 levels up from script)
  --zotero-storage PATH        Path to Zotero/storage for PDF ft-caches
                               (default: ~/Zotero/storage)
  --api URL                    Local Zotero API base URL
                               (default: http://localhost:23119/api)
  --json                       Emit JSON instead of Markdown
```

## Example invocation

Scope one or more collections — repeat `--collection` per collection key; the
script recurses into subcollections automatically:

```bash
python3 .claude/skills/zotero-collection-scope/scope.py \
  --group <GROUP_ID> --collection <KEY> [--collection <KEY> ...]
```

The report's GAPS are the deliverable. The human reviewer then applies CAAIL-fit
judgment (skip out-of-scope DL, generic surveys, tool method papers already in
Software.md/Databases.md, etc.) to arrive at the actionable set for
`zotero-to-caail-sync`.

## Relationship to `zotero-to-caail-sync`

```
+---------------------------------+      +-----------------------------------+
| zotero-collection-scope         |  →   | zotero-to-caail-sync              |
| (Phase 1: enumeration)          |      | (Phase 2: classification + draft  |
|                                 |      |  + reviewer + commit)             |
| - Recursive collection walk     |      | - Per-gap classification          |
| - Per-item evidence pull        |      | - Verbatim citation from Zotero   |
| - 3-way repo cross-reference    |      | - caail-citation-reviewer subagent|
| - GAP / IN_REPO / NO_DOI report |      | - caail-claim-reviewer subagent   |
+---------------------------------+      | - Scoped commit per stage         |
                                         +-----------------------------------+
```

Either skill can run standalone; together they cover the full sync workflow.
