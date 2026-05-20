---
name: zotero-to-caail-sync
description: Use when new papers, datasets, tools, or resources have been added to the caail Zotero group library and the CAAIL repo needs to be brought back in sync — or when auditing/reconciling CAAIL against Zotero.
---

# Syncing the caail Zotero library into CAAIL

## Overview

The caail Zotero group library (ID `6549203`) drifts ahead of this repo:
members stash items there faster than they land in the markdown files. This
skill reconciles the two. **The mechanical steps are scripted; the judgment
steps are not — and the judgment is where it goes wrong.**

`CLAUDE.md` is the schema source of truth. This skill is the *workflow*; it
does not restate schema rules — read `CLAUDE.md` for them.

## Procedure

1. **Preconditions.** Zotero desktop running, Preferences → Advanced → "Allow
   other applications…" enabled, caail group synced locally.
2. **Run the diff script** — it paginates the whole library (it is >400 items,
   far past one API page), dedups within Zotero, and triages every item:
   ```bash
   python3 .claude/skills/zotero-to-caail-sync/zotero_diff.py
   ```
   `MISSING` = identifier and domain both absent (likely a real gap).
   `REVIEW` = the URL's domain is already in the repo (usually the same
   resource under a different link — confirm, do not assume).
3. **Verify every candidate by name**, not by the script's bucket. The script
   matches identifiers; it cannot know that `arxiv.org/abs/2410.23326` and
   `doi.org/10.48550/arXiv.2410.23326` are the same paper, or that a tool's
   homepage and its paper are one resource. Grep the repo for the tool/paper
   *name* before deciding.
4. **Classify** each genuine gap → target file (see rules below).
5. **Add** each item in its file's schema (per `CLAUDE.md`). For `Papers.md`,
   edit the matrix cell and the `## References` entry **in the same commit**.
6. **Integrity check** (see below), then commit with the repo's
   conventional-commit scopes (`papers`, `software`, `data`, `databases`,
   `resources`).

## Classification rules

| Item | Goes to |
|---|---|
| Paper applying an AI/ML **method** to a cell-ag problem | `Papers.md` matrix + `## References` |
| Benchmark paper | `Papers.md` **and** the benchmark triangle — see below |
| Signed review / position / perspective paper | `Papers.md` `## Reviews & Perspectives` (no matrix cell) |
| Journal **editorial / news / News & Views** (e.g. Nature `d41586-` DOIs, usually unsigned) | `OtherResources.md` `## Editorials & Opinion` — **never** `Papers.md` |
| Software / model / framework (`computerProgram`, or a paper whose subject is a tool that is *not* an AI method) | `Software.md` |
| Vendor **documentation** webpage | fold as a link into the existing `Software.md` entry for that tool — no standalone entry |
| Train-on data artifact | `Datasets.md` |
| Repository / ontology / registry / directory / "database" | `Databases.md` |
| Initiative / program / video / course | `OtherResources.md` |

**Benchmark triangle is mandatory** (`CLAUDE.md` "Benchmark placement"). A
benchmark gets a `Papers.md` ref **and** a `Datasets.md` entry for its data
**and** a `Databases.md` entry if it has a live leaderboard. The `Datasets.md`
entry does **not** require its own Zotero record — derive the canonical data
home (HF dataset / GitHub) yourself. Do not skip the triangle because "it is a
general-CS benchmark" or "there is no data record in Zotero."

A paper whose subject is a non-AI tool already catalogued in `Software.md`/
`Databases.md` (e.g. the MS-DIAL or COBRApy method paper) is **not** a
`Papers.md` gap — the tool is already represented. Leave it.

## Citations — extract, never recall

Build every APA citation from the Zotero item's `creators` array, copied
**verbatim**. Do not reconstruct author initials from memory — that fabricates
citations (a real, observed failure). APA 21+-author rule: list the first 19
authors, then `…`, then the final author. Journal italic with `*…*`; DOI as a
full `https://doi.org/…` URL.

## Same work, two DOIs

A work stashed as both an arXiv preprint and a published article has **two
different DOIs**, so the script cannot merge them — it reports both. Add the
work **once**, citing the peer-reviewed version; suppress the preprint.

## Integrity check (Papers.md)

- Every new reference ID appears in ≥1 matrix cell (or in Reviews & Perspectives).
- Every matrix `[…](#N)` anchor resolves to an existing `<a id="N">`.
- IDs are sequential from max+1; never renumber existing IDs.
- `grep -oE 'id="[0-9]+"' Papers.md | sort -nt'"' -k2` — no duplicates/gaps.

## Common mistakes

| Mistake | Reality |
|---|---|
| Querying `items/top?limit=100` once | The library is >400 items. Paginate, or the script does it for you. |
| Trusting the script's MISSING list as-is | It flags identifier mismatches as missing. Verify each by name. |
| Skipping the `Datasets.md`/`Databases.md` side of a benchmark | The triangle is mandatory; "general-CS benchmark" is not an exemption. |
| Filing a Nature `d41586-` editorial in `Papers.md` Reviews | Editorials/news → `OtherResources.md` `## Editorials & Opinion`. |
| Writing author initials from memory | Copy `creators` verbatim from the Zotero record. |
| Adding a reference without touching the matrix | Matrix + references change in one commit — the #1 CAAIL error. |
